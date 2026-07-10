export const ErrorCodes = {
  PRODUCT_UNAVAILABLE: "PRODUCT_UNAVAILABLE",
  PRODUCT_ARCHIVED: "PRODUCT_ARCHIVED",
  PRODUCT_DRAFT: "PRODUCT_DRAFT",
  PRODUCT_INACTIVE: "PRODUCT_INACTIVE",
  VARIANT_INACTIVE: "VARIANT_INACTIVE",
  VARIANT_NOT_FOUND: "VARIANT_NOT_FOUND",
  SIZE_NOT_FOUND: "SIZE_NOT_FOUND",
  SIZE_OUT_OF_STOCK: "SIZE_OUT_OF_STOCK",
  PRODUCT_OUT_OF_STOCK: "PRODUCT_OUT_OF_STOCK",
  PRICE_MISMATCH: "PRICE_MISMATCH",
  QUANTITY_EXCEEDED: "QUANTITY_EXCEEDED",
  INVALID_QUANTITY: "INVALID_QUANTITY",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface InventoryError {
  code: ErrorCode;
  message: string;
}

export function clampStock(value: number | undefined | null): number {
  return Math.max(0, Number(value ?? 0) || 0);
}

export function normalizeSizeStock(
  sizeStock?: Record<string, number> | null,
): Record<string, number> {
  if (!sizeStock) return {};
  const raw = Object.fromEntries(
    Object.entries(sizeStock).map(([size, quantity]) => [size, clampStock(quantity)]),
  );
  const hasAnyNonZero = Object.values(raw).some((v) => v > 0);
  return hasAnyNonZero ? raw : {};
}

export function isSizeTracked(sizeStock: Record<string, number>): boolean {
  return Object.keys(sizeStock).length > 0;
}

export interface StockQuery {
  stock: number;
  size_stock: Record<string, number> | null | undefined;
}

export function getAvailableStock(
  product: StockQuery,
  size?: string,
): { quantity: number; error?: InventoryError } {
  const stockMap = normalizeSizeStock(product.size_stock);

  if (!isSizeTracked(stockMap)) {
    return { quantity: product.stock };
  }

  if (!size) {
    return { quantity: product.stock };
  }

  const sizeQty = stockMap[size];
  if (sizeQty === undefined) {
    return {
      quantity: 0,
      error: { code: ErrorCodes.SIZE_NOT_FOUND, message: "Selected size is unavailable" },
    };
  }

  return { quantity: Math.min(product.stock, sizeQty) };
}

export function validatePrice(
  dbPrice: number,
  expectedPrice?: number | null,
): InventoryError | undefined {
  if (expectedPrice == null) return undefined;
  if (Math.abs(dbPrice - expectedPrice) > 0.001) {
    return { code: ErrorCodes.PRICE_MISMATCH, message: "Price has changed" };
  }
  return undefined;
}

export function isStockOnlyError(code: ErrorCode): boolean {
  return (
    code === ErrorCodes.SIZE_OUT_OF_STOCK ||
    code === ErrorCodes.PRODUCT_OUT_OF_STOCK ||
    code === ErrorCodes.QUANTITY_EXCEEDED
  );
}

export function isStructuralError(code: ErrorCode): boolean {
  return (
    code === ErrorCodes.PRODUCT_UNAVAILABLE ||
    code === ErrorCodes.PRODUCT_ARCHIVED ||
    code === ErrorCodes.PRODUCT_DRAFT ||
    code === ErrorCodes.PRODUCT_INACTIVE ||
    code === ErrorCodes.VARIANT_INACTIVE ||
    code === ErrorCodes.VARIANT_NOT_FOUND ||
    code === ErrorCodes.SIZE_NOT_FOUND ||
    code === ErrorCodes.PRICE_MISMATCH ||
    code === ErrorCodes.INVALID_QUANTITY
  );
}

export function validateProductStatus(product: {
  is_active: boolean;
  status?: string | null;
  name?: string;
}): InventoryError | undefined {
  if (!product.is_active) {
    return {
      code: ErrorCodes.PRODUCT_INACTIVE,
      message: `${product.name ?? "Product"} is no longer available.`,
    };
  }
  if (product.status && product.status !== "active") {
    if (product.status === "archived") {
      return {
        code: ErrorCodes.PRODUCT_ARCHIVED,
        message: `${product.name ?? "Product"} has been archived.`,
      };
    }
    if (product.status === "draft") {
      return {
        code: ErrorCodes.PRODUCT_DRAFT,
        message: `${product.name ?? "Product"} is not available for purchase.`,
      };
    }
    return {
      code: ErrorCodes.PRODUCT_UNAVAILABLE,
      message: `${product.name ?? "Product"} is unavailable.`,
    };
  }
  return undefined;
}

export function validateVariant(
  variant?: { id: string; product_id: string; is_active: boolean; stock: number } | null,
  productName?: string,
): InventoryError | undefined {
  if (!variant) {
    return {
      code: ErrorCodes.VARIANT_NOT_FOUND,
      message: `Variant unavailable for ${productName ?? "product"}.`,
    };
  }
  if (!variant.is_active) {
    return {
      code: ErrorCodes.VARIANT_INACTIVE,
      message: `Variant is no longer available for ${productName ?? "product"}.`,
    };
  }
  if (variant.stock <= 0) {
    return {
      code: ErrorCodes.PRODUCT_OUT_OF_STOCK,
      message: `${productName ?? "Product"} variant is out of stock.`,
    };
  }
  return undefined;
}

export function validateSizeInList(
  size: string,
  sizes?: string[] | null,
  productName?: string,
): InventoryError | undefined {
  if (size && sizes && sizes.length > 0 && !sizes.includes(size)) {
    return {
      code: ErrorCodes.SIZE_NOT_FOUND,
      message: `Selected size is unavailable for ${productName ?? "product"}.`,
    };
  }
  return undefined;
}

export function validateSizeStock(
  size: string,
  sizeStock: Record<string, number> | null | undefined,
  productName?: string,
): InventoryError | undefined {
  if (!size) return undefined;
  const stockMap = normalizeSizeStock(sizeStock);
  if (!isSizeTracked(stockMap)) return undefined;
  const qty = stockMap[size];
  if (qty === undefined) {
    return {
      code: ErrorCodes.SIZE_NOT_FOUND,
      message: `Selected size is unavailable for ${productName ?? "product"}.`,
    };
  }
  if (qty <= 0) {
    return {
      code: ErrorCodes.SIZE_OUT_OF_STOCK,
      message: `Selected size is out of stock for ${productName ?? "product"}.`,
    };
  }
  return undefined;
}

export function validateQuantity(
  requested: number,
  available: number,
  productName?: string,
): InventoryError | undefined {
  if (requested <= 0) {
    return { code: ErrorCodes.INVALID_QUANTITY, message: "Quantity must be positive" };
  }
  if (requested > available) {
    return {
      code: ErrorCodes.QUANTITY_EXCEEDED,
      message: `Only ${available} unit${available !== 1 ? "s" : ""} remaining for ${productName ?? "product"}.`,
    };
  }
  return undefined;
}

export function isSizeTrackedJsonb(sizeStock: unknown): boolean {
  if (!sizeStock || typeof sizeStock !== "object") return false;
  if (Array.isArray(sizeStock)) return false;
  const keys = Object.keys(sizeStock as Record<string, unknown>);
  return keys.length > 0;
}
