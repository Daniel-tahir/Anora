import { normalizeSizeStock, isSizeTracked } from "./inventory-engine";

export const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export type SizeOption = (typeof SIZE_OPTIONS)[number];

export function buildSizeStock(
  sizes: string[],
  existing?: Record<string, number> | null,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of sizes) {
    result[s] = typeof existing?.[s] === "number" ? existing[s] : 0;
  }
  return normalizeSizeStock(result);
}

export function calculateProductStock(
  sizeStock: Record<string, number> | null | undefined,
): number {
  const stockMap = normalizeSizeStock(sizeStock ?? {});
  if (!isSizeTracked(stockMap)) return 0;
  return Object.values(stockMap).reduce((sum, qty) => sum + qty, 0);
}

export function isSizeInventoryEnabled(
  sizeStock: Record<string, number> | null | undefined,
): boolean {
  return isSizeTracked(normalizeSizeStock(sizeStock ?? {}));
}

export function findZeroFilledProducts(
  products: { stock: number; size_stock: Record<string, number> | null }[],
): string[] {
  return products
    .filter((p) => {
      const hasSizes = p.size_stock && Object.keys(p.size_stock).length > 0;
      const allZero = hasSizes && Object.values(p.size_stock!).every((v) => v === 0);
      return allZero && p.stock > 0;
    })
    .map((_, i) => String(i));
}

export { normalizeSizeStock, isSizeTracked };
