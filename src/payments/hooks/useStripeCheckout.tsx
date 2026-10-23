import { useRef, useEffect, memo, useMemo } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripePublishableKey } from "@/lib/payments";

// ── Stripe SDK — loaded once for the lifetime of the application ──────────
let stripePromiseInstance: Promise<Stripe | null> | null = null;

export function getStripePromise(key: string): Promise<Stripe | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (!stripePromiseInstance) {
    stripePromiseInstance = loadStripe(key);
  }
  return stripePromiseInstance;
}

// Eagerly start downloading stripe.js as soon as this chunk is imported.
if (typeof window !== "undefined") {
  const STRIPE_KEY = getStripePublishableKey();
  if (STRIPE_KEY) getStripePromise(STRIPE_KEY);
}

// ── Types ─────────────────────────────────────────────────────────────────
export type ConfirmFn = (
  clientSecret: string,
  returnUrl: string,
) => Promise<{
  error?: { message?: string };
  paymentIntent?: { id: string; status: string };
}>;

// ── Inner form ────────────────────────────────────────────────────────────
// Registers the confirm handler once stripe + elements are ready.
// Memoised so it never remounts due to parent re-renders.
const StripeInnerForm = memo(function StripeInnerForm({
  clientSecret,
  onConfirmReady,
}: {
  clientSecret: string | null;
  onConfirmReady: (fn: ConfirmFn) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const onConfirmReadyRef = useRef(onConfirmReady);
  const clientSecretRef = useRef(clientSecret);

  useEffect(() => {
    onConfirmReadyRef.current = onConfirmReady;
  }, [onConfirmReady]);

  useEffect(() => {
    clientSecretRef.current = clientSecret;
  }, [clientSecret]);

  useEffect(() => {
    if (!stripe || !elements) return;

    onConfirmReadyRef.current(async (passedSecret, returnUrl) => {
      const targetSecret = passedSecret || clientSecretRef.current;
      if (!targetSecret) {
        return { error: { message: "Secure payment setup is finishing. Please try again in a moment." } };
      }

      const { error: submitError } = await elements.submit();
      if (submitError) return { error: submitError };

      return stripe.confirmPayment({
        elements,
        clientSecret: targetSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
    });
  }, [stripe, elements]);

  return (
    <PaymentElement options={{ layout: { type: "accordion" } }} />
  );
});

// ── Public component ──────────────────────────────────────────────────────
// Mounts the Elements provider using Stripe Deferred Elements mode.
// Warm-loads the elements iframe immediately in parallel with API calls.
export const StripePaymentForm = memo(function StripePaymentForm({
  stripeKey,
  total,
  clientSecret,
  onConfirmReady,
}: {
  stripeKey: string;
  total: number;
  clientSecret: string | null;
  onConfirmReady: (fn: ConfirmFn) => void;
}) {
  const options = useMemo(() => {
    return {
      mode: "payment" as const,
      amount: Math.max(1, Math.round(total * 100)),
      currency: "usd",
      appearance: { theme: "stripe" as const },
    };
  }, [total]);

  const stripePromise = useMemo(() => getStripePromise(stripeKey), [stripeKey]);

  return (
    <Elements
      stripe={stripePromise}
      options={options}
    >
      <StripeInnerForm clientSecret={clientSecret} onConfirmReady={onConfirmReady} />
    </Elements>
  );
});
