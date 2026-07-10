import type { ValidatedLineItem } from "./cart-validation";

export interface CalculatedTotals {
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
}

export function calculateTotals(
  validatedItems: ValidatedLineItem[],
  options?: {
    shippingCost?: number;
    taxRate?: number;
    discountAmount?: number;
    currency?: string;
  },
): CalculatedTotals {
  const subtotal = validatedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const shipping = options?.shippingCost ?? 0;
  const discount = options?.discountAmount ?? 0;
  const taxableAmount = subtotal - discount;
  const taxRate = options?.taxRate ?? 0;
  const tax = Math.round(taxableAmount * taxRate * 100) / 100;
  const total = Math.max(0, taxableAmount + tax + shipping);

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    shipping: Math.round(shipping * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round(total * 100) / 100,
    currency: options?.currency ?? "usd",
  };
}
