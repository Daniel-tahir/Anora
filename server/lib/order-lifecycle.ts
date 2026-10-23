import { getContainer } from "../container";
import { logger } from "../lib/logger";
import { PaymentError, NotFoundError } from "../lib/errors";
import { validateCartItems, type CartItemInput } from "./cart-validation";
import { calculateTotals } from "./totals";
import {
  buildAdminNotificationHtml,
  buildInvoiceEmailHtml,
  buildThankYouHtml,
  type EmailItem,
} from "../templates";
import { formatAddress } from "../../src/lib/payments";

export interface OrderCreationResult {
  success: boolean;
  error?: string;
  orderId?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  invoiceId?: string;
}

export interface OrderCreationInput {
  userId?: string | null;
  email: string;
  phone?: string;
  subtotal: number;
  shippingAddress: Record<string, string>;
  billingAddress?: Record<string, string>;
  items: Array<{
    productId: string;
    variantId?: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    productName: string;
    imageUrl?: string;
  }>;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  stripePaymentMethod: string;
}

export interface PaymentIntentCreationInput {
  paymentIntentId: string;
}

export interface PayPalOrderCreationInput {
  userId?: string | null;
  email: string;
  paypalOrderId: string;
  items: Array<{
    productId: string;
    variantId: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    productName: string;
    imageUrl?: string;
    color?: string;
    variantName?: string;
  }>;
  shippingAddress: Record<string, string>;
  billingAddress: Record<string, string>;
  total: number;
  paymentMethod: string;
  couponCode?: string;
  discountAmount?: number;
}

type EmailPayloadInput = {
  orderId: string;
  invoiceId: string;
  customerEmail: string;
  customerProfile?: { firstName?: string | null; lastName?: string | null; displayName?: string | null } | null;
  phone: string;
  orderNumber: string;
  invoiceNumber: string;
  orderDate: string;
  billingAddress: Record<string, string>;
  shippingAddress: Record<string, string>;
  items: EmailItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  trackingId?: string;
  discount?: number;
  shippingMethodName?: string;
};

function estimatedDeliveryFrom(orderDateIso: string): string {
  const deliveryDate = new Date(orderDateIso);
  deliveryDate.setDate(deliveryDate.getDate() + 7);
  return deliveryDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildEmailPayload(input: EmailPayloadInput): Record<string, unknown> {
  const shippingAddressText = formatAddress(input.shippingAddress);
  const billingAddressText = formatAddress(input.billingAddress);

  const customerNameInput = {
    firstName: input.customerProfile?.firstName,
    lastName: input.customerProfile?.lastName,
    displayName: input.customerProfile?.displayName,
    shippingAddress: {
      firstName: input.shippingAddress.firstName,
      lastName: input.shippingAddress.lastName
    },
    billingAddress: {
      firstName: input.billingAddress.firstName,
      lastName: input.billingAddress.lastName
    },
    email: input.customerEmail
  };

  return {
    ...input,
    shippingAddressText,
    billingAddressText,
    thankYouHtml: buildThankYouHtml({
      customer: customerNameInput,
      orderNumber: input.orderNumber,
      orderDate: input.orderDate,
      items: input.items,
      subtotal: input.subtotal,
      shippingAddress: shippingAddressText,
      billingAddress: billingAddressText,
      estimatedDelivery: estimatedDeliveryFrom(input.orderDate),
      shipping: input.shipping,
      tax: input.tax,
      total: input.total,
      paymentMethod: input.paymentMethod,
      trackingId: input.trackingId,
      invoiceNumber: input.invoiceNumber,
      discount: input.discount,
      shippingMethodName: input.shippingMethodName,
    }),
    invoiceEmailHtml: buildInvoiceEmailHtml({
      customer: customerNameInput,
      invoiceNumber: input.invoiceNumber,
      orderNumber: input.orderNumber,
      orderDate: input.orderDate,
      billingAddress: billingAddressText,
      shippingAddress: shippingAddressText,
      items: input.items,
      subtotal: input.subtotal,
      shipping: input.shipping,
      tax: input.tax,
      total: input.total,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
    }),
    adminSubject: `New order ${input.orderNumber}`,
    adminHtml: buildAdminNotificationHtml({
      customer: customerNameInput,
      customerEmail: input.customerEmail,
      phone: input.phone,
      orderNumber: input.orderNumber,
      invoiceNumber: input.invoiceNumber,
      amountPaid: input.total,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      shippingAddress: shippingAddressText,
      items: input.items,
      total: input.total,
      orderTime: input.orderDate,
    }),
  };
}

async function nextOrderNumber(): Promise<string> {
  const { supabase } = getContainer();
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc("next_order_number");
  if (error || !data) {
    throw new Error("Failed to generate order number");
  }
  return `AN-${year}-${String(Number(data)).padStart(6, "0")}`;
}

async function nextInvoiceNumber(): Promise<string> {
  const { supabase } = getContainer();
  const year = new Date().getFullYear();
  const { data, error } = await supabase.rpc("next_invoice_number");
  if (error || !data) {
    throw new Error("Failed to generate invoice number");
  }
  return `INV-${year}-${String(Number(data)).padStart(6, "0")}`;
}

async function verifyPaymentIntent(paymentIntentId: string): Promise<{
  ok: boolean;
  userId?: string | null;
  email?: string;
  subtotal?: number;
  shippingAddress?: Record<string, string>;
  billingAddress?: Record<string, string>;
  items?: Array<{
    productId: string;
    variantId?: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    productName: string;
    imageUrl?: string;
    color?: string;
    variantName?: string;
  }>;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  checkoutRequestId?: string;
  couponCode?: string;
  discountAmount?: number;
  error?: string;
}> {
  const { stripe, supabase } = getContainer();

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });

    if (pi.status !== "succeeded") {
      return {
        ok: false,
        error: `Payment not completed: ${pi.status}`,
      };
    }

    const metadata = pi.metadata ?? {};
    const checkoutRequestId = metadata.checkout_request_id;
    let userId = metadata.user_id || undefined;
    let email = metadata.email || pi.receipt_email || undefined;
    let subtotal = parseFloat(metadata.subtotal ?? "0");

    // Fetch rich session payload (cart items & addresses) from DB
    let sessionData: any = null;
    if (paymentIntentId || checkoutRequestId) {
      let sessionQuery = (supabase.from("payment_sessions") as any).select("*");
      if (paymentIntentId) {
        sessionQuery = sessionQuery.eq("payment_intent_id", paymentIntentId);
      } else if (checkoutRequestId) {
        sessionQuery = sessionQuery.eq("checkout_request_id", checkoutRequestId);
      }
      const { data } = await sessionQuery.maybeSingle();
      sessionData = data;
    }

    if (sessionData) {
      if (!userId && sessionData.user_id) userId = sessionData.user_id;
      if (!email && sessionData.email) email = sessionData.email;
    }

    if (!email) {
      return { ok: false, error: "PaymentIntent missing customer email metadata" };
    }

    let shippingAddress: Record<string, string> = sessionData?.metadata?.shippingAddress || {};
    if (Object.keys(shippingAddress).length === 0 && pi.shipping) {
      const ship = pi.shipping;
      const [firstName, ...lastNames] = (ship.name || "").split(" ");
      shippingAddress = {
        firstName: firstName || "",
        lastName: lastNames.join(" ") || "",
        line1: ship.address?.line1 || "",
        line2: ship.address?.line2 || "",
        city: ship.address?.city || "",
        state: ship.address?.state || "",
        postalCode: ship.address?.postal_code || "",
        country: ship.address?.country || "",
        phone: ship.phone || "",
      };
    }

    let billingAddress: Record<string, string> | undefined = sessionData?.metadata?.billingAddress || shippingAddress;

    let items: Array<{
      productId: string;
      variantId?: string | null;
      size: string;
      quantity: number;
      unitPrice: number;
      productName: string;
      imageUrl?: string;
      color?: string;
      variantName?: string;
    }> = sessionData?.metadata?.items || [];

    if (items.length === 0 && metadata.validated_items) {
      try {
        items = JSON.parse(metadata.validated_items);
      } catch {
        /* ignore */
      }
    }

    if (items.length === 0) {
      return { ok: false, error: "No order items found for PaymentIntent" };
    }

    if (!subtotal || subtotal === 0) {
      subtotal = items.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.quantity || 1), 0);
    }

    const charge = (pi.latest_charge as any) as Record<string, unknown> | undefined;
    const paymentMethodDetails = charge?.payment_method_details as
      | Record<string, unknown>
      | undefined;
    const methodType = (paymentMethodDetails?.type as string) ?? "card";

    return {
      ok: true,
      userId,
      email,
      subtotal,
      shippingAddress,
      billingAddress,
      items,
      paymentMethod: methodType,
      amount: pi.amount_received ?? 0,
      currency: pi.currency ?? "usd",
      checkoutRequestId: metadata.checkout_request_id || undefined,
      couponCode: metadata.coupon_code || undefined,
      discountAmount: metadata.discount_amount ? parseFloat(metadata.discount_amount) : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Stripe verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

async function verifyStripePayment(stripeSessionId: string): Promise<{
  ok: boolean;
  paymentIntentId?: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  error?: string;
}> {
  const { stripe } = getContainer();

  try {
    const session = await stripe.checkout.sessions.retrieve(stripeSessionId, {
      expand: ["payment_intent"],
    });

    const paymentIntent = (session.payment_intent as any) as Record<string, unknown> | undefined;

    if (!paymentIntent) {
      return { ok: false, error: "No payment intent found for session" };
    }

    const paymentStatus = paymentIntent.status as string;
    if (paymentStatus !== "succeeded" && paymentStatus !== "processing") {
      return {
        ok: false,
        error: `Payment not completed: ${paymentStatus}`,
      };
    }

    const charges = paymentIntent.charges as Record<string, unknown> | undefined;
    const chargeData = charges?.data as Array<Record<string, unknown>> | undefined;
    const paymentMethodDetails = chargeData?.[0]?.payment_method_details as
      | Record<string, unknown>
      | undefined;
    const methodType = (paymentMethodDetails?.type as string) ?? "card";

    return {
      ok: true,
      paymentIntentId: paymentIntent.id as string,
      paymentMethod: methodType,
      amount: (paymentIntent.amount_received as number) ?? 0,
      currency: (paymentIntent.currency as string) ?? "usd",
    };
  } catch (err) {
    return {
      ok: false,
      error: `Stripe verification failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export interface CheckoutPipelineParams {
  userId?: string | null;
  email: string;
  phone?: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    size: string;
    quantity: number;
    unitPrice: number;
    productName: string;
    imageUrl?: string;
    color?: string;
    variantName?: string;
  }>;
  shippingAddress: Record<string, string>;
  billingAddress: Record<string, string>;
  total: number;
  paymentMethod: string;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  paypalOrderId?: string;
  checkoutRequestId?: string | null;
  couponCode?: string;
  discountAmount?: number;
}

export async function runCheckoutPipeline(
  params: CheckoutPipelineParams,
): Promise<OrderCreationResult> {
  const { supabase, queue } = getContainer();

  logger.info("Transaction Started", {
    userId: params.userId ?? undefined,
    paymentMethod: params.paymentMethod,
    stripePaymentIntentId: params.stripePaymentIntentId,
    paypalOrderId: params.paypalOrderId,
  });

  try {
    const orderNumber = await nextOrderNumber();
    const invoiceNumber = await nextInvoiceNumber();

    const orderItems = params.items.map((item) => {
      const attrs: Record<string, string> = {};
      if (item.size) attrs.size = item.size;
      return {
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        name: item.productName,
        price: item.unitPrice,
        quantity: item.quantity,
        image_url: item.imageUrl ?? null,
        attributes: JSON.stringify(attrs),
      };
    });

    const shippingAddressJson = JSON.stringify(params.shippingAddress);
    const billingAddressJson = JSON.stringify(params.billingAddress);
    const stripePaymentIntentId =
      params.stripePaymentIntentId ??
      (params.paypalOrderId ? `paypal_${params.paypalOrderId}` : "");

    const { data: rpcResult, error: rpcError } = await (supabase.rpc as any)(
      "create_order_from_payment",
      {
        p_user_id: params.userId || null,
        p_order_number: orderNumber,
        p_subtotal: params.total,
        p_total: params.total,
        p_shipping_address: shippingAddressJson,
        p_billing_address: billingAddressJson,
        p_stripe_session_id: params.stripeSessionId || "",
        p_stripe_payment_intent_id: stripePaymentIntentId,
        p_payment_method: params.paymentMethod,
        p_currency: "usd",
        p_amount: params.total,
        p_invoice_number: invoiceNumber,
        p_items: JSON.stringify(orderItems),
        p_checkout_request_id: params.checkoutRequestId ?? null,
        p_email: params.email || null,
      },
    );

    if (rpcError) {
      const isDuplicatePaymentIntent =
        rpcError.code === "23505" &&
        (rpcError.message?.includes("idx_orders_stripe_payment_intent_id") ||
         rpcError.details?.includes("idx_orders_stripe_payment_intent_id"));

      if (isDuplicatePaymentIntent) {
        logger.info("Concurrency race recovery: order already created by another thread", {
          stripePaymentIntentId,
        });

        const { data: existingOrder } = await (supabase.from("orders") as any)
          .select("id, order_number")
          .eq("stripe_payment_intent_id", stripePaymentIntentId)
          .maybeSingle();

        if (existingOrder) {
          const { data: invoiceRecord } = await (supabase.from("invoices") as any)
            .select("id, invoice_number")
            .eq("order_id", existingOrder.id)
            .maybeSingle();

          return {
            success: true,
            orderId: existingOrder.id,
            orderNumber: existingOrder.order_number ?? undefined,
            invoiceNumber: invoiceRecord?.invoice_number ?? undefined,
            invoiceId: invoiceRecord?.id ?? undefined,
          };
        }
      }

      logger.warn("Rollback", { error: rpcError.message });
      return { success: false, error: `Database error: ${rpcError.message}` };
    }

    const result = rpcResult as Record<string, unknown>;
    if (!result?.success) {
      logger.warn("Rollback", { error: result?.error });
      return {
        success: false,
        error: (result?.error as string) ?? "Failed to create order",
      };
    }

    const orderId = result.order_id as string;
    const outInvoiceNumber = (result.invoice_number as string) ?? invoiceNumber;
    const invoiceId = (result.invoice_id as string) ?? "";

    logger.info("Transaction Committed", { orderId, orderNumber, invoiceId });

    // Authoritative Server-side Tax calculation and database write
    let calculatedTax = 0;
    const isUS = params.shippingAddress?.country && (
      params.shippingAddress.country.trim().toUpperCase() === "US" ||
      params.shippingAddress.country.trim().toUpperCase() === "USA" ||
      params.shippingAddress.country.trim().toUpperCase().includes("UNITED STATES")
    );

    if (isUS && params.shippingAddress?.state && (params.shippingAddress?.postalCode || params.shippingAddress?.postal_code)) {
      try {
        const { calculateStripeTaxOnServer } = await import("./payments");
        const taxResult = await calculateStripeTaxOnServer({
          items: params.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            size: i.size,
            quantity: i.quantity,
          })),
          shippingAddress: {
            firstName: params.shippingAddress.first_name || params.shippingAddress.firstName || "",
            lastName: params.shippingAddress.last_name || params.shippingAddress.lastName || "",
            line1: params.shippingAddress.line1 || "",
            line2: params.shippingAddress.line2 || "",
            city: params.shippingAddress.city || "",
            state: params.shippingAddress.state || "",
            postalCode: params.shippingAddress.postal_code || params.shippingAddress.postalCode || "",
            country: "US",
            phone: params.shippingAddress.phone || "",
          },
          couponCode: params.couponCode,
        });
        calculatedTax = taxResult.taxAmount;
      } catch (err) {
        logger.warn("Server-side order tax calculation failed", { error: String(err) });
      }
    }

    // Update orders table with tax_amount, subtotal, and total
    const dbSubtotal = params.total - calculatedTax + (params.discountAmount || 0);

    try {
      await (supabase.from("orders") as any)
        .update({
          tax_amount: calculatedTax,
          subtotal: dbSubtotal,
          total: params.total,
        })
        .eq("id", orderId);

      // Update invoices table with tax_amount and subtotal/total_amount
      await (supabase.from("invoices") as any)
        .update({
          tax_amount: calculatedTax,
          subtotal: dbSubtotal,
          total_amount: params.total,
        })
        .eq("order_id", orderId);
    } catch (err) {
      logger.error("Failed to update tax_amount on order or invoice record", { error: String(err), orderId });
    }

    // Server-side Coupon Verification & Redemption
    if (params.couponCode) {
      try {
        const { data: coupon } = await (supabase.from("coupons") as any)
          .select("id, max_uses, used_count")
          .eq("code", params.couponCode.toUpperCase())
          .eq("is_active", true)
          .maybeSingle();

        if (coupon) {
          const discountAmt = params.discountAmount || 0;

          // 1. Atomically increment coupon usage count
          const { data: counted } = await (supabase as any).rpc("increment_coupon_usage", {
            p_code: params.couponCode,
          });
          if (counted === false) {
            // The customer has already paid, so the order stands; flag it for the admin to review.
            logger.warn("Coupon usage limit reached at redemption time (race)", { couponId: coupon.id, orderId });
          }

          // 2. Insert redemption log only if user is authenticated
          if (params.userId) {
            await (supabase.from("coupon_redemptions") as any).insert({
              coupon_id: coupon.id,
              user_id: params.userId,
              order_id: orderId,
              discount_amount: discountAmt,
            });
          }

          // 3. Update orders table details
          await (supabase.from("orders") as any)
            .update({
              coupon_code: params.couponCode.toUpperCase(),
              discount_amount: discountAmt,
            })
            .eq("id", orderId);

          logger.info("Coupon redeemed and order updated successfully", {
            orderId,
            couponCode: params.couponCode,
            discountAmt,
          });
        }
      } catch (err: any) {
        logger.error("Failed to redeem coupon during checkout pipeline commit", {
          error: err.message,
          orderId,
          couponCode: params.couponCode,
        });
      }
    }

    // Fetch actual order details to get final subtotal, discount, total, shipping, etc.
    let subtotal = params.total;
    let shippingCost = 0;
    let discountVal = 0;
    let taxVal = 0;
    let grandTotal = params.total;
    let shippingMethodName = "Standard Delivery";

    try {
      const { data: orderDetails } = await (supabase.from("orders") as any)
        .select("subtotal, shipping_cost, discount, total, shipping_method, tax_amount")
        .eq("id", orderId)
        .maybeSingle();

      if (orderDetails) {
        subtotal = Number(orderDetails.subtotal);
        shippingCost = Number(orderDetails.shipping_cost);
        discountVal = Number(orderDetails.discount);
        taxVal = Number(orderDetails.tax_amount || 0);
        grandTotal = Number(orderDetails.total);
        if (orderDetails.shipping_method === "express") {
          shippingMethodName = "Express Delivery";
        } else if (shippingCost === 0) {
          shippingMethodName = "Complimentary Shipping";
        }
      }
    } catch (err) {
      logger.warn("Failed to query order details for confirmation email", {
        error: String(err),
      });
    }

    let trackingId = "";
    try {
      const { data: orderData } = await (supabase.from("orders") as any)
        .select("tracking_id")
        .eq("id", orderId)
        .maybeSingle();
      if (orderData?.tracking_id) {
        trackingId = orderData.tracking_id;
      }
    } catch (err) {
      logger.warn("Failed to fetch tracking_id for confirmation email", {
        error: String(err),
      });
    }

    let customerProfile: {
      firstName?: string | null;
      lastName?: string | null;
      displayName?: string | null;
    } | null = null;
    if (params.userId) {
      try {
        const { data: profile } = await (supabase.from("profiles") as any)
          .select("first_name, last_name, email, metadata")
          .eq("id", params.userId)
          .maybeSingle();
        if (profile) {
          customerProfile = {
            firstName: profile.first_name,
            lastName: profile.last_name,
            displayName:
              (profile.metadata as Record<string, any>)?.displayName || "",
          };
        }
      } catch (err) {
        logger.warn("Failed to fetch customer profile for order email", {
          error: String(err),
        });
      }
    }

    // Build email data for background jobs
    const orderDate = new Date().toISOString();
    const emailPayload = buildEmailPayload({
      orderId,
      invoiceId,
      customerEmail: params.email,
      customerProfile,
      phone: params.phone || params.shippingAddress.phone || "",
      orderNumber,
      invoiceNumber: outInvoiceNumber,
      orderDate,
      billingAddress: params.billingAddress,
      shippingAddress: params.shippingAddress,
      items: params.items.map((i) => ({
        name: i.productName,
        imageUrl: i.imageUrl,
        size: i.size,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        color: i.color,
        variant: i.variantName,
      })),
      subtotal: subtotal,
      shipping: shippingCost,
      tax: taxVal,
      total: grandTotal,
      paymentMethod: params.paymentMethod,
      paymentStatus: "completed",
      trackingId,
      discount: discountVal,
      shippingMethodName,
    });

    try {
      logger.info("Queue Started", { orderId });
      await queue.enqueue(orderId, emailPayload);
    } catch (err) {
      logger.error("Job enqueue failed", { orderId, error: String(err) });
    }

    return {
      success: true,
      orderId,
      orderNumber,
      invoiceNumber: outInvoiceNumber,
      invoiceId,
    };
  } catch (err) {
    logger.warn("Rollback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Checkout pipeline transaction failed",
    };
  }
}

export async function createOrderFromPaymentIntent(
  input: PaymentIntentCreationInput,
): Promise<OrderCreationResult> {
  const { paymentIntentId } = input;
  const { supabase } = getContainer();

  logger.info("Creating order from PaymentIntent", { paymentIntentId });

  const verification = await verifyPaymentIntent(paymentIntentId);
  if (!verification.ok) {
    logger.warn("PaymentIntent verification failed", {
      error: verification.error,
    });
    return { success: false, error: verification.error };
  }

  logger.info("Payment Verified", { paymentMethod: "stripe", stripePaymentIntentId: paymentIntentId });

  // Check for existing order (idempotency)
  const { data: existingOrder } = await (supabase.from("orders") as any)
    .select("id, order_number, status")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (existingOrder) {
    logger.info("Existing order found", { orderId: existingOrder.id });
    const { data: invoiceRecord } = await (supabase.from("invoices") as any)
      .select("id, invoice_number")
      .eq("order_id", existingOrder.id)
      .maybeSingle();

    return {
      success: true,
      orderId: existingOrder.id,
      orderNumber: existingOrder.order_number ?? undefined,
      invoiceNumber: invoiceRecord?.invoice_number ?? undefined,
      invoiceId: invoiceRecord?.id ?? undefined,
    };
  }

  const checkoutRequestId = verification.checkoutRequestId;

  if (checkoutRequestId) {
    await (supabase.from("payment_sessions") as any)
      .update({ status: "processing" })
      .eq("checkout_request_id", checkoutRequestId);
  }

  const amount = verification.amount
    ? verification.amount / 100
    : (verification.subtotal ?? 0);
  const total = verification.subtotal ?? amount;

  return await runCheckoutPipeline({
    userId: verification.userId,
    email: verification.email ?? "",
    phone: verification.shippingAddress?.phone ?? "",
    items: (verification.items ?? []).map((i) => ({
      productId: i.productId,
      variantId: i.variantId ?? null,
      size: i.size ?? "",
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      productName: i.productName,
      imageUrl: i.imageUrl,
      color: i.color,
      variantName: i.variantName,
    })),
    shippingAddress: verification.shippingAddress ?? {},
    billingAddress:
      verification.billingAddress ?? verification.shippingAddress ?? {},
    total,
    paymentMethod: verification.paymentMethod ?? "card",
    stripePaymentIntentId: paymentIntentId,
    checkoutRequestId,
    couponCode: (verification as any).couponCode,
    discountAmount: (verification as any).discountAmount,
  });
}

export async function createOrderFromPayment(
  input: OrderCreationInput,
): Promise<OrderCreationResult> {
  const { stripeSessionId } = input;
  const { supabase } = getContainer();

  const verification = await verifyStripePayment(stripeSessionId);
  if (!verification.ok) {
    return { success: false, error: verification.error };
  }

  logger.info("Payment Verified", { paymentMethod: "stripe", stripeSessionId });

  const { data: existingOrder } = await (supabase.from("orders") as any)
    .select("id, order_number, status")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();

  if (existingOrder) {
    return {
      success: true,
      orderId: existingOrder.id,
      orderNumber: existingOrder.order_number ?? undefined,
    };
  }

  return await runCheckoutPipeline({
    userId: input.userId,
    email: input.email,
    phone: input.phone,
    items: input.items,
    shippingAddress: input.shippingAddress,
    billingAddress: input.billingAddress || input.shippingAddress,
    total: input.subtotal,
    paymentMethod:
      verification.paymentMethod ?? input.stripePaymentMethod ?? "card",
    stripePaymentIntentId:
      verification.paymentIntentId ?? input.stripePaymentIntentId,
    stripeSessionId,
  });
}

export async function createOrderFromPayPal(
  input: PayPalOrderCreationInput,
): Promise<OrderCreationResult> {
  const { supabase } = getContainer();

  logger.info("Creating order from PayPal", {
    paypalOrderId: input.paypalOrderId,
  });

  logger.info("Payment Verified", { paymentMethod: "paypal", paypalOrderId: input.paypalOrderId });

  if (!/^[A-Za-z0-9_-]{5,64}$/.test(input.paypalOrderId)) {
    return { success: false, error: "Invalid PayPal order id" };
  }
  // The RPC stores PayPal payments as `paypal_<id>` in stripe_payment_intent_id; check both columns.
  const { data: existingOrder } = await (supabase.from("orders") as any)
    .select("id, order_number, status")
    .or(`paypal_order_id.eq.${input.paypalOrderId},stripe_payment_intent_id.eq.paypal_${input.paypalOrderId}`)
    .limit(1)
    .maybeSingle();

  if (existingOrder) {
    logger.info("Existing order found for PayPal", {
      orderId: existingOrder.id,
    });
    const { data: invoiceRecord } = await (supabase.from("invoices") as any)
      .select("id, invoice_number")
      .eq("order_id", existingOrder.id)
      .maybeSingle();
    return {
      success: true,
      orderId: existingOrder.id,
      orderNumber: existingOrder.order_number ?? undefined,
      invoiceNumber: invoiceRecord?.invoice_number ?? undefined,
      invoiceId: invoiceRecord?.id ?? undefined,
    };
  }

  return await runCheckoutPipeline({
    userId: input.userId,
    email: input.email,
    phone: input.shippingAddress?.phone ?? "",
    items: input.items,
    shippingAddress: input.shippingAddress,
    billingAddress: input.billingAddress,
    total: input.total,
    paymentMethod: input.paymentMethod,
    paypalOrderId: input.paypalOrderId,
    couponCode: input.couponCode,
    discountAmount: input.discountAmount,
  });
}
