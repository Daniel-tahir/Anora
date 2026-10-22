import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CheckoutItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().nullable().optional(),
  size: z.string().default(""),
  quantity: z.number().int().positive(),
});

const AddressSchema = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  line1: z.string().default(""),
  line2: z.string().optional().default(""),
  city: z.string().default(""),
  state: z.string().optional().default(""),
  postalCode: z.string().default(""),
  country: z.string().default(""),
  phone: z.string().default(""),
});

const PaymentIntentSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  email: z.string().min(1),
  accessToken: z.string().optional(),
  idempotencyKey: z.string().optional(),
  checkoutRequestId: z.string().optional(),
  couponCode: z.string().optional(),
});

const PayPalCreateSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  email: z.string().email(),
  accessToken: z.string().optional(),
  couponCode: z.string().optional(),
});

const PayPalCaptureSchema = z.object({
  paypalOrderId: z.string().min(1),
  accessToken: z.string().optional(),
  email: z.string().email(),
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  paymentMethod: z.string().default("paypal"),
  couponCode: z.string().optional(),
  discountAmount: z.number().optional(),
});

const StripeCheckoutSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  email: z.string().email(),
  accessToken: z.string().optional(),
});

const UpdatePaymentIntentSchema = z.object({
  paymentIntentId: z.string().min(1),
  clientSecret: z.string().min(10),
  email: z.string().email(),
  accessToken: z.string().optional(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
});

const CreateOrderSchema = z.object({
  paymentIntentId: z.string().min(1),
  accessToken: z.string().optional(),
});


async function getUserId(accessToken?: string): Promise<string | null> {
  if (!accessToken) return null;
  const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    throw new Error("Authentication required or session expired");
  }
  return userData.user.id;
}

export const createPaymentIntent = createServerFn({ method: "POST" })
  .validator(PaymentIntentSchema)
  .handler(async ({ data }) => {
    const {
      email,
      items,
      shippingAddress,
      billingAddress,
      accessToken,
      idempotencyKey,
      checkoutRequestId,
      couponCode,
    } = data;

    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("pi-create", 30, 600);

    const userId = await getUserId(accessToken);

    const { createPaymentIntent: serverCreatePaymentIntent } =
      await import("../../server/lib/payments");
    return await serverCreatePaymentIntent({
      userId,
      email,
      items,
      shippingAddress,
      billingAddress,
      idempotencyKey,
      checkoutRequestId,
      couponCode,
    });
  });

export const createPayPalOrder = createServerFn({ method: "POST" })
  .validator(PayPalCreateSchema)
  .handler(async ({ data }) => {
    const { items, accessToken, couponCode } = data;

    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("paypal-create", 20, 600);

    // Optional token validation (non-blocking for guest)
    if (accessToken) {
      await getUserId(accessToken);
    }

    const { createPayPalOrder: serverCreatePayPalOrder, buildPayPalQuote } =
      await import("../../server/lib/payments");
    const quote = await buildPayPalQuote(items, couponCode);

    return await serverCreatePayPalOrder({
      items: quote.validation.items.map((v) => ({
        name: v.productName,
        quantity: v.quantity,
        unitAmount: Math.round(v.unitPrice * 100),
        description: "",
      })),
      subtotal: quote.subtotalCents,
      discount: quote.discountCents,
      shipping: quote.shippingCents,
      tax: quote.taxCents,
    });
  });

export const capturePayPalOrder = createServerFn({ method: "POST" })
  .validator(z.object({ orderId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { capturePayPalOrder: serverCapturePayPal } = await import("../../server/lib/payments");
    return await serverCapturePayPal(data.orderId);
  });

export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .validator(StripeCheckoutSchema)
  .handler(async ({ data }) => {
    const { email, items, shippingAddress, billingAddress, accessToken } = data;

    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("stripe-session", 20, 600);

    const userId = await getUserId(accessToken);

    const { createStripeCheckoutSession: serverCreateSession } =
      await import("../../server/lib/payments");
    const baseUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

    return await serverCreateSession({
      userId,
      email,
      items,
      shippingAddress,
      billingAddress,
      successUrl: `${baseUrl}/order/success`,
      cancelUrl: `${baseUrl}/checkout?canceled=1`,
    });
  });

export const createOrder = createServerFn({ method: "POST" })
  .validator(CreateOrderSchema)
  .handler(async ({ data }) => {
    const { paymentIntentId } = data;
    const { createOrderFromPaymentIntent } = await import("../../server/lib/order-lifecycle");
    return await createOrderFromPaymentIntent({ paymentIntentId });
  });

export const createOrderFromPayPal = createServerFn({ method: "POST" })
  .validator(PayPalCaptureSchema)
  .handler(async ({ data }) => {
    // NOTE: `discountAmount` from the browser is intentionally ignored. Everything that affects the
    // price is recomputed on the server from database prices and the (server-validated) coupon.
    const { paypalOrderId, accessToken, email, items, shippingAddress, billingAddress, paymentMethod, couponCode } = data;

    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("paypal-order", 30, 600);

    const userId = await getUserId(accessToken);

    const { capturePayPalOrder: serverCapturePayPal, getPayPalOrderSummary, buildPayPalQuote, assertPayPalPaymentMatches } =
      await import("../../server/lib/payments");

    // 1. What should this cart cost? (database prices, server-side coupon maths)
    const quote = await buildPayPalQuote(items, couponCode);

    // 2. What did the customer actually approve at PayPal? Must match to the cent BEFORE we capture.
    const summary = await getPayPalOrderSummary(paypalOrderId);
    assertPayPalPaymentMatches(summary, quote.totalCents);

    // 3. Capture (idempotent: returns the existing result if the browser already captured it)
    const captureResult = await serverCapturePayPal(paypalOrderId);
    if (captureResult.status !== "COMPLETED") {
      throw new Error("PayPal payment could not be verified.");
    }
    const captured = captureResult.purchase_units?.[0]?.payments?.captures?.[0];
    if (captured?.amount?.value !== undefined && Math.round(Number(captured.amount.value) * 100) !== quote.totalCents) {
      throw new Error("PayPal captured amount does not match the cart total.");
    }

    // 4. Create the order from SERVER-VALIDATED items and prices
    const { createOrderFromPayPal: serverCreateFromPayPal } = await import("../../server/lib/order-lifecycle");
    return await serverCreateFromPayPal({
      userId,
      email,
      paypalOrderId,
      items: quote.validation.items.map((v) => ({
        productId: v.productId,
        variantId: v.variantId ?? null,
        size: v.size ?? "",
        quantity: v.quantity,
        unitPrice: v.unitPrice,
        productName: v.productName,
        imageUrl: v.imageUrl,
        color: v.color,
        variantName: v.variantName,
      })),
      shippingAddress: shippingAddress,
      billingAddress: billingAddress ?? shippingAddress,
      total: quote.totalCents / 100,
      paymentMethod,
      couponCode: quote.couponCode,
      discountAmount: quote.discountAmount,
    });
  });

export const updatePaymentIntent = createServerFn({ method: "POST" })
  .validator(UpdatePaymentIntentSchema)
  .handler(async ({ data }) => {
    const { paymentIntentId, clientSecret, email, shippingAddress, billingAddress } = data;

    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("pi-update", 40, 600);

    const { updatePaymentIntent: serverUpdatePaymentIntent, assertPaymentIntentAccess } =
      await import("../../server/lib/payments");
    await assertPaymentIntentAccess(paymentIntentId, clientSecret);
    return await serverUpdatePaymentIntent(paymentIntentId, {
      email,
      shippingAddress,
      billingAddress,
    });
  });

export function getStripePublishableKey(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY) {
    return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  }
  return "";
}

export const getPayPalClientId = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { env } = await import("../../server/config/env");
    return env.paypalClientId || "";
  } catch {
    return "";
  }
});

export function createCheckoutRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function formatAddress(address: any): string {
  if (!address) return "";

  if (typeof address === "string") {
    try {
      const parsed = JSON.parse(address);
      if (parsed && typeof parsed === "object") {
        return formatAddress(parsed);
      }
    } catch {
      return address.trim();
    }
  }

  const addr = address as Record<string, any>;

  const firstName = (addr.firstName || addr.first_name || "").trim();
  const lastName = (addr.lastName || addr.last_name || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ") || (addr.name || "").trim();

  const line1 = (addr.line1 || addr.address1 || addr.address || "").trim();
  const line2 = (addr.line2 || addr.address2 || "").trim();

  const city = (addr.city || "").trim();
  const state = (addr.state || "").trim();
  const postalCode = (addr.postalCode || addr.postal_code || addr.zip || "").trim();

  let cityStateZip = "";
  if (city && state && postalCode) {
    cityStateZip = `${city}, ${state} ${postalCode}`;
  } else if (city && postalCode) {
    cityStateZip = `${city}, ${postalCode}`;
  } else {
    cityStateZip = [city, state, postalCode].filter(Boolean).join(", ");
  }

  const country = (addr.country || "").trim();
  const phone = (addr.phone || "").trim();
  const phoneStr = phone ? `Phone: ${phone}` : "";

  return [
    name,
    line1,
    line2,
    cityStateZip,
    country,
    phoneStr
  ]
    .filter(Boolean)
    .join("\n");
}

const DownloadInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  accessToken: z.string().min(1),
});

export const getInvoicePdfUrl = createServerFn({ method: "POST" })
  .validator(DownloadInvoiceSchema)
  .handler(async ({ data }) => {
    const { invoiceId, accessToken } = data;

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { data: invoiceRec } = await supabaseAdmin
      .from("invoices")
      .select("customer_id, invoice_number")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!invoiceRec) throw new Error("Invoice not found");

    // Staff = any row in admin_roles (same definition as RLS is_staff() and verifyAdminAccess)
    const { data: staffRow } = await supabaseAdmin
      .from("admin_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const isStaff = !!staffRow;
    if (invoiceRec.customer_id !== userData.user.id && !isStaff) {
      throw new Error("Access denied");
    }

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    const signedUrl = await container.invoice.getPdfUrl(invoiceId);

    return { signedUrl, invoiceNumber: invoiceRec.invoice_number };
  });

const CalculateTaxSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  couponCode: z.string().optional(),
});

export const calculateTax = createServerFn({ method: "POST" })
  .validator(CalculateTaxSchema)
  .handler(async ({ data }) => {
    const { items, shippingAddress, couponCode } = data;
    const { enforceRateLimit } = await import("../../server/lib/security");
    await enforceRateLimit("tax-calc", 60, 600);
    const { calculateStripeTaxOnServer } = await import("../../server/lib/payments");
    return await calculateStripeTaxOnServer({ items, shippingAddress, couponCode });
  });
