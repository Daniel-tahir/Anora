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
    subtitle: "Visa • Mastercard • Amex • Apple Pay • Google Pay • Link",
  },
  paypal: { id: "paypal", title: "PayPal", subtitle: "Pay with your PayPal account" },
};
