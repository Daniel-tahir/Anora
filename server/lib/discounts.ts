/**
 * Single source of truth for coupon discount maths.
 * - percentage is clamped to 0..100
 * - fixed is clamped to >= 0
 * - the discount can never exceed the subtotal (no negative totals)
 * All amounts are in major currency units (e.g. dollars) and rounded to cents.
 */
export function calculateDiscountAmount(
  subtotal: number,
  discountType: string | null | undefined,
  discountValue: number | null | undefined,
): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;
  const value = Number(discountValue);
  if (!Number.isFinite(value) || value <= 0) return 0;

  let discount = 0;
  if (discountType === "percentage") {
    discount = subtotal * (Math.min(value, 100) / 100);
  } else if (discountType === "fixed") {
    discount = value;
  }
  discount = Math.min(discount, subtotal);
  return Math.round(discount * 100) / 100;
}
