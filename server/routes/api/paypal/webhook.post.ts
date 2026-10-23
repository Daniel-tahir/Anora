import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { createOrderFromPayPal } from "../../../lib/order-lifecycle";
import { env } from "../../../config/env";
import { initContainer } from "../../../container";
import { logger } from "../../../lib/logger";

async function acquireWebhookEvent(
  supabase: any,
  eventId: string,
  eventType: string,
): Promise<{ status: "new" | "retry" | "duplicate"; orderId?: string }> {
  const { data: existing } = await (supabase
    .from("webhook_events") as any)
    .select("status, order_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "completed") {
      return { status: "duplicate", orderId: existing.order_id ?? undefined };
    }
    await (supabase
      .from("webhook_events") as any)
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return { status: "retry" };
  }

  const { error: insertError } = await (supabase.from("webhook_events") as any).insert({
    event_id: eventId,
    event_type: eventType,
    status: "processing",
  });

  if (insertError && insertError.code === "23505") {
    const { data: race } = await (supabase
      .from("webhook_events") as any)
      .select("status, order_id")
      .eq("event_id", eventId)
      .maybeSingle();
    if (race?.status === "completed") {
      return { status: "duplicate", orderId: race.order_id ?? undefined };
    }
    return { status: "retry" };
  }

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: "Failed to record webhook event" });
  }

  return { status: "new" };
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

async function verifyPayPalWebhook(
  headers: Record<string, string>,
  body: string,
): Promise<boolean> {
  const webhookId = env.paypalWebhookId;
  if (!webhookId) {
    // Fail closed: an unsigned PayPal event must never be trusted (it could fake refunds/payments).
    logger.error("PayPal Webhook: PAYPAL_WEBHOOK_ID not configured — rejecting event");
    return false;
  }

  const authAlgo = headers["paypal-auth-algo"];
  const certUrl = headers["paypal-cert-url"];
  const transmissionId = headers["paypal-transmission-id"];
  const transmissionSig = headers["paypal-transmission-sig"];
  const transmissionTime = headers["paypal-transmission-time"];

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    logger.warn("PayPal Webhook: Missing required verification headers");
    return false;
  }

  const isProduction = env.paypalEnvironment === "production";
  const apiBase = isProduction ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  const clientId = env.paypalClientId;
  const secret = env.paypalSecret;
  if (!clientId || !secret) {
    logger.warn("PayPal Webhook: PAYPAL_CLIENT_ID or PAYPAL_SECRET not configured — signature verification impossible");
    return false;
  }

  try {
    const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenResponse.ok) {
      logger.error("PayPal Webhook: OAuth token fetch failed", { status: tokenResponse.status });
      return false;
    }

    const tokenData = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenData.access_token) return false;

    const verificationBody = {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: JSON.parse(body),
    };

    const verifyResponse = await fetch(
      `${apiBase}/v1/notifications/verify-webhook-signature`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(verificationBody),
      },
    );

    if (!verifyResponse.ok) {
      logger.error("PayPal Webhook: Signature verification endpoint returned error", { status: verifyResponse.status });
      return false;
    }

    const verifyData = (await verifyResponse.json()) as { verification_status?: string };
    return verifyData.verification_status === "SUCCESS";
  } catch (err) {
    logger.error("PayPal Webhook: Verification request failed", { error: String(err) });
    return false;
  }
}

export default defineEventHandler(async (event) => {
  logger.info("PayPal Webhook: Event received");

  // Gracefully initialize ServerContainer
  let container;
  try {
    container = await initContainer();
  } catch (err: any) {
    logger.error("PayPal Webhook: Failed to initialize ServerContainer", { error: err.message });
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server configuration error",
    });
  }

  const { supabase } = container;
  if (!supabase) {
    logger.error("PayPal Webhook: Required services are missing from container");
    throw createError({
      statusCode: 500,
      statusMessage: "Internal server initialization error",
    });
  }

  const rawBody = await readRawBody(event, "utf8");
  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: "Missing request body" });
  }

  const headers: Record<string, string> = {};
  for (const key of ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"]) {
    const val = getHeader(event, key);
    if (val) headers[key] = String(val);
  }

  if (!env.paypalWebhookId) {
    throw createError({ statusCode: 503, statusMessage: "Webhook endpoint is not configured" });
  }
  const verified = await verifyPayPalWebhook(headers, rawBody);
  if (!verified) {
    logger.warn("PayPal Webhook: Signature verification failed");
    throw createError({ statusCode: 400, statusMessage: "Invalid PayPal webhook signature" });
  }
  logger.info("PayPal Webhook: Signature verified");

  const parsed = JSON.parse(rawBody) as {
    id?: string;
    event_type?: string;
    resource?: Record<string, unknown>;
  };

  if (!parsed.id || !parsed.event_type) {
    throw createError({ statusCode: 400, statusMessage: "Invalid webhook payload" });
  }

  const acquisition = await acquireWebhookEvent(supabase, parsed.id, parsed.event_type);
  if (acquisition.status === "duplicate") {
    logger.info("PayPal Webhook: Duplicate event detected", {
      eventId: parsed.id,
      eventType: parsed.event_type,
      orderId: acquisition.orderId,
    });
    return { received: true, duplicated: true, order_id: acquisition.orderId };
  }

  try {
    if (parsed.event_type === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = parsed.resource as Record<string, unknown> | undefined;
      if (!resource) {
        throw new Error("Invalid capture resource data");
      }

      // PayPal puts the checkout order id in supplementary_data.related_ids.order_id
      const related = (resource.supplementary_data as { related_ids?: { order_id?: string } } | undefined)?.related_ids;
      const paypalOrderId = related?.order_id ?? (resource.custom_id as string | undefined);
      if (!paypalOrderId) {
        logger.info("PayPal Webhook: Capture completed without an order id (nothing to create)", {
          resourceId: resource.id,
        });
        await finalizeWebhookEvent(supabase, parsed.id, "completed");
        return { received: true, skipped: true, reason: "no_order_id" };
      }

      logger.info("PayPal Webhook: Payment succeeded", { eventId: parsed.id, paypalOrderId, resourceId: resource.id });

      // The server remembered what this checkout was for when the PayPal order was created.
      const { data: session } = await (supabase.from("paypal_checkout_sessions") as any)
        .select("*")
        .eq("paypal_order_id", paypalOrderId)
        .maybeSingle();

      if (!session) {
        // e.g. a payment started before this feature existed; the browser flow handles those.
        logger.warn("PayPal Webhook: No stored checkout session for capture", { paypalOrderId });
        await finalizeWebhookEvent(supabase, parsed.id, "completed");
        return { received: true, skipped: true, reason: "no_session" };
      }

      // The captured money must equal what the server asked for.
      const amount = resource.amount as { value?: string; currency_code?: string } | undefined;
      const capturedCents = Math.round(Number(amount?.value) * 100);
      if (amount?.currency_code !== "USD" || capturedCents !== session.total_cents) {
        throw new Error("Captured amount does not match the stored checkout total");
      }

      // Idempotent: if the browser already created the order this returns the existing one.
      const { createOrderFromPayPal } = await import("../../../lib/order-lifecycle");
      const result = await createOrderFromPayPal({
        userId: session.user_id ?? null,
        email: session.email,
        paypalOrderId,
        items: session.items,
        shippingAddress: session.shipping_address,
        billingAddress: session.billing_address ?? session.shipping_address,
        total: session.total_cents / 100,
        paymentMethod: session.payment_method,
        couponCode: session.coupon_code ?? undefined,
        discountAmount: Number(session.discount_amount ?? 0),
      });
      if (!result.success) {
        throw new Error(`Order creation failed: ${result.error}`);
      }

      await finalizeWebhookEvent(supabase, parsed.id, "completed", result.orderId);
      return { received: true, status: "completed", paypal_order_id: paypalOrderId, order_id: result.orderId };
    }

    if (parsed.event_type === "PAYMENT.CAPTURE.DENIED") {
      const resource = parsed.resource as Record<string, unknown> | undefined;
      logger.warn("PayPal Webhook: Payment failed", {
        eventId: parsed.id,
        resourceId: resource?.id,
        reason: resource?.status_details,
      });

      await finalizeWebhookEvent(supabase, parsed.id, "completed");
      logger.info("PayPal Webhook: Database event finalized", { eventId: parsed.id, status: "completed" });
      return { received: true, status: "denied" };
    }

    if (parsed.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const resource = parsed.resource as Record<string, unknown> | undefined;
      logger.info("PayPal Webhook: Refund received", {
        eventId: parsed.id,
        resourceId: resource?.id,
        amount: resource?.amount,
      });

      const captureId = resource?.capture_id as string | undefined;
      const paypalRefundId = resource?.id as string | undefined;
      let orderId: string | undefined;
      let orderNumber = "—";

      if (captureId) {
        try {
          const isProduction = env.paypalEnvironment === "production";
          const apiBase = isProduction ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
          const clientId = env.paypalClientId;
          const secret = env.paypalSecret;

          // 1. Get Access Token
          const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          const tokenData = (await tokenResponse.json()) as { access_token?: string };

          if (tokenData.access_token) {
            // 2. Fetch Capture Details
            const captureResponse = await fetch(`${apiBase}/v2/payments/captures/${captureId}`, {
              headers: { Authorization: `Bearer ${tokenData.access_token}` }
            });
            const captureData = (await captureResponse.json()) as { custom_id?: string };
            const paypalOrderId = captureData.custom_id;

            if (paypalOrderId) {
              const { data: order } = await (supabase as any)
                .from("orders")
                .select("id, order_number")
                .eq("paypal_order_id", paypalOrderId)
                .maybeSingle();

              if (order) {
                orderId = order.id;
                orderNumber = order.order_number || "—";
              }
            }
          }
        } catch (err) {
          logger.error("PayPal Webhook: Failed to resolve order via capture fetch", { error: String(err) });
        }
      }

      if (orderId) {
        const { data: refundRecord } = await (supabase as any)
          .from("refunds")
          .select("id, status, amount")
          .eq("order_id", orderId)
          .in("status", ["pending", "approved", "awaiting_return", "received", "inspection_passed", "processing"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (refundRecord) {
          if (refundRecord.status !== "completed") {
            await container.refund.completeRefund(
              refundRecord.id,
              "system",
              paypalRefundId || refundRecord.stripe_refund_id
            );
          }
        }
      }

      await finalizeWebhookEvent(supabase, parsed.id, "completed", orderId);
      logger.info("PayPal Webhook: Database event finalized", { eventId: parsed.id, status: "completed" });
      return { received: true, status: "refunded", order_id: orderId };
    }

    // Default fallback for other events
    await finalizeWebhookEvent(supabase, parsed.id, "completed");
    logger.info("PayPal Webhook: Database event finalized", {
      eventId: parsed.id,
      status: "completed",
    });
    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await finalizeWebhookEvent(supabase, parsed.id, "failed", undefined, message);
    logger.error("PayPal Webhook processing failed", {
      eventType: parsed.event_type,
      error: message,
    });
    throw createError({
      statusCode: 500,
      statusMessage: "Webhook processing failed",
    });
  }
});
