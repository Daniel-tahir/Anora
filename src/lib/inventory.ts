import type { Product, ColorVariant, Category } from "./products";
import {
  normalizeSizeStock,
  clampStock,
  isSizeTracked,
  getAvailableStock,
  validateQuantity,
  validateSizeStock,
  isStockOnlyError,
  isSizeTrackedJsonb,
  ErrorCodes,
  type ErrorCode,
} from "./inventory-engine";

export const DEFAULT_SIZE_THRESHOLD = 5;

export type InventoryChannel = "product" | "variant" | "size";

export interface AvailabilityState {
  productId: string;
  slug: string;
  category: Category;
  sku: string;
  color: string;
  stock: number;
  isAvailable: boolean;
  lowStock: boolean;
  lowStockThreshold: number;
  sizes: string[];
  sizeStock: Record<string, number>;
  colorVariants: Array<{
    color: string;
    sku: string;
    stock: number;
    isAvailable: boolean;
    lowStock: boolean;
    images: string[];
    sizes: string[];
    sizeStock: Record<string, number>;
  }>;
  selectedVariant?: {
    color: string;
    sku: string;
    stock: number;
    isAvailable: boolean;
    lowStock: boolean;
    images: string[];
    sizes: string[];
    sizeStock: Record<string, number>;
  };
}

export interface CheckoutLine {
  productId: string;
  quantity: number;
  size: string;
  color?: string;
  variantId?: string;
}

export interface StockValidationResult {
  ok: boolean;
  reason?: string;
  code?: ErrorCode;
  availableQuantity: number;
  availability: AvailabilityState;
}

export interface InventoryLogEntry {
  productId: string;
  variantSku?: string;
  quantityChange: number;
  quantityAfter: number;
  changeType: "order" | "restock" | "adjustment" | "return" | "cancellation";
  notes?: string;
}

function getVariantRecord(product: Product, color?: string) {
  return product.colorVariants?.find((variant) => variant.color === (color ?? product.color));
}

function getEffectiveSizeStock(product: Product, variant?: ColorVariant) {
  return normalizeSizeStock(variant?.sizeStock ?? product.sizeStock);
}

export function getVariantStock(product: Product, color?: string) {
  const variant = getVariantRecord(product, color);
  return clampStock(variant?.stock ?? product.stock);
}

export function getSizeStock(product: Product, size: string, color?: string) {
  const variant = getVariantRecord(product, color);
  const stockMap = getEffectiveSizeStock(product, variant);
  return clampStock(stockMap[size]);
}

export function getProductAvailability(product: Product, color?: string): AvailabilityState {
  const selectedVariant = getVariantRecord(product, color);
  const variantList = product.colorVariants?.length
    ? product.colorVariants
    : [
        {
          color: product.color,
          images: product.images,
          sizes: product.sizes,
          sizeStock: product.sizeStock,
          stock: product.stock,
          sku: product.sku,
        },
      ];

  const colorVariants = variantList.map((variant) => {
    const normalizedSizeStock = getEffectiveSizeStock(product, variant);
    const variantStock = clampStock(variant.stock ?? product.stock);
    const availableBySize = Object.values(normalizedSizeStock).some((quantity) => quantity > 0);
    const sizeTracked = isSizeTracked(normalizedSizeStock);
    const available = variantStock > 0 && (!sizeTracked || availableBySize);
    return {
      color: variant.color,
      sku: variant.sku ?? product.sku,
      stock: variantStock,
      isAvailable: available,
      lowStock: variantStock > 0 && variantStock <= DEFAULT_SIZE_THRESHOLD,
      images: variant.images,
      sizes: variant.sizes ?? product.sizes,
      sizeStock: normalizedSizeStock,
    };
  });

  const stock = getVariantStock(product, color);
  const sizeStock = getEffectiveSizeStock(product, selectedVariant);
  const sizeTracked = isSizeTracked(sizeStock);
  const sizeStocks = Object.values(sizeStock);
  const anySizeAvailable = !sizeTracked || sizeStocks.some((quantity) => quantity > 0);

  return {
    productId: product.id,
    slug: product.slug,
    category: product.category,
    sku: selectedVariant?.sku ?? product.sku,
    color: selectedVariant?.color ?? product.color,
    stock,
    isAvailable: stock > 0 && anySizeAvailable,
    lowStock: stock > 0 && stock <= DEFAULT_SIZE_THRESHOLD,
    lowStockThreshold: DEFAULT_SIZE_THRESHOLD,
    sizes: selectedVariant?.sizes ?? product.sizes,
    sizeStock,
    colorVariants,
    selectedVariant: selectedVariant
      ? {
          color: selectedVariant.color,
          sku: selectedVariant.sku ?? product.sku,
          stock,
          isAvailable: stock > 0 && anySizeAvailable,
          lowStock: stock > 0 && stock <= DEFAULT_SIZE_THRESHOLD,
          images: selectedVariant.images,
          sizes: selectedVariant.sizes ?? product.sizes,
          sizeStock,
        }
      : undefined,
  };
}

export function validateStockBeforeCheckout(
  product: Product,
  line: CheckoutLine,
): StockValidationResult {
  const availability = getProductAvailability(product, line.color);
  const { quantity: availableQuantity, error: stockError } = getAvailableStock(
    { stock: availability.stock, size_stock: availability.sizeStock },
    line.size,
  );

  if (!availability.isAvailable) {
    return {
      ok: false,
      reason: "Product is unavailable",
      code: "PRODUCT_OUT_OF_STOCK",
      availableQuantity,
      availability,
    };
  }

  const sizeError = validateSizeStock(line.size, availability.sizeStock, product.name);
  if (sizeError) {
    return {
      ok: false,
      reason: sizeError.message,
      code: sizeError.code as ErrorCode,
      availableQuantity,
      availability,
    };
  }

  const qtyError = validateQuantity(line.quantity, availableQuantity, product.name);
  if (qtyError) {
    return {
      ok: false,
      reason: qtyError.message,
      code: qtyError.code as ErrorCode,
      availableQuantity,
      availability,
    };
  }

  return { ok: true, availableQuantity, availability };
}

export function decrementStockSafe(
  product: Product,
  line: CheckoutLine,
): {
  nextProduct: Product;
  log: InventoryLogEntry;
} | null {
  const validation = validateStockBeforeCheckout(product, line);
  if (!validation.ok) return null;

  const selectedVariant = getVariantRecord(product, line.color);
  const nextProduct = structuredClone(product);
  const quantity = line.quantity;
  const variantIndex =
    nextProduct.colorVariants?.findIndex((variant) => variant.color === selectedVariant?.color) ??
    -1;

  if (variantIndex >= 0 && nextProduct.colorVariants) {
    const variant = nextProduct.colorVariants[variantIndex];
    variant.stock = clampStock(variant.stock - quantity);
    if (variant.sizeStock) {
      variant.sizeStock[line.size] = clampStock((variant.sizeStock[line.size] ?? 0) - quantity);
    }
    nextProduct.stock = clampStock(nextProduct.stock - quantity);
  } else {
    nextProduct.stock = clampStock(nextProduct.stock - quantity);
    if (nextProduct.sizeStock) {
      nextProduct.sizeStock[line.size] = clampStock(
        (nextProduct.sizeStock[line.size] ?? 0) - quantity,
      );
    }
  }

  const after = validation.availableQuantity - quantity;
  const log: InventoryLogEntry = {
    productId: product.id,
    variantSku: validation.availability.selectedVariant?.sku,
    quantityChange: -quantity,
    quantityAfter: after,
    changeType: "order",
    notes: line.variantId ? `variant:${line.variantId}` : undefined,
  };

  return { nextProduct, log };
}

export function getLowStockFlag(product: Product, color?: string) {
  return getProductAvailability(product, color).lowStock;
}
