import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useEffect } from "react";
import { ProtectedRoute, useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { z } from "zod";
import {
  createPaymentIntent,
  createPayPalOrder,
  createOrder,
  createCheckoutRequestId,
  getStripePublishableKey,
} from "@/lib/payments";
import { PaymentMethodList } from "@/components/payment/PaymentMethodList";
import { StripePayment } from "@/components/payment/StripePayment";
import { PayPalPayment } from "@/components/payment/PayPalPayment";
import { type PaymentMethodId } from "@/components/payment/payment-types";

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, string | undefined>) => ({
    success: search.success,
    canceled: search.canceled,
    payment_intent: search.payment_intent,
    redirect_status: search.redirect_status,
  }),
  head: () => ({ meta: [{ title: "Checkout — ANORA" }] }),
  component: CheckoutPage,
});

export function CheckoutForm() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, canceled, payment_intent, redirect_status } = Route.useSearch();
  const [billingSame, setBillingSame] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodId>("stripe");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripeKey, setStripeKey] = useState<string | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const checkoutRequestId = useRef(createCheckoutRequestId());

  const cardConfirmRef = useRef<
    | ((
        cs: string,
        ret: string,
      ) => Promise<{
        error?: { message?: string };
        paymentIntent?: { id: string; status: string };
      }>)
    | null
  >(null);
  const orderAttempted = useRef(false);
  const effectRunCount = useRef(0);

  useEffect(() => {
    const key = getStripePublishableKey();
    if (key) setStripeKey(key);
  }, []);

  const [orderCreating, setOrderCreating] = useState(false);

  useEffect(() => {
    effectRunCount.current += 1;
    console.log("[TRACE A] success useEffect RUNNING", {
      runCount: effectRunCount.current,
      success,
      payment_intent,
      redirect_status,
      orderAttempted: orderAttempted.current,
      orderCreating,
    });

    if (
      success === "1" &&
      payment_intent &&
      redirect_status === "succeeded" &&
      !orderAttempted.current
    ) {
      console.log("[TRACE B] success condition MET — proceeding with order creation");
      orderAttempted.current = true;
      setOrderCreating(true);

      supabase.auth.getSession().then(async ({ data: sessionData }) => {
        console.log("[TRACE C] getSession result:", {
          hasSession: !!sessionData.session,
          accessTokenPrefix: sessionData.session?.access_token?.slice(0, 10),
        });

        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          console.log("[TRACE C2] No access token — navigating to /login");
          navigate({ to: "/login" });
          return;
        }

        try {
          console.log("[TRACE D] calling createOrder", { paymentIntentId: payment_intent });
          const order = await createOrder({
            data: { paymentIntentId: payment_intent, accessToken },
          });
          console.log("[TRACE E] createOrder returned:", order);

          if (order.success) {
            console.log("[TRACE F] order created OK — clearing cart, navigating to /order/success");
            cart.clear();
            navigate({
              to: "/order/success",
              search: {
                orderNumber: order.orderNumber ?? "",
                invoiceNumber: order.invoiceNumber ?? "",
                orderId: order.orderId ?? "",
              },
            });
          } else {
            console.log("[TRACE G] order creation FAILED:", order.error);
            toast.error(order.error ?? "Order could not be created. Please contact support.");
            setOrderCreating(false);
          }
        } catch (err) {
          console.log("[TRACE H] createOrder threw:", err instanceof Error ? err.stack : err);
          toast.error(
            err instanceof Error
              ? err.message
              : "Order could not be created. Please contact support.",
          );
          setOrderCreating(false);
        }
      });
    } else {
      console.log("[TRACE I] success condition NOT MET", {
        successEq1: success === "1",
        hasPaymentIntent: !!payment_intent,
        redirectStatusSucceeded: redirect_status === "succeeded",
        notAttempted: !orderAttempted.current,
      });
    }
  }, [success, payment_intent, redirect_status, navigate, orderCreating, cart]);

  useEffect(() => {
    if (success === "1" && !payment_intent) {
      navigate({
        to: "/order/success",
        search: { orderNumber: "", invoiceNumber: "", orderId: "" },
      });
    }
  }, [success, payment_intent, navigate]);

  useEffect(() => {
    if (selectedMethod !== "stripe") return;
    // Reset state when switching back to Stripe
    if (clientSecret || stripeError) {
      setClientSecret(null);
      setStripeError(null);
    }
  }, [selectedMethod, clientSecret, stripeError]);

  useEffect(() => {
    if (selectedMethod !== "stripe") return;
    if (clientSecret || stripeError) return;
    if (cart.items.length === 0) return;

    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (!token) return;
      createPaymentIntent({
        data: {
          accessToken: token,
          email: user?.email ?? "",
          items: cart.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            size: item.size,
            quantity: item.quantity,
          })),
          shippingAddress: {
            firstName: "",
            lastName: "",
            line1: "",
            line2: "",
            city: "",
            state: "",
            postalCode: "",
            country: "US",
            phone: "",
          },
          checkoutRequestId: checkoutRequestId.current,
          idempotencyKey: `prefetch-${checkoutRequestId.current}`,
        },
      })
        .then((result) => {
          setClientSecret(result.clientSecret);
        })
        .catch((err) => {
          setStripeError(err instanceof Error ? err.message : "Failed to initialize payment");
        });
    });
  }, [selectedMethod, clientSecret, stripeError, cart.items, user?.email]);

  useEffect(() => {
    console.log("[TRACE MOUNT] CheckoutForm mounted", {
      success,
      canceled,
      payment_intent,
      redirect_status,
      itemCount: cart.items.length,
      subtotal: cart.subtotal,
      hasUser: !!user,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shipping = 0;
  const total = cart.subtotal;

  if (success === "1" && orderCreating) {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <h1 className="font-serif text-4xl">Payment Successful</h1>
        <p className="text-muted-foreground mt-4">Creating your order...</p>
      </div>
    );
  }

  if (canceled === "1") {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <h1 className="font-serif text-4xl">Payment Canceled</h1>
        <p className="text-muted-foreground mt-4">
          Your payment was not completed. Your cart items are still saved.
        </p>
        <Link
          to="/checkout"
          className="mt-8 inline-block text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          Try Again
        </Link>
      </div>
    );
  }

  if (cart.detailed.length === 0) {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <h1 className="font-serif text-4xl">Your bag is empty</h1>
        <Link
          to="/shop"
          className="mt-6 inline-block text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="px-5 lg:px-10 py-16 max-w-6xl mx-auto">
      <div className="text-center mb-10">
        <span className="eyebrow">Secure Checkout</span>
        <h1 className="font-serif text-5xl mt-3">Checkout</h1>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!user) {
            toast.error("Please sign in to complete checkout");
            return;
          }
          if (submitLock.current) return;
          submitLock.current = true;
          setSubmitting(true);

          const form = e.currentTarget;
          const val = (name: string) =>
            (form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";

          const email = val("email");
          const emailResult = z.string().email().safeParse(email);
          if (!emailResult.success) {
            toast.error("Please enter a valid email address");
            setSubmitting(false);
            submitLock.current = false;
            return;
          }

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            toast.error("Your session expired. Please sign in again.");
            setSubmitting(false);
            submitLock.current = false;
            return;
          }

          if (selectedMethod === "paypal") {
            try {
              const result = await createPayPalOrder({
                data: {
                  accessToken,
                  email,
                  items: cart.items.map((item) => ({
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    size: item.size,
                    quantity: item.quantity,
                  })),
                  shippingAddress: {
                    firstName: val("firstName"),
                    lastName: val("lastName"),
                    line1: val("address"),
                    line2: val("address2"),
                    city: val("city"),
                    state: val("state"),
                    postalCode: val("postalCode"),
                    country: val("country"),
                    phone: val("phone"),
                  },
                  billingAddress: billingSame
                    ? undefined
                    : {
                        firstName: val("firstName"),
                        lastName: val("lastName"),
                        line1: val("billingAddress"),
                        line2: "",
                        city: val("billingCity"),
                        state: "",
                        postalCode: val("billingPostalCode"),
                        country: val("billingCountry"),
                        phone: val("phone"),
                      },
                },
              });
              window.location.assign(result.approveUrl);
            } catch (error) {
              toast.error("Checkout could not start", {
                description: error instanceof Error ? error.message : "Please try again.",
              });
              setSubmitting(false);
              submitLock.current = false;
            }
            return;
          }

          const requestId = checkoutRequestId.current;
          console.log("[TRACE 1] CHECKOUT SUBMIT", {
            email,
            requestId,
            itemCount: cart.items.length,
            method: selectedMethod,
          });
          try {
            const piResult = await createPaymentIntent({
              data: {
                accessToken,
                email,
                items: cart.items.map((item) => ({
                  productId: item.productId,
                  variantId: item.variantId ?? null,
                  size: item.size,
                  quantity: item.quantity,
                })),
                shippingAddress: {
                  firstName: val("firstName"),
                  lastName: val("lastName"),
                  line1: val("address"),
                  line2: val("address2"),
                  city: val("city"),
                  state: val("state"),
                  postalCode: val("postalCode"),
                  country: val("country"),
                  phone: val("phone"),
                },
                billingAddress: billingSame
                  ? undefined
                  : {
                      firstName: val("firstName"),
                      lastName: val("lastName"),
                      line1: val("billingAddress"),
                      line2: "",
                      city: val("billingCity"),
                      state: "",
                      postalCode: val("billingPostalCode"),
                      country: val("billingCountry"),
                      phone: val("phone"),
                    },
                checkoutRequestId: requestId,
                idempotencyKey: requestId,
              },
            });

            if (cardConfirmRef.current) {
              const returnUrl = `${window.location.origin}/checkout?success=1`;
              const confirmResult = await cardConfirmRef.current(piResult.clientSecret, returnUrl);

              console.log("[TRACE 2] confirmPayment result:", {
                paymentIntentId: confirmResult.paymentIntent?.id,
                status: confirmResult.paymentIntent?.status,
                error: confirmResult.error?.message,
              });
              if (confirmResult.error) {
                toast.error(confirmResult.error.message ?? "Payment could not be processed.");
                setSubmitting(false);
                submitLock.current = false;
              } else if (confirmResult.paymentIntent) {
                console.log("[TRACE 3] about to call createOrder", {
                  paymentIntentId: confirmResult.paymentIntent.id,
                  checkoutRequestId: requestId,
                  email,
                });
                // Non-3DS: create order inline, then navigate directly to success page
                setOrderCreating(true);
                try {
                  const order = await createOrder({
                    data: { paymentIntentId: confirmResult.paymentIntent.id, accessToken },
                  });
                  console.log("[TRACE 4] createOrder returned:", {
                    success: order.success,
                    error: order.error,
                    orderNumber: order.orderNumber,
                    invoiceNumber: order.invoiceNumber,
                    orderId: order.orderId,
                  });
                  if (order.success) {
                    cart.clear();
                    navigate({
                      to: "/order/success",
                      search: {
                        orderNumber: order.orderNumber ?? "",
                        invoiceNumber: order.invoiceNumber ?? "",
                        orderId: order.orderId ?? "",
                      },
                    });
                  } else {
                    toast.error(
                      order.error ?? "Order could not be created. Please contact support.",
                    );
                    setSubmitting(false);
                    submitLock.current = false;
                  }
                } catch (err) {
                  console.log(
                    "[TRACE 5] createOrder threw:",
                    err instanceof Error ? err.stack : err,
                  );
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Order could not be created. Please contact support.",
                  );
                  setSubmitting(false);
                  submitLock.current = false;
                }
                return;
              }
            } else {
              toast.error("Payment system not ready. Please refresh.");
              setSubmitting(false);
              submitLock.current = false;
            }
          } catch (error) {
            console.log(
              "[TRACE 5b] outer catch (createPaymentIntent/confirmPayment threw):",
              error instanceof Error ? error.stack : error,
            );
            toast.error("Checkout could not start", {
              description: error instanceof Error ? error.message : "Please try again.",
            });
            setSubmitting(false);
            submitLock.current = false;
          }
        }}
        className="grid lg:grid-cols-[1fr_360px] gap-12"
      >
        <div className="space-y-10">
          <Section title="Contact Information">
            <Input
              label="Email"
              name="email"
              type="email"
              required
              defaultValue={user?.email ?? ""}
            />
            <Input label="Phone" name="phone" type="tel" required />
          </Section>

          <Section title="Shipping Address">
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="First name" name="firstName" required />
              <Input label="Last name" name="lastName" required />
            </div>
            <Input label="Address" name="address" required />
            <Input label="Apartment, suite, etc." name="address2" />
            <div className="grid sm:grid-cols-3 gap-4">
              <Input label="City" name="city" required />
              <Input label="State" name="state" />
              <Input label="Postal code" name="postalCode" required />
            </div>
            <Input label="Country" name="country" required defaultValue="United States" />
          </Section>

          <Section title="Billing Address">
            <label className="flex items-center gap-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={billingSame}
                onChange={(e) => setBillingSame(e.target.checked)}
                className="h-4 w-4 accent-foreground"
              />
              Same as shipping address
            </label>
            {!billingSame && (
              <div className="mt-5 space-y-4">
                <Input label="Billing address" name="billingAddress" required />
                <div className="grid sm:grid-cols-3 gap-4">
                  <Input label="City" name="billingCity" required />
                  <Input label="Postal code" name="billingPostalCode" required />
                  <Input label="Country" name="billingCountry" required />
                </div>
              </div>
            )}
          </Section>

          <Section title="Choose Payment Method">
            <PaymentMethodList
              methods={["stripe", "paypal"]}
              selected={selectedMethod}
              onSelect={setSelectedMethod}
              disabled={submitting}
            />

            {selectedMethod === "stripe" && (
              <div className="mt-5">
                {stripeError && <p className="text-red-500 text-sm mb-3">{stripeError}</p>}
                {!clientSecret && !stripeError && (
                  <div className="text-sm text-muted-foreground py-4">Loading payment form...</div>
                )}
                {clientSecret && stripeKey && (
                  <StripePayment
                    stripeKey={stripeKey}
                    clientSecret={clientSecret}
                    items={cart.items}
                    onConfirmReady={(fn) => {
                      cardConfirmRef.current = fn;
                    }}
                    checkoutRequestId={checkoutRequestId.current}
                  />
                )}
              </div>
            )}

            {selectedMethod === "paypal" && (
              <div className="mt-5">
                <PayPalPayment />
              </div>
            )}
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="bg-neutral p-7">
            <p className="eyebrow mb-5">Order Summary</p>
            <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
              {cart.detailed.map(({ item, product }) => (
                <div key={`${item.productId}-${item.size}`} className="flex gap-3">
                  <img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-14 h-16 object-cover"
                  />
                  <div className="flex-1 text-sm">
                    <p className="font-serif text-base">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Size {item.size} · Qty {item.quantity}
                    </p>
                  </div>
                  <span className="text-sm">${product.price * item.quantity}</span>
                </div>
              ))}
            </div>
            <div className="h-px bg-border my-5" />
            <Row label="Subtotal" value={`$${cart.subtotal}`} />
            <Row label="Shipping" value="Complimentary" />
            <div className="h-px bg-border my-5" />
            <Row label="Total" value={`$${total}`} bold />
            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full bg-foreground text-background py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors disabled:opacity-60"
            >
              {submitting ? "Processing Payment..." : "Place Order"}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <span className="gold-rule" />
        <h2 className="eyebrow">{title}</h2>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Input({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
        {label}
      </span>
      <input
        {...rest}
        className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
      />
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${bold ? "eyebrow" : "text-muted-foreground"}`}>{label}</span>
      <span className={bold ? "font-serif text-xl" : "text-sm"}>{value}</span>
    </div>
  );
}

function CheckoutPage() {
  return (
    <ProtectedRoute>
      <CheckoutForm />
    </ProtectedRoute>
  );
}
