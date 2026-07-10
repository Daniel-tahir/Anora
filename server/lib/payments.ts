import crypto from "node:crypto";
import type Stripe from "stripe";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { PaymentError } from "../lib/errors";
import { getContainer } from "../container";
import { validateCartItems, type CartItemInput } from "./cart-validation";
import { calculateTotals } from "./totals";

export interface CheckoutItemInput {
  productId: string;
  variantId?: string | null;
  size?: string;
  quantity: number;
}

export interface CheckoutAddress {
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface CreateCheckoutSessionInput {
  userId: string;
  email: string;
  items: CheckoutItemInput[];
  shippingAddress: CheckoutAddress;
  billingAddress?: CheckoutAddress;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

export interface CreatePaymentIntentResult {
  clientSecret: string;
  id: string;
  amount: number;
  paymentMethodTypes: string[];
  validatedItems: Array<{
    productId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    size: string;
    variantId: string | null;
  }>;
  totals: {
    subtotal: number;
    shipping: number;
    tax: number;
    discount: number;
    total: number;
    currency: string;
  };
}

export interface PayPalCreateOrderResult {
  id: string;
  approveUrl: string;
}

export async function createPaymentIntent(
  input: CreateCheckoutSessionInput & {
    idempotencyKey?: string;
    checkoutRequestId?: string;
    browser?: string;
    ipAddress?: string;
    deviceType?: string;
  },
): Promise<CreatePaymentIntentResult> {
  const container = getContainer();

  const itemsWithPrice: CartItemInput[] = input.items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    size: item.size,
    quantity: item.quantity,
  }));

  const validation = await validateCartItems(itemsWithPrice);
  if (!validation.ok) {
    throw new PaymentError(validation.error ?? "Cart validation failed");
  }

  const totals = calculateTotals(validation.items);
  const amountInCents = Math.round(totals.total * 100);

  const metadata: Record<string, string> = {
    user_id: input.userId,
    email: input.email,
    subtotal: String(totals.subtotal),
    total: String(totals.total),
    currency: totals.currency,
    shipping_address: JSON.stringify(input.shippingAddress),
    validated_items: JSON.stringify(
      validation.items.map((v) => ({
        productId: v.productId,
        variantId: v.variantId,
        size: v.size,
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        productName: v.productName,
      })),
    ),
  };

  if (input.billingAddress) {
    metadata.billing_address = JSON.stringify(input.billingAddress);
  }
  if (input.checkoutRequestId) {
    metadata.checkout_request_id = input.checkoutRequestId;
  }

  const params: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: totals.currency,
    automatic_payment_methods: { enabled: true },
    metadata,
    receipt_email: input.email,
    shipping: {
      name: `${input.shippingAddress.firstName} ${input.shippingAddress.lastName}`,
      address: {
        line1: input.shippingAddress.line1,
        line2: input.shippingAddress.line2,
        city: input.shippingAddress.city,
        state: input.shippingAddress.state,
        postal_code: input.shippingAddress.postalCode,
        country: input.shippingAddress.country,
      },
      phone: input.shippingAddress.phone,
    },
  };

  const paymentIntent = await container.stripe.paymentIntents.create(params, {
    idempotencyKey: input.idempotencyKey,
  });

  // Create payment session for checkout tracking
  if (input.checkoutRequestId) {
    try {
      await container.supabase.from("payment_sessions").upsert(
        {
          checkout_request_id: input.checkoutRequestId,
          user_id: input.userId,
          email: input.email,
          status: "pending",
          payment_intent_id: paymentIntent.id,
          payment_method: "card",
          currency: totals.currency,
          amount: amountInCents,
          metadata: {},
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          browser: input.browser ?? null,
          ip_address: input.ipAddress ?? null,
          device_type: input.deviceType ?? null,
        },
        { onConflict: "checkout_request_id", ignoreDuplicates: false },
      );
    } catch (sessionErr) {
      logger.warn("Failed to create payment session", { error: String(sessionErr) });
    }
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    paymentMethodTypes: paymentIntent.payment_method_types as string[],
    validatedItems: validation.items.map((v) => ({
      productId: v.productId,
      name: v.productName,
      unitPrice: v.unitPrice,
      quantity: v.quantity,
      size: v.size,
      variantId: v.variantId,
    })),
    totals,
  };
}

export async function validateAndBuildLineItems(items: CheckoutItemInput[]) {
  const itemsWithPrice: CartItemInput[] = items.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    size: item.size,
    quantity: item.quantity,
  }));

  const validation = await validateCartItems(itemsWithPrice);

  if (!validation.ok) {
    throw new PaymentError(validation.error ?? "Cart validation failed");
  }

  return { validation, totals: calculateTotals(validation.items) };
}

export async function createStripeCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  const { validation, totals } = await validateAndBuildLineItems(input.items);
  const publicUrl = env.publicAppUrl;

  const sessionParams = new URLSearchParams();
  sessionParams.set("mode", "payment");
  sessionParams.set("success_url", input.successUrl || `${publicUrl}/order/success`);
  sessionParams.set("cancel_url", input.cancelUrl || `${publicUrl}/checkout?canceled=1`);
  sessionParams.set("customer_email", input.email);
  sessionParams.set("automatic_payment_methods[enabled]", "true");
  sessionParams.set("shipping_address_collection[allowed_countries][]", "US");
  sessionParams.set("metadata[user_id]", input.userId);
  sessionParams.set("metadata[email]", input.email);
  sessionParams.set("metadata[subtotal]", String(totals.subtotal));
  sessionParams.set("metadata[total]", String(totals.total));
  sessionParams.set("metadata[shipping_address]", JSON.stringify(input.shippingAddress));
  if (input.billingAddress) {
    sessionParams.set("metadata[billing_address]", JSON.stringify(input.billingAddress));
  }

  const itemsMeta = validation.items.map((v) => ({
    productId: v.productId,
    variantId: v.variantId,
    size: v.size,
    quantity: v.quantity,
    unitPrice: v.unitPrice,
    productName: v.productName,
  }));
  sessionParams.set("metadata[validated_items]", JSON.stringify(itemsMeta));

  validation.items.forEach((v, index) => {
    sessionParams.set(`line_items[${index}][quantity]`, String(v.quantity));
    sessionParams.set(`line_items[${index}][price_data][currency]`, totals.currency);
    sessionParams.set(
      `line_items[${index}][price_data][unit_amount]`,
      String(Math.round(v.unitPrice * 100)),
    );
    sessionParams.set(`line_items[${index}][price_data][product_data][name]`, v.productName);
  });

  const secretKey = env.stripeSecretKey;
  if (!secretKey) throw new PaymentError("Stripe secret key is not configured");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: sessionParams,
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload.error === "object" && payload.error !== null && "message" in payload.error
        ? String((payload.error as { message?: string }).message ?? "Stripe request failed")
        : "Stripe request failed";
    throw new PaymentError(message);
  }

  const stripeSession = payload as unknown as {
    id: string;
    url: string | null;
    payment_intent: string | null;
  };

  if (!stripeSession.id || !stripeSession.url) {
    throw new PaymentError("Stripe session creation failed");
  }

  return { checkoutUrl: stripeSession.url };
}

export async function createPayPalOrder(input: {
  items: Array<{
    name: string;
    quantity: number;
    unitAmount: number;
    description?: string;
  }>;
  subtotal: number;
  shipping: number;
  tax: number;
}): Promise<PayPalCreateOrderResult> {
  const clientId = env.paypalClientId;
  const secret = env.paypalSecret;
  if (!clientId || !secret) {
    throw new PaymentError("PayPal is not configured");
  }

  const tokenResponse = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new PaymentError("PayPal authentication failed");

  const total = input.subtotal + input.shipping + input.tax;

  const orderResponse = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: "USD",
            value: (total / 100).toFixed(2),
            breakdown: {
              item_total: {
                currency_code: "USD",
                value: (input.subtotal / 100).toFixed(2),
              },
              shipping: {
                currency_code: "USD",
                value: (input.shipping / 100).toFixed(2),
              },
              tax_total: {
                currency_code: "USD",
                value: (input.tax / 100).toFixed(2),
              },
            },
          },
          items: input.items.map((item) => ({
            name: item.name,
            quantity: String(item.quantity),
            unit_amount: {
              currency_code: "USD",
              value: (item.unitAmount / 100).toFixed(2),
            },
            description: item.description,
          })),
        },
      ],
    }),
  });

  const orderData = (await orderResponse.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
  };

  if (!orderData.id) throw new PaymentError("PayPal order creation failed");

  const approveLink = orderData.links?.find((l) => l.rel === "approve")?.href;
  if (!approveLink) throw new PaymentError("PayPal approval link not found");

  return { id: orderData.id, approveUrl: approveLink };
}

export async function capturePayPalOrder(orderId: string): Promise<{ status: string; id: string }> {
  const clientId = env.paypalClientId;
  const secret = env.paypalSecret;
  if (!clientId || !secret) throw new PaymentError("PayPal is not configured");

  const tokenResponse = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new PaymentError("PayPal authentication failed");

  const captureResponse = await fetch(
    `https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const captureData = (await captureResponse.json()) as {
    status?: string;
    id?: string;
  };

  if (!captureData.id) throw new PaymentError("PayPal capture failed");

  return { status: captureData.status ?? "UNKNOWN", id: captureData.id };
}

function hmacSha256(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  const webhookSecret = env.stripeWebhookSecret;
  if (!webhookSecret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    }),
  );

  const timestamp = parts.t;
  const receivedSignature = parts.v1;
  if (!timestamp || !receivedSignature) return false;

  const expected = hmacSha256(`${timestamp}.${payload}`, webhookSecret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignature);
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  const currentWindow = Math.abs(Date.now() / 1000 - Number(timestamp));
  return currentWindow <= 300 && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}
