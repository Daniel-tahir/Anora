import { createError, defineEventHandler, getHeader, readRawBody } from "h3";
import { verifyStripeWebhookSignature } from "../../../lib/payments";
import { createOrderFromPayment, createOrderFromPaymentIntent } from "../../../lib/order-lifecycle";
import { getContainer } from "../../../container";
import { logger } from "../../../lib/logger";

async function acquireWebhookEvent(
  eventId: string,
  eventType: string,
): Promise<{ status: "new" | "retry" | "duplicate"; orderId?: string }> {
  const { supabase } = getContainer();

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("status, order_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing) {
    if (existing.status === "completed") {
      return { status: "duplicate", orderId: existing.order_id ?? undefined };
    }
    await supabase
      .from("webhook_events")
      .update({ status: "processing", processed_at: new Date().toISOString() })
      .eq("event_id", eventId);
    return { status: "retry" };
  }

  const { error: insertError } = await supabase.from("webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    status: "processing",
  });

  if (insertError && insertError.code === "23505") {
    const { data: race } = await supabase
      .from("webhook_events")
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
  eventId: string,
  status: "completed" | "failed",
  orderId?: string,
  errorMessage?: string,
): Promise<void> {
  const { supabase } = getContainer();
  const update: Record<string, unknown> = {
    status,
    processed_at: new Date().toISOString(),
  };
  if (orderId) update.order_id = orderId;
  if (errorMessage) update.error_message = errorMessage;
  await supabase.from("webhook_events").update(update).eq("event_id", eventId);
}

export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, "utf8");
  const signature = getHeader(event, "stripe-signature");

  if (!rawBody || !verifyStripeWebhookSignature(rawBody, signature)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Stripe signature" });
  }

  const parsed = JSON.parse(rawBody) as {
    id?: string;
    type?: string;
    data?: { object?: Record<string, unknown> };
  };

  if (!parsed.id || !parsed.type) {
    throw createError({ statusCode: 400, statusMessage: "Invalid webhook payload" });
  }

  const acquisition = await acquireWebhookEvent(parsed.id, parsed.type);
  if (acquisition.status === "duplicate") {
    return { received: true, duplicated: true, order_id: acquisition.orderId };
  }

  try {
    if (parsed.type === "payment_intent.succeeded") {
      const paymentIntent = parsed.data?.object as Record<string, unknown> | undefined;
      if (!paymentIntent) {
        throw createError({ statusCode: 400, statusMessage: "Invalid payment intent data" });
      }

      const piId = paymentIntent.id as string;
      if (!piId) {
        throw createError({ statusCode: 400, statusMessage: "Missing payment intent ID" });
      }

      const result = await createOrderFromPaymentIntent({ paymentIntentId: piId });

      if (!result.success) {
        throw createError({
          statusCode: 500,
          statusMessage: `Order creation failed: ${result.error}`,
        });
      }

      await finalizeWebhookEvent(parsed.id, "completed", result.orderId);
      logger.info("Webhook: order created from PI", { orderId: result.orderId, piId });

      return { received: true, order_id: result.orderId, order_number: result.orderNumber };
    }

    if (parsed.type === "checkout.session.completed") {
      const session = parsed.data?.object as Record<string, unknown> | undefined;
      if (!session) {
        throw createError({ statusCode: 400, statusMessage: "Invalid session data" });
      }

      const metadata = (session.metadata ?? {}) as Record<string, string>;
      const userId = metadata.user_id;
      const email = metadata.email;
      const subtotal = parseFloat(metadata.subtotal ?? "0");
      const shippingAddressRaw = metadata.shipping_address;
      const billingAddressRaw = metadata.billing_address;
      const itemsRaw = metadata.validated_items;

      if (!userId || !email) {
        throw createError({ statusCode: 400, statusMessage: "Missing user metadata" });
      }

      let items: Array<{
        productId: string;
        variantId?: string | null;
        size: string;
        quantity: number;
        unitPrice: number;
        productName: string;
        imageUrl?: string;
      }> = [];

      try {
        if (itemsRaw) items = JSON.parse(itemsRaw);
      } catch {
        throw createError({ statusCode: 400, statusMessage: "Invalid items metadata" });
      }

      if (items.length === 0) {
        throw createError({ statusCode: 400, statusMessage: "No items in session metadata" });
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
        throw createError({
          statusCode: 500,
          statusMessage: `Order creation failed: ${result.error}`,
        });
      }

      await finalizeWebhookEvent(parsed.id, "completed", result.orderId);
      logger.info("Webhook: order created from session", {
        orderId: result.orderId,
        sessionId: session.id,
      });

      return { received: true, order_id: result.orderId, order_number: result.orderNumber };
    }

    await finalizeWebhookEvent(parsed.id, "completed");
    return { received: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await finalizeWebhookEvent(parsed.id, "failed", undefined, message);
    logger.error("Webhook processing failed", { eventType: parsed.type, error: message });
    throw err;
  }
});
