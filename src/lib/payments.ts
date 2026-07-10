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
  email: z.string().email(),
  accessToken: z.string().min(1),
  idempotencyKey: z.string().optional(),
  checkoutRequestId: z.string().optional(),
});

const PayPalCreateSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  email: z.string().email(),
  accessToken: z.string().min(1),
});

const StripeCheckoutSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.optional(),
  email: z.string().email(),
  accessToken: z.string().min(1),
});

const CreateOrderSchema = z.object({
  paymentIntentId: z.string().min(1),
  accessToken: z.string().min(1),
});

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
    } = data;

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { createPaymentIntent: serverCreatePaymentIntent } =
      await import("../../server/lib/payments");
    return await serverCreatePaymentIntent({
      userId: userData.user.id,
      email,
      items,
      shippingAddress,
      billingAddress,
      idempotencyKey,
      checkoutRequestId,
    });
  });

export const createPayPalOrder = createServerFn({ method: "POST" })
  .validator(PayPalCreateSchema)
  .handler(async ({ data }) => {
    const { email, items, shippingAddress, billingAddress, accessToken } = data;

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { createPayPalOrder: serverCreatePayPalOrder, validateAndBuildLineItems } =
      await import("../../server/lib/payments");
    const { validation, totals } = await validateAndBuildLineItems(items);

    return await serverCreatePayPalOrder({
      items: validation.items.map((v) => ({
        name: v.productName,
        quantity: v.quantity,
        unitAmount: Math.round(v.unitPrice * 100),
        description: "",
      })),
      subtotal: Math.round(totals.subtotal * 100),
      shipping: Math.round(totals.shipping * 100),
      tax: Math.round(totals.tax * 100),
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

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { createStripeCheckoutSession: serverCreateSession } =
      await import("../../server/lib/payments");
    const baseUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:5173";

    return await serverCreateSession({
      userId: userData.user.id,
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
    const { paymentIntentId, accessToken } = data;

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { createOrderFromPaymentIntent } = await import("../../server/lib/order-lifecycle");
    return await createOrderFromPaymentIntent({ paymentIntentId });
  });

export const createOrderFromPayPal = createServerFn({ method: "POST" })
  .validator(z.object({ paypalOrderId: z.string().min(1), accessToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { paypalOrderId, accessToken } = data;

    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) throw new Error("Authentication required");

    const { capturePayPalOrder: serverCapture } = await import("../../server/lib/payments");
    const capture = await serverCapture(paypalOrderId);
    if (capture.status !== "COMPLETED") throw new Error("PayPal payment not completed");

    const { createOrderFromPaymentIntent } = await import("../../server/lib/order-lifecycle");
    return await createOrderFromPaymentIntent({ paymentIntentId: capture.id });
  });

export function getStripePublishableKey(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY) {
    return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  }
  return "";
}

export function createCheckoutRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
