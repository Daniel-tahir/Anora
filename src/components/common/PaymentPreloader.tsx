import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getStripePublishableKey } from "@/lib/payments";
import { getStripePromise } from "@/payments/hooks/useStripeCheckout";
import { getPayPalClientId } from "@/lib/payments";

let preloaderExecuted = false;

function injectPayPalScript(clientId: string) {
  if (typeof window === "undefined") return;
  
  // Ensure the script is only injected once
  if (window.document.querySelector('script[src*="paypal.com/sdk/js"]')) {
    return;
  }
  
  const script = window.document.createElement("script");
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&enable-funding=paypal,venmo,paylater,card&currency=USD&intent=capture`;
  script.async = true;
  script.setAttribute("data-sdk-integration-source", "react-paypal-js");
  window.document.head.appendChild(script);
}

export function PaymentPreloader() {
  const { user } = useAuth();

  useEffect(() => {
    // Only preload if the user is authenticated, client is mounted, and preloader hasn't run yet
    if (typeof window === "undefined" || !user || preloaderExecuted) return;
    preloaderExecuted = true;

    const runPreload = () => {
      // 1. Preload Stripe SDK script in background
      const stripeKey = getStripePublishableKey();
      if (stripeKey) {
        getStripePromise(stripeKey);
      }

      // 2. Preload PayPal Client ID and SDK script
      getPayPalClientId().then((id) => {
        if (id) {
          injectPayPalScript(id);
        }
      }).catch((err) => {
        console.warn("PayPal client ID preloading deferred:", err);
      });
    };

    // Use requestIdleCallback if supported, otherwise fall back to setTimeout to protect TTI/FCP
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => runPreload());
    } else {
      setTimeout(runPreload, 1500);
    }
  }, [user]);

  return null;
}
