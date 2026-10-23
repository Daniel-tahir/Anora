import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { createOrderFromPayment, createOrderFromPaymentIntent } from "../../../lib/order-lifecycle";
import { initContainer } from "../../../container";
import { env } from "../../../config/env";
import { logger } from "../../../lib/logger";
import { escapeHtml } from "../../../lib/security";

const WEBHOOK_LOCK_TTL_MS = 2 * 60 * 1000;

/**
 * Claims a Stripe event for processing. The claim is a single conditional UPDATE, so two concurrent
 * deliveries of the same event can never both proceed ("in_flight" tells the caller to ask Stripe
 * to retry later instead of processing twice).
 */
async function acquireWebhookEvent(
  supabase: any,
  eventId: string,
  eventType: string,
): Promise<{ status: "new" | "retry" | "duplicate" | "in_flight"; orderId?: string }> {
  const nowIso = new Date().toISOString();

  const { error: insertError } = await (supabase.from("webhook_events") as any).insert({
    event_id: eventId,
    event_type: eventType,
    status: "processing",
    processed_at: nowIso,
  });
  if (!insertError) return { status: "new" };
  if (insertError.code !== "23505") {
    throw createError({ statusCode: 500, statusMessage: "Failed to record webhook event" });
  }

  const { data: existing } = await (supabase.from("webhook_events") as any)
    .select("status, order_id, processed_at")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!existing) return { status: "in_flight" };
  if (existing.status === "completed") {
    return { status: "duplicate", orderId: existing.order_id ?? undefined };
  }

  const lastTouch = existing.processed_at ? new Date(existing.processed_at).getTime() : 0;
  if (existing.status === "processing" && Date.now() - lastTouch < WEBHOOK_LOCK_TTL_MS) {
    return { status: "in_flight" };
  }

  // failed, or a stale "processing" claim from a crashed instance: take over atomically
  let claim = (supabase.from("webhook_events") as any)
    .update({ status: "processing", processed_at: nowIso })
    .eq("event_id", eventId)
    .eq("status", existing.status);
  claim = existing.processed_at ? claim.eq("processed_at", existing.processed_at) : claim.is("processed_at", null);
  const { data: claimed } = await claim.select("event_id");
  return claimed && claimed.length > 0 ? { status: "retry" } : { status: "in_flight" };
}

async function finalizeWebhookEvent(
  supabase: any,
  eventId: string,
  status: "completed" | "failed",
  orderId?: string,
  errorMessage?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (orderId) update.order_id = orderId;
  if (errorMessage) update.error_message = errorMessage;
  await (supabase.from("webhook_events") as any).update(update).eq("event_id", eventId);
}

export default defineEventHandler(async (event) => {
  logger.info("Stripe Webhook: Event received");

  // Validate server configuration
  const webhookSecret = env.stripeWebhookSecret;
  if (!webhookSecret) {
    logger.error("Stripe Webhook: STRIPE_WEBHOOK_SECRET is not configured on the server");
    throw createError({
      statusCode: 500,
      statusMessage: "Webhook endpoint is not configured",
    });
  }

  // Gracefully initialize ServerContainer
  let container;
  try {
    container = await initContainer();
  } catch (err: any) {
    logger.error("Stripe Webhook: Failed to initialize ServerContainer", { error: err.message });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server configuration error",
    });
  }

  const { stripe, supabase } = container;
  if (!stripe || !supabase) {
    logger.error("Stripe Webhook: Required services are missing from container");
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server initialization error",
    });
  }

  const rawBody = await readRawBody(event, "utf8");
  const signature = getHeader(event, "stripe-signature");

  if (!rawBody || !signature) {
    logger.warn("Stripe Webhook: Missing request body or signature header");
    throw createError({
      statusCode: 400,
      statusMessage: "Missing request body or stripe-signature header",
    });
  }

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    logger.info("Stripe Webhook: Signature verified", {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
    });
  } catch (err: any) {
    logger.warn("Stripe Webhook: Signature verification failed", { error: err.message });
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid signature",
    });
  }

  const acquisition = await acquireWebhookEvent(supabase, stripeEvent.id, stripeEvent.type);
  if (acquisition.status === "in_flight") {
    // Another delivery of this event is being processed. 409 makes Stripe retry later.
    throw createError({ statusCode: 409, statusMessage: "Event is being processed" });
  }
  if (acquisition.status === "duplicate") {
    logger.info("Stripe Webhook: Duplicate event detected", {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
      orderId: acquisition.orderId,
    });
    return { received: true, duplicated: true, order_id: acquisition.orderId };
  }

  try {
    if (stripeEvent.type === "payment_intent.succeeded") {
      const paymentIntent = stripeEvent.data.object as any;
      const piId = paymentIntent.id as string;
      if (!piId) {
        throw new Error("Missing payment intent ID in Stripe payload");
      }

      logger.info("Stripe Webhook: Payment succeeded", {
        eventId: stripeEvent.id,
        paymentIntentId: piId,
      });

      const result = await createOrderFromPaymentIntent({ paymentIntentId: piId });
      if (!result.success) {
        // Paid, but the item sold out in the meantime: refund automatically instead of leaving the
        // customer charged with no order (and Stripe retrying a failure that can never succeed).
        if (/insufficient\s+(variant\s+)?stock/i.test(result.error ?? "")) {
          await container.stripe.refunds.create(
            {
              payment_intent: piId,
              reason: "requested_by_customer",
              metadata: { auto_refund: "insufficient_stock" },
            },
            { idempotencyKey: `oos-refund-${piId}` },
          );
          logger.warn("Stripe Webhook: Out of stock after payment - automatically refunded", { paymentIntentId: piId });
          try {
            await container.email.sendAdminNotification(
              "Automatic refund - item sold out during checkout",
              `<p>A customer paid but an item sold out before the order could be created. The payment <strong>${escapeHtml(
                piId,
              )}</strong> was refunded automatically in full.</p>`,
            );
          } catch (mailErr) {
            logger.warn("Stripe Webhook: Failed to send auto-refund notification", { error: String(mailErr) });
          }
          await finalizeWebhookEvent(supabase, stripeEvent.id, "completed", undefined, "auto_refunded_insufficient_stock");
          return { received: true, status: "auto_refunded_insufficient_stock" };
        }
        throw new Error(`Order creation failed: ${result.error}`);
      }

      await finalizeWebhookEvent(supabase, stripeEvent.id, "completed", result.orderId);
      logger.info("Stripe Webhook: Database event finalized", {
        eventId: stripeEvent.id,
        status: "completed",
        orderId: result.orderId,
      });

      return { received: true, order_id: result.orderId, order_number: result.orderNumber };
    }

    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object as any;
      if (!session.id) {
        throw new Error("Missing session ID in Stripe payload");
      }

      logger.info("Stripe Webhook: Checkout session completed", {
        eventId: stripeEvent.id,
        sessionId: session.id,
      });

      const metadata = (session.metadata ?? {}) as Record<string, string>;
      const userId = metadata.user_id;
      const email = metadata.email;
      const subtotal = parseFloat(metadata.subtotal ?? "0");
      const shippingAddressRaw = metadata.shipping_address;
      const billingAddressRaw = metadata.billing_address;
      const itemsRaw = metadata.validated_items;

      if (!userId || !email) {
        throw new Error("Missing user metadata (user_id/email) in session");
      }

      let items = [];
      try {
        if (itemsRaw) items = JSON.parse(itemsRaw);
      } catch {
        throw new Error("Invalid items metadata structure in session");
      }

      if (items.length === 0) {
        throw new Error("No items found in session metadata");
      }

      let shippingAddress: Record<string, string> = {};
      try {
        shippingAddress = shippingAddressRaw ? JSON.parse(shippingAddressRaw) : {};
      } catch {
        shippingAddress = {};
      }

      let billingAddress: Record<string, string> | undefined;
      if (billingAddressRaw) {
        try {
          billingAddress = JSON.parse(billingAddressRaw);
        } catch {
          /* ignore */
        }
      }

      const result = await createOrderFromPayment({
        userId,
        email,
        phone: shippingAddress.phone ?? "",
        subtotal,
        shippingAddress,
        billingAddress,
        items,
        stripeSessionId: session.id as string,
        stripePaymentIntentId: (session.payment_intent as string) ?? "",
        stripePaymentMethod: (session.mode as string) ?? "card",
      });

      if (!result.success) {
        throw new Error(`Order creation failed: ${result.error}`);
      }

      await finalizeWebhookEvent(supabase, stripeEvent.id, "completed", result.orderId);
      logger.info("Stripe Webhook: Database event finalized", {
        eventId: stripeEvent.id,
        status: "completed",
        orderId: result.orderId,
      });

      return { received: true, order_id: result.orderId, order_number: result.orderNumber };
    }

    if (stripeEvent.type === "payment_intent.payment_failed") {
      const paymentIntent = stripeEvent.data.object as any;
      logger.warn("Stripe Webhook: Payment failed", {
        eventId: stripeEvent.id,
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error,
      });

      await finalizeWebhookEvent(supabase, stripeEvent.id, "completed");
      return { received: true, status: "payment_failed" };
    }

    if (stripeEvent.type === "charge.refunded" || stripeEvent.type === "refund.updated") {
      const stripeObj = stripeEvent.data.object as any;
      const stripeRefundId = stripeEvent.type === "refund.updated" ? stripeObj.id : (stripeObj.refunds?.data?.[0]?.id);
      const paymentIntentId = stripeEvent.type === "refund.updated" ? stripeObj.payment_intent : stripeObj.payment_intent;
      const stripeRefundDbId = stripeEvent.type === "refund.updated"
        ? stripeObj.metadata?.refund_id
        : (stripeObj.refunds?.data?.[0]?.metadata?.refund_id);
      const refundStatus = stripeEvent.type === "refund.updated" ? stripeObj.status : (stripeObj.refunds?.data?.[0]?.status);

      logger.info("Stripe Webhook: Refund event received", {
        eventId: stripeEvent.id,
        eventType: stripeEvent.type,
        stripeRefundId,
        paymentIntentId,
        stripeRefundDbId,
        refundStatus,
      });

      if (refundStatus !== "succeeded") {
        logger.info("Stripe Webhook: Skipping refund completion because Stripe refund status is not succeeded", {
          eventId: stripeEvent.id,
          stripeRefundId,
          refundStatus,
        });
        await finalizeWebhookEvent(supabase, stripeEvent.id, "completed");
        return { received: true, status: `skipped_${refundStatus}` };
      }

      let refundRecord: any = null;
      const maxRetries = 5;
      let attempt = 0;

      while (attempt < maxRetries) {
        if (stripeRefundDbId) {
          const { data } = await (supabase as any)
            .from("refunds")
            .select("*, orders(*)")
            .eq("id", stripeRefundDbId)
            .maybeSingle();
          refundRecord = data;
        }

        if (!refundRecord && stripeRefundId) {
          const { data } = await (supabase as any)
            .from("refunds")
            .select("*, orders(*)")
            .eq("stripe_refund_id", stripeRefundId)
            .maybeSingle();
          refundRecord = data;
        }

        if (!refundRecord && paymentIntentId) {
          const { data: order } = await (supabase as any)
            .from("orders")
            .select("id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle();

          if (order) {
            const { data } = await (supabase as any)
              .from("refunds")
              .select("*, orders(*)")
              .eq("order_id", order.id)
              .in("status", ["pending", "approved", "awaiting_return", "received", "inspection_passed", "processing"])
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            refundRecord = data;
          }
        }

        if (refundRecord) {
          break;
        }

        attempt++;
        if (attempt < maxRetries) {
          const backoff = Math.pow(2, attempt) * 100;
          logger.info(`Stripe Webhook: Refund record not found. Retrying in ${backoff}ms... (Attempt ${attempt}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }

      if (refundRecord) {
        if (refundRecord.status === "completed") {
          logger.info("Stripe Webhook: Refund already completed. Skipping.", { refundId: refundRecord.id });
          await finalizeWebhookEvent(supabase, stripeEvent.id, "completed", refundRecord.order_id);
          return { received: true, status: "completed" };
        }

        // Delegate execution to RefundService.completeRefund for transactional safety
        try {
          await container.refund.completeRefund(
            refundRecord.id,
            "system",
            stripeRefundId || refundRecord.stripe_refund_id
          );
        } catch (completeErr: any) {
          logger.error("Stripe Webhook: Failed to complete refund in completeRefund()", {
            refundId: refundRecord.id,
            error: completeErr.message,
            stack: completeErr.stack,
          });
          throw completeErr; // Re-throw to fail the webhook execution appropriately
        }

        // Notify admin about refund completion
        try {
          const ordersData = Array.isArray(refundRecord.orders)
            ? refundRecord.orders[0]
            : refundRecord.orders;
          const orderNumber = ordersData?.order_number || "—";
          const adminHtml = `
            <p>Stripe has confirmed the refund of $${parseFloat(refundRecord.amount).toFixed(2)} for Order #${escapeHtml(orderNumber)}.</p>
            <p><strong>Refund Details:</strong></p>
            <ul>
              <li>Order Number: #${escapeHtml(orderNumber)}</li>
              <li>Refund ID: ${escapeHtml(refundRecord.id)}</li>
              <li>Amount Refunded: $${parseFloat(refundRecord.amount).toFixed(2)}</li>
              <li>Stripe Refund ID: ${escapeHtml(stripeRefundId)}</li>
            </ul>
          `;
          await container.email.sendAdminNotification(
            `Refund Completed — Order #${orderNumber}`,
            adminHtml,
            refundRecord.order_id
          );
          logger.info("Stripe Webhook: Admin refund completion notification sent successfully", {
            refundId: refundRecord.id,
          });
        } catch (adminEmailErr: any) {
          logger.warn("Stripe Webhook: Failed to send admin notification email", { error: adminEmailErr.message });
        }
      }

      await finalizeWebhookEvent(supabase, stripeEvent.id, "completed", refundRecord?.order_id);
      return { received: true, status: "refunded" };
    }

    // Default fallback for unhandled event types
    await finalizeWebhookEvent(supabase, stripeEvent.id, "completed");
    logger.info("Stripe Webhook: Database event finalized", {
      eventId: stripeEvent.id,
      status: "completed",
    });
    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await finalizeWebhookEvent(supabase, stripeEvent.id, "failed", undefined, message);
    logger.error("Stripe Webhook processing failed", {
      eventType: stripeEvent.type,
      error: message,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Webhook processing failed",
    });
  }
});
