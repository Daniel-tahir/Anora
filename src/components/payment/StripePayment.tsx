import { useEffect, useRef } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { createPaymentIntent } from "@/lib/payments";

const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

function getStripePromise(key: string): Promise<Stripe | null> {
  if (!stripePromiseCache.has(key)) {
    stripePromiseCache.set(key, loadStripe(key));
  }
  return stripePromiseCache.get(key)!;
}

function StripeElementsForm({
  clientSecret,
  items,
  onConfirmReady,
  checkoutRequestId,
}: {
  clientSecret: string;
  items: { productId: string; variantId: string | null; size: string | null; quantity: number }[];
  onConfirmReady: (
    fn: (
      clientSecret: string,
      returnUrl: string,
    ) => Promise<{
      error?: { message?: string };
      paymentIntent?: { id: string; status: string };
    }>,
  ) => void;
  checkoutRequestId: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const readyRef = useRef(false);

  useEffect(() => {
    if (stripe && elements && !readyRef.current) {
      readyRef.current = true;
      onConfirmReady(async (cs, returnUrl) => {
        const submitResult = await elements.submit();
        if (submitResult.error) {
          return { error: submitResult.error };
        }
        return stripe.confirmPayment({
          elements,
          clientSecret: cs,
          confirmParams: { return_url: returnUrl },
          redirect: "if_required",
        });
      });
    }
  }, [stripe, elements, onConfirmReady]);

  return (
    <div className="space-y-4">
      <ExpressCheckoutElement
        onConfirm={async (_event) => {
          if (!stripe || !elements) return;
          const form = document.querySelector("form") as HTMLFormElement | null;
          const val = (name: string) =>
            (form?.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "";
          const email = val("email");

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            toast.error("Your session expired. Please sign in again.");
            return;
          }

          try {
            const submitResult = await elements.submit();
            if (submitResult.error) {
              toast.error(submitResult.error.message ?? "Payment could not be processed.");
              return;
            }

            const piResult = await createPaymentIntent({
              data: {
                accessToken,
                email,
                items: items.map((item) => ({
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
                checkoutRequestId,
                idempotencyKey: `express-${checkoutRequestId}`,
              },
            });

            const { error, paymentIntent } = await stripe.confirmPayment({
              elements,
              clientSecret: piResult.clientSecret,
              confirmParams: {
                return_url: `${window.location.origin}/checkout?success=1`,
              },
              redirect: "if_required",
            });
            if (error) {
              toast.error(error.message ?? "Payment could not be processed.");
            } else if (paymentIntent) {
              window.location.href = `${window.location.origin}/checkout?success=1&payment_intent=${paymentIntent.id}&redirect_status=succeeded`;
            }
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Payment could not be processed.");
          }
        }}
        className="mb-4"
      />
      <PaymentElement
        options={{
          layout: {
            type: "accordion",
          },
        }}
      />
    </div>
  );
}

export function StripePayment({
  stripeKey,
  clientSecret,
  items,
  onConfirmReady,
  checkoutRequestId,
}: {
  stripeKey: string;
  clientSecret: string;
  items: { productId: string; variantId: string | null; size: string | null; quantity: number }[];
  onConfirmReady: (
    fn: (
      clientSecret: string,
      returnUrl: string,
    ) => Promise<{
      error?: { message?: string };
      paymentIntent?: { id: string; status: string };
    }>,
  ) => void;
  checkoutRequestId: string;
}) {
  return (
    <Elements
      stripe={getStripePromise(stripeKey)}
      options={{ clientSecret, appearance: { theme: "stripe" } }}
    >
      <StripeElementsForm
        clientSecret={clientSecret}
        items={items}
        onConfirmReady={onConfirmReady}
        checkoutRequestId={checkoutRequestId}
      />
    </Elements>
  );
}
