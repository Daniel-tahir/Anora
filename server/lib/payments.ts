import crypto from "node:crypto";
import type Stripe from "stripe";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { PaymentError } from "../lib/errors";
import { getContainer } from "../container";
import { validateCartItems, type CartItemInput } from "./cart-validation";
import { calculateTotals } from "./totals";
import { calculateDiscountAmount } from "./discounts";

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
  userId: string | null;
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
    couponCode?: string;
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

  // Server-side Coupon validation & application
  let discountAmount = 0;
  if (input.couponCode) {
    const { validateCoupon } = await import("./cart-validation");
    const totalsTemp = calculateTotals(validation.items);
    const couponVal = await validateCoupon(input.couponCode, totalsTemp.subtotal);
    if (couponVal.ok) {
      discountAmount = calculateDiscountAmount(totalsTemp.subtotal, couponVal.discountType, couponVal.discountValue);
    } else {
      throw new PaymentError(couponVal.error ?? "Invalid coupon code");
    }
  }

  let taxAmount = 0;
  if (input.shippingAddress && input.shippingAddress.country && input.shippingAddress.state && input.shippingAddress.postalCode) {
    try {
      const taxResult = await calculateStripeTaxOnServer({
        items: input.items,
        shippingAddress: input.shippingAddress,
        couponCode: input.couponCode,
      });
      taxAmount = taxResult.taxAmount;
    } catch (err) {
      logger.warn("Initial tax calculation failed", { error: String(err) });
    }
  }

  const totals = calculateTotals(validation.items, { discountAmount });
  totals.tax = taxAmount;
  totals.total = Math.round((totals.subtotal - totals.discount + totals.shipping + totals.tax) * 100) / 100;
  const amountInCents = Math.round(totals.total * 100);

  const cartHash = validation.items
    .map((v) => `${v.productId}:${v.variantId || ""}:${v.size}:${v.quantity}`)
    .join(",");

  const metadata: Record<string, string> = {
    user_id: input.userId || "",
    email: input.email || "",
    cart_hash: cartHash.length > 200 ? cartHash.substring(0, 200) : cartHash,
    item_count: String(validation.items.length),
    currency: totals.currency,
    tax_amount: String(taxAmount),
  };

  if (input.couponCode) {
    metadata.coupon_code = input.couponCode;
    metadata.discount_amount = String(discountAmount);
  }

  if (input.checkoutRequestId) {
    metadata.checkout_request_id = input.checkoutRequestId;
  }

  // Only set receipt_email if the email is valid — during early init it may be a
  // non-email string and Stripe rejects invalid receipt_email values.
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email);

  const params: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: totals.currency,
    automatic_payment_methods: { enabled: true },
    metadata,
    ...(isValidEmail ? { receipt_email: input.email } : {}),
    shipping: {
      name:
        `${input.shippingAddress.firstName} ${input.shippingAddress.lastName}`.trim() || "Customer",
      address: {
        line1: input.shippingAddress.line1 || undefined,
        line2: input.shippingAddress.line2 || undefined,
        city: input.shippingAddress.city || undefined,
        state: input.shippingAddress.state || undefined,
        postal_code: input.shippingAddress.postalCode || undefined,
        country: input.shippingAddress.country || undefined,
      },
      phone: input.shippingAddress.phone || undefined,
    },
  };

  let paymentIntent: Stripe.Response<Stripe.PaymentIntent>;
  try {
    paymentIntent = await container.stripe.paymentIntents.create(params, {
      idempotencyKey: input.idempotencyKey,
    });
  } catch (stripeErr) {
    logger.error("Stripe PaymentIntent creation failed", {
      error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
      userId: input.userId || undefined,
    });
    throw stripeErr;
  }

  // Create payment session for checkout tracking
  if (input.checkoutRequestId) {
    try {
      const sessionTable = container.supabase.from("payment_sessions") as unknown as {
        upsert: (
          values: Record<string, unknown>,
          options?: { onConflict?: string; ignoreDuplicates?: boolean },
        ) => Promise<{ error: Error | null }>;
      };
      await sessionTable.upsert(
        {
          checkout_request_id: input.checkoutRequestId,
          user_id: input.userId || null,
          email: input.email,
          status: "created",
          payment_intent_id: paymentIntent.id,
          payment_method: "card",
          currency: totals.currency,
          amount: amountInCents,
          metadata: {
            shippingAddress: input.shippingAddress,
            billingAddress: input.billingAddress,
            items: validation.items.map((v) => ({
              productId: v.productId,
              variantId: v.variantId,
              size: v.size,
              quantity: v.quantity,
              unitPrice: v.unitPrice,
              productName: v.productName,
              imageUrl: v.imageUrl,
              color: v.color,
              variantName: v.variantName,
            })),
          },
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

/**
 * Proves the caller holds the PaymentIntent's client secret (i.e. is the checkout that created it)
 * and that the intent can still be modified. A bare PaymentIntent id is not enough.
 */
export async function assertPaymentIntentAccess(paymentIntentId: string, clientSecret: string): Promise<void> {
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId) || !clientSecret.startsWith(`${paymentIntentId}_secret_`)) {
    throw new PaymentError("Invalid payment session");
  }
  const { stripe } = getContainer();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const a = Buffer.from(intent.client_secret ?? "");
  const b = Buffer.from(clientSecret);
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new PaymentError("Invalid payment session");
  }
  if (!["requires_payment_method", "requires_confirmation", "requires_action"].includes(intent.status)) {
    throw new PaymentError("This payment can no longer be modified");
  }
}

export async function updatePaymentIntent(
  paymentIntentId: string,
  input: {
    email: string;
    shippingAddress: CheckoutAddress;
    billingAddress?: CheckoutAddress;
  },
): Promise<{ clientSecret: string; id: string }> {
  const container = getContainer();

  let couponCode: string | undefined = undefined;
  let discountAmount = 0;
  let existingItems: CheckoutItemInput[] = [];
  try {
    const sessionTable = container.supabase.from("payment_sessions") as unknown as {
      select: (columns?: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          maybeSingle: () => Promise<{ data: { metadata?: { items?: CheckoutItemInput[]; coupon_code?: string; discount_amount?: string } } | null }>;
        };
      };
    };
    const { data: existingSession } = await sessionTable
      .select("metadata")
      .eq("payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (existingSession?.metadata?.items) {
      existingItems = existingSession.metadata.items;
      couponCode = existingSession.metadata.coupon_code;
      discountAmount = Number(existingSession.metadata.discount_amount || 0);
    }
  } catch (err) {
    logger.warn("Failed to fetch existing payment session metadata", { error: String(err) });
  }

  let taxAmount = 0;
  if (existingItems.length > 0 && input.shippingAddress.country && input.shippingAddress.state && input.shippingAddress.postalCode) {
    try {
      const taxResult = await calculateStripeTaxOnServer({
        items: existingItems,
        shippingAddress: input.shippingAddress,
        couponCode,
      });
      taxAmount = taxResult.taxAmount;
    } catch (err) {
      logger.warn("Updated tax calculation failed", { error: String(err) });
    }
  }

  const itemsWithPrice: CartItemInput[] = existingItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    size: item.size,
    quantity: item.quantity,
  }));
  const validation = await validateCartItems(itemsWithPrice);
  if (!validation.ok) {
    throw new PaymentError(validation.error ?? "Cart validation failed");
  }

  const totals = calculateTotals(validation.items, { discountAmount });
  totals.tax = taxAmount;
  totals.total = Math.round((totals.subtotal - totals.discount + totals.shipping + totals.tax) * 100) / 100;
  const amountInCents = Math.round(totals.total * 100);

  const params: Stripe.PaymentIntentUpdateParams = {
    amount: amountInCents,
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
    metadata: {
      email: input.email,
      tax_amount: String(taxAmount),
    },
  };

  const paymentIntent = await container.stripe.paymentIntents.update(paymentIntentId, params);

  try {
    const sessionTable = container.supabase.from("payment_sessions") as unknown as {
      update: (values: {
        email: string;
        status: string;
        amount: number;
        metadata: {
          shippingAddress: CheckoutAddress;
          billingAddress: CheckoutAddress;
          items: unknown[];
          coupon_code?: string;
          discount_amount?: string;
          tax_amount?: string;
        };
      }) => {
        eq: (column: string, value: string) => Promise<{ error: Error | null }>;
      };
    };
    await sessionTable
      .update({
        email: input.email,
        status: "pending",
        amount: amountInCents,
        metadata: {
          shippingAddress: input.shippingAddress,
          billingAddress: input.billingAddress ?? input.shippingAddress,
          items: existingItems,
          coupon_code: couponCode,
          discount_amount: String(discountAmount),
          tax_amount: String(taxAmount),
        },
      })
      .eq("payment_intent_id", paymentIntentId);
  } catch (err) {
    logger.warn("Failed to update payment session address", { error: String(err) });
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    id: paymentIntent.id,
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

export interface PayPalQuote {
  validation: Awaited<ReturnType<typeof validateAndBuildLineItems>>["validation"];
  totals: ReturnType<typeof calculateTotals>;
  couponCode?: string;
  discountAmount: number; // dollars
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

/**
 * Server-side price quote for a PayPal checkout. Used both when the PayPal order is created and
 * when it is verified, so what the customer is asked to pay and what we accept are computed by the
 * same code from database prices - never from values supplied by the browser.
 */
export async function buildPayPalQuote(items: CheckoutItemInput[], couponCode?: string): Promise<PayPalQuote> {
  const { validation, totals } = await validateAndBuildLineItems(items);

  let discountAmount = 0;
  let appliedCoupon: string | undefined;
  if (couponCode) {
    const { validateCoupon } = await import("./cart-validation");
    const couponVal = await validateCoupon(couponCode, totals.subtotal);
    if (couponVal.ok) {
      discountAmount = calculateDiscountAmount(totals.subtotal, couponVal.discountType, couponVal.discountValue);
      appliedCoupon = couponCode;
    }
  }

  const subtotalCents = Math.round(totals.subtotal * 100);
  const discountCents = Math.min(Math.round(discountAmount * 100), subtotalCents);
  const shippingCents = Math.round(totals.shipping * 100);
  const taxCents = Math.round(totals.tax * 100);
  return {
    validation,
    totals,
    couponCode: appliedCoupon,
    discountAmount: discountCents / 100,
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents - discountCents + shippingCents + taxCents,
  };
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
  sessionParams.set("metadata[user_id]", input.userId || "");
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
    imageUrl: v.imageUrl,
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
  subtotal: number; // full item total, in cents (before discount)
  discount?: number; // cents
  shipping: number;
  tax: number;
}): Promise<PayPalCreateOrderResult> {
  const clientId = env.paypalClientId;
  const secret = env.paypalSecret;
  if (!clientId || !secret) {
    throw new PaymentError("PayPal is not configured");
  }

  const isProduction = env.paypalEnvironment === "production";
  const apiBase = isProduction ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new PaymentError("PayPal authentication failed");

  const discount = Math.max(0, Math.min(input.discount ?? 0, input.subtotal));
  const total = input.subtotal - discount + input.shipping + input.tax;

  const orderResponse = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      payment_source: {
        paypal: {
          experience_context: {
            payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",
          },
        },
      },
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
              discount: {
                currency_code: "USD",
                value: (discount / 100).toFixed(2),
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

async function getPayPalAccess(): Promise<{ apiBase: string; token: string }> {
  const clientId = env.paypalClientId;
  const secret = env.paypalSecret;
  if (!clientId || !secret) throw new PaymentError("PayPal is not configured");

  const isProduction = env.paypalEnvironment === "production";
  const apiBase = isProduction ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) throw new PaymentError("PayPal authentication failed");
  return { apiBase, token: tokenData.access_token };
}

export interface PayPalOrderSummary {
  id: string;
  status: string;
  currency: string;
  /** amount PayPal will charge / has charged, in cents */
  amountCents: number;
  purchase_units?: Array<{
    payments?: { captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code?: string } }> };
  }>;
}

const PAYPAL_ID_PATTERN = /^[A-Za-z0-9_-]{5,64}$/;

function toCents(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** Reads the PayPal order as PayPal sees it (the only trustworthy source for amount/status). */
export async function getPayPalOrderSummary(orderId: string): Promise<PayPalOrderSummary> {
  if (!PAYPAL_ID_PATTERN.test(orderId)) throw new PaymentError("Invalid PayPal order id");
  const { apiBase, token } = await getPayPalAccess();
  const res = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    purchase_units?: Array<{
      amount?: { value?: string; currency_code?: string };
      payments?: { captures?: Array<{ id: string; status: string; amount?: { value: string; currency_code?: string } }> };
    }>;
  };
  if (!res.ok || !data.id) throw new PaymentError("PayPal order could not be found");
  const unit = data.purchase_units?.[0];
  return {
    id: data.id,
    status: data.status ?? "UNKNOWN",
    currency: unit?.amount?.currency_code ?? "",
    amountCents: toCents(unit?.amount?.value),
    purchase_units: data.purchase_units as PayPalOrderSummary["purchase_units"],
  };
}

/**
 * Pure check used before and after capture: the PayPal order must be in USD, approved/completed and
 * for EXACTLY the server-computed total. Throws a customer-safe PaymentError otherwise.
 */
export function assertPayPalPaymentMatches(
  summary: Pick<PayPalOrderSummary, "status" | "currency" | "amountCents">,
  expectedCents: number,
): void {
  if (summary.currency !== "USD" || !Number.isFinite(summary.amountCents) || summary.amountCents !== expectedCents) {
    throw new PaymentError("PayPal payment does not match the cart total. Your card has not been charged.");
  }
  if (summary.status !== "APPROVED" && summary.status !== "COMPLETED") {
    throw new PaymentError("PayPal payment has not been approved.");
  }
}

export async function capturePayPalOrder(orderId: string): Promise<{
  status: string;
  id: string;
  purchase_units?: Array<{
    payments?: {
      captures?: Array<{ id: string; status: string; amount?: { value: string } }>;
    };
  }>;
}> {
  // Idempotent: the browser and the server may both reach this for the same order.
  const existing = await getPayPalOrderSummary(orderId);
  if (existing.status === "COMPLETED") {
    return { status: existing.status, id: existing.id, purchase_units: existing.purchase_units };
  }

  const { apiBase, token } = await getPayPalAccess();
  const captureResponse = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture-${orderId}`,
    },
  });

  const captureData = (await captureResponse.json()) as {
    status?: string;
    id?: string;
    purchase_units?: Array<{
      payments?: {
        captures?: Array<{ id: string; status: string; amount?: { value: string } }>;
      };
    }>;
  };

  if (!captureData.id) throw new PaymentError("PayPal capture failed");

  return {
    status: captureData.status ?? "UNKNOWN",
    id: captureData.id,
    purchase_units: captureData.purchase_units,
  };
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

export async function calculateStripeTaxOnServer(input: {
  items: CheckoutItemInput[];
  shippingAddress: CheckoutAddress;
  couponCode?: string;
}): Promise<{ taxAmount: number; currency: string }> {
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

  let discountAmount = 0;
  const totalsTemp = calculateTotals(validation.items);
  if (input.couponCode) {
    const { validateCoupon } = await import("./cart-validation");
    const couponVal = await validateCoupon(input.couponCode, totalsTemp.subtotal);
    if (couponVal.ok) {
      discountAmount = calculateDiscountAmount(totalsTemp.subtotal, couponVal.discountType, couponVal.discountValue);
    }
  }

  const { country, state, postalCode } = input.shippingAddress;
  const normalizedCountry = (country || "").trim().toUpperCase();
  const isUS = normalizedCountry === "US" || normalizedCountry === "USA" || normalizedCountry.includes("UNITED STATES");

  if (isUS && state && postalCode) {
    try {
      const container = getContainer();
      const subtotal = totalsTemp.subtotal;
      const stripeLineItems = validation.items.map((item, idx) => {
        const itemDiscount = subtotal > 0 ? (item.subtotal / subtotal) * discountAmount : 0;
        const discountedAmount = Math.max(0, item.subtotal - itemDiscount);
        return {
          amount: Math.round(discountedAmount * 100),
          reference: `item_${idx}_${item.productId}`,
          tax_behavior: "exclusive" as const,
        };
      });

      const taxCalculation = await container.stripe.tax.calculations.create({
        currency: "usd",
        line_items: stripeLineItems,
        customer_details: {
          address: {
            line1: input.shippingAddress.line1 || undefined,
            line2: input.shippingAddress.line2 || undefined,
            city: input.shippingAddress.city || undefined,
            state: state,
            postal_code: postalCode,
            country: "US",
          },
          address_source: "shipping",
        },
      });

      const taxAmount = (taxCalculation.tax_amount_exclusive || 0) / 100;
      return { taxAmount, currency: "usd" };
    } catch (stripeErr) {
      logger.error("Stripe Tax calculation failed", {
        error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
        shippingAddress: input.shippingAddress,
      });
      // Return 0 tax amount instead of throwing so checkout does not completely break
      return { taxAmount: 0, currency: "usd" };
    }
  }

  return { taxAmount: 0, currency: "usd" };
}
