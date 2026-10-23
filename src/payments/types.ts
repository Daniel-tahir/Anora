import type { Stripe } from "@stripe/stripe-js";

export type PaymentMethodId = "stripe" | "paypal";

export interface PaymentMethodConfig {
  id: PaymentMethodId;
  title: string;
  subtitle: string;
}

export const PAYMENT_METHODS: Record<PaymentMethodId, PaymentMethodConfig> = {
  stripe: {
    id: "stripe",
    title: "Credit / Debit Card",
    subtitle: "Visa \u2022 Mastercard \u2022 Amex \u2022 Apple Pay \u2022 Google Pay \u2022 Link",
  },
  paypal: {
    id: "paypal",
    title: "PayPal",
    subtitle: "PayPal \u2022 Credit \u2022 Debit \u2022 Venmo \u2022 Pay Later",
  },
};

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

export interface CheckoutItem {
  productId: string;
  variantId: string | null;
  size: string | null;
  quantity: number;
}

export interface PaymentResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  error?: string;
}

export interface StripeState {
  stripe: Stripe | null;
  clientSecret: string | null;
  loading: boolean;
  error: string | null;
}

export type StripePromiseCache = Map<string, Promise<Stripe | null>>;
