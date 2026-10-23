import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { getPayPalClientId, createPayPalOrder, capturePayPalOrder, createOrderFromPayPal } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import type { CheckoutItem, CheckoutAddress, PaymentResult } from "@/payments/types";

class PayPalErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("PayPal script loading or runtime error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

interface PayPalPaymentProps {
  items: CheckoutItem[];
  email: string;
  getAddress: () => { shippingAddress: CheckoutAddress; billingAddress: CheckoutAddress };
  onSuccess: (result: PaymentResult) => void;
  onError: (error: string) => void;
  submitting?: boolean;
  setSubmitting?: (val: boolean) => void;
}

interface PendingOrderData {
  email: string;
  shippingAddress: CheckoutAddress;
  billingAddress: CheckoutAddress;
  items: CheckoutItem[];
}

const clientEnvVal = import.meta.env.VITE_PAYPAL_CLIENT_ID;
let paypalClientIdCache: string | null | undefined = clientEnvVal || undefined;
let paypalClientIdPromise: Promise<string | null> | null = clientEnvVal ? Promise.resolve(clientEnvVal) : null;

function fetchPayPalClientId(): Promise<string | null> {
  if (paypalClientIdPromise === null) {
    paypalClientIdPromise = getPayPalClientId().then((id) => {
      paypalClientIdCache = id || null;
      return paypalClientIdCache;
    });
  }
  return paypalClientIdPromise;
}

// ── Component ─────────────────────────────────────────────────────────────
// Memoised — PayPalScriptProvider only remounts when clientId changes
// (which never happens after the initial load).
export const PayPalPayment = memo(function PayPalPayment({
  items,
  email,
  getAddress,
  onSuccess,
  onError,
  submitting,
  setSubmitting,
}: PayPalPaymentProps) {
  // Start with cached value if already available (avoids flash of skeleton)
  const [clientId, setClientId] = useState<string | null>(
    paypalClientIdCache !== undefined ? paypalClientIdCache : null,
  );
  const [sdkLoading, setSdkLoading] = useState(paypalClientIdCache === undefined);
  const pendingDataRef = useRef<PendingOrderData | null>(null);

  useEffect(() => {
    // Already resolved synchronously from cache — no effect needed
    if (paypalClientIdCache !== undefined) return;

    fetchPayPalClientId().then((id) => {
      setClientId(id);
      setSdkLoading(false);
    });
  }, []);

  const createOrder = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token || undefined;

    const { shippingAddress, billingAddress } = getAddress();

    pendingDataRef.current = {
      email,
      shippingAddress,
      billingAddress,
      items,
    };

    const result = await createPayPalOrder({
      data: {
        accessToken,
        email,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId ?? null,
          size: i.size ?? "",
          quantity: i.quantity,
        })),
        shippingAddress,
        billingAddress,
      },
    });
    return result.id;
  }, [items, email, getAddress]);

  const onApprove = useCallback(async (data: { orderID: string }) => {
    const pending = pendingDataRef.current;
    if (!pending) {
      onError("Session data not found. Please try again.");
      setSubmitting?.(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token || undefined;

      const captureResult = await capturePayPalOrder({
        data: { orderId: data.orderID },
      });

      if (captureResult.status !== "COMPLETED") {
        onError("PayPal payment could not be completed. Please try again.");
        setSubmitting?.(false);
        return;
      }

      const result = await createOrderFromPayPal({
        data: {
          paypalOrderId: data.orderID,
          accessToken,
          email: pending.email,
          items: pending.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId ?? null,
            size: i.size ?? "",
            quantity: i.quantity,
          })),
          shippingAddress: pending.shippingAddress,
          billingAddress: pending.billingAddress,
          paymentMethod: "paypal",
        },
      });

      if (result.success) {
        onSuccess(result);
      } else {
        onError(result.error ?? "Failed to create order");
        setSubmitting?.(false);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment could not be completed.");
      setSubmitting?.(false);
    }
  }, [onSuccess, onError, setSubmitting]);

  if (sdkLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-10 bg-neutral rounded-md" />
        <div className="h-10 bg-neutral rounded-md" />
      </div>
    );
  }

  if (!clientId) {
    return (
      <p className="text-xs text-red/70">
        PayPal is not configured. Please contact support.
      </p>
    );
  }

  const fallbackUI = (
    <p className="text-xs text-red/70">
      PayPal is not configured. Please contact support.
    </p>
  );

  return (
    <PayPalErrorBoundary fallback={fallbackUI}>
      <PayPalScriptProvider
        options={{
          clientId,
          currency: "USD",
          intent: "capture",
          "enable-funding": "paypal,venmo,paylater,card",
          "disable-funding": "",
        }}
      >
        <PayPalButtons
          style={{
            layout: "vertical",
            shape: "rect",
            color: "gold",
            label: "paypal",
            tagline: false,
          }}
          createOrder={async () => {
            setSubmitting?.(true);
            try {
              return await createOrder();
            } catch (err) {
              setSubmitting?.(false);
              throw err;
            }
          }}
          onApprove={async (data) => {
            setSubmitting?.(true);
            try {
              await onApprove(data);
            } catch (err) {
              setSubmitting?.(false);
              throw err;
            }
          }}
          onError={() => {
            setSubmitting?.(false);
            toast.error("PayPal encountered an error. Please try again.");
            onError("PayPal encountered an error. Please try again.");
          }}
          onCancel={() => {
            setSubmitting?.(false);
            toast.info("PayPal payment was cancelled.");
          }}
        />
        <p className="text-[10px] text-muted-foreground text-center mt-2 tracking-wider">
          PayPal • Credit • Debit • Venmo • Pay Later
        </p>
      </PayPalScriptProvider>
    </PayPalErrorBoundary>
  );
});
