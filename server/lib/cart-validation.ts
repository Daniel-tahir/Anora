import { supabaseAdmin } from "./supabase-admin";
import {
  getAvailableStock,
  validatePrice,
  validateProductStatus,
  validateVariant,
  validateSizeInList,
  validateSizeStock,
  validateQuantity,
  isStockOnlyError,
  isStructuralError,
  type ErrorCode,
  type InventoryError,
} from "@/lib/inventory-engine";

export interface ValidatedLineItem {
  productId: string;
  variantId: string | null;
  size: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  maxAvailable: number;
  subtotal: number;
  imageUrl?: string;
  color?: string;
  variantName?: string;
}

export interface CartValidationResult {
  ok: boolean;
  error?: string;
  errorCode?: ErrorCode;
  items: ValidatedLineItem[];
  subtotal: number;
  total: number;
}

export type CartItemInput = {
  productId: string;
  variantId?: string | null;
  size?: string;
  quantity: number;
  expectedUnitPrice?: number;
};

interface DbProduct {
  id: string;
  name: string;
  price: number;
  currency?: string;
  stock: number;
  size_stock: Record<string, number> | null;
  sizes: string[] | null;
  is_active: boolean;
  status: string | null;
  updated_at: string;
  sale_active?: boolean;
  discount_percent?: number;
  compare_price?: number | null;
}

interface DbVariant {
  id: string;
  product_id: string;
  name: string;
  price: number | null;
  compare_price: number | null;
  stock: number;
  is_active: boolean;
  sizes: string[] | null;
  size_stock: Record<string, number> | null;
  color_hex: string | null;
}

function collectErrors(errors: InventoryError[]): { message: string; isStructural: boolean } {
  const structural = errors.filter((e) => isStructuralError(e.code));
  const stock = errors.filter((e) => isStockOnlyError(e.code));

  if (structural.length > 0) {
    const msgs = structural.map((e) => e.message).slice(0, 3);
    const remaining = structural.length - msgs.length;
    const suffix =
      remaining > 0 ? ` (and ${remaining} other issue${remaining > 1 ? "s" : ""})` : "";
    return { message: `Your bag has changed: ${msgs.join("; ")}${suffix}`, isStructural: true };
  }

  if (stock.length === 1) {
    return { message: stock[0].message, isStructural: false };
  }
  const msgs = stock.map((e) => e.message).slice(0, 3);
  const remaining = stock.length - msgs.length;
  const suffix = remaining > 0 ? ` (and ${remaining} other issue${remaining > 1 ? "s" : ""})` : "";
  return { message: `${msgs.join("; ")}${suffix}`, isStructural: false };
}

export async function validateCartItems(input: CartItemInput[]): Promise<CartValidationResult> {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Cart is empty", items: [], subtotal: 0, total: 0 };
  }

  for (const item of input) {
    if (
      !item.productId ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 999
    ) {
      return { ok: false, error: "Invalid cart item", items: [], subtotal: 0, total: 0 };
    }
  }

  const productIds = [...new Set(input.map((i) => i.productId))];
  const variantRequests = input.filter((i) => i.variantId);
  const variantIds = [...new Set(variantRequests.map((i) => i.variantId!))];

  const { data: products, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, price, stock, size_stock, sizes, is_active, status, updated_at, sale_active, discount_percent, compare_price")
    .in("id", productIds);

  if (productError) {
    return { ok: false, error: "Unable to validate cart", items: [], subtotal: 0, total: 0 };
  }

  const { data: images, error: imagesError } = await supabaseAdmin
    .from("product_images")
    .select("product_id, variant_id, image_url, sort_order")
    .in("product_id", productIds)
    .order("sort_order", { ascending: true });

  const imageMap = new Map<string, string>();
  const variantImageMap = new Map<string, string>();
  if (!imagesError && images) {
    for (const img of images) {
      if (img.variant_id) {
        if (!variantImageMap.has(img.variant_id)) {
          variantImageMap.set(img.variant_id, img.image_url);
        }
      } else {
        if (!imageMap.has(img.product_id)) {
          imageMap.set(img.product_id, img.image_url);
        }
      }
    }
  }

  if (!products || products.length !== productIds.length) {
    const found = new Set((products ?? []).map((p: DbProduct) => p.id));
    const missing = productIds.filter((id) => !found.has(id));
    if (missing.length >= 1) {
      return {
        ok: false,
        error:
          missing.length === 1
            ? "Product no longer exists."
            : `Products no longer exist: ${missing.length} items removed from catalog.`,
        items: [],
        subtotal: 0,
        total: 0,
      };
    }
  }

  const productMap = new Map<string, DbProduct>();
  for (const p of products!) {
    productMap.set(p.id, p as DbProduct);
  }

  const variantMap = new Map<string, DbVariant>();
  const productVariantsMap = new Map<string, DbVariant[]>();

  const { data: allProductVariants, error: variantError } = await supabaseAdmin
    .from("product_variants")
    .select("id, product_id, name, price, compare_price, stock, is_active, sizes, size_stock, color_hex")
    .in("product_id", productIds)
    .eq("is_active", true);

  if (!variantError && allProductVariants) {
    for (const v of allProductVariants as DbVariant[]) {
      variantMap.set(v.id, v);
      
      const list = productVariantsMap.get(v.product_id) ?? [];
      list.push(v);
      productVariantsMap.set(v.product_id, list);
    }
  }

  const errors: InventoryError[] = [];
  const validated: ValidatedLineItem[] = [];
  let subtotal = 0;

  for (const item of input) {
    const product = productMap.get(item.productId);
    if (!product) {
      errors.push({ code: "PRODUCT_UNAVAILABLE", message: "Product no longer exists." });
      continue;
    }

    const statusError = validateProductStatus(product);
    if (statusError) {
      errors.push(statusError);
      continue;
    }

    const size = item.size ?? "";

    const activeVariants = productVariantsMap.get(item.productId) ?? [];
    const hasActualColors = activeVariants.some(v => v.color_hex && v.name !== 'Default');
    const requiresColorVariant = activeVariants.length > 0 && hasActualColors;

    if (requiresColorVariant) {
      if (!item.variantId) {
        errors.push({
          code: "VARIANT_NOT_FOUND",
          message: `Color variant selection is required for ${product.name}.`,
        });
        continue;
      }

      const variant = variantMap.get(item.variantId);
      if (!variant || variant.product_id !== item.productId || !variant.is_active) {
        errors.push({
          code: "VARIANT_NOT_FOUND",
          message: `Selected color variant is unavailable for ${product.name}.`,
        });
        continue;
      }

      const color = variant.name;
      if (!color) {
        errors.push({
          code: "VARIANT_NOT_FOUND",
          message: `Selected color is unavailable for ${product.name}.`,
        });
        continue;
      }

      const variantSizes = variant.sizes ?? product.sizes;
      const actualSizesExist = variantSizes && variantSizes.length > 0 && !(variantSizes.length === 1 && variantSizes[0] === "OS");
      if (actualSizesExist && !size) {
        errors.push({
          code: "SIZE_NOT_FOUND",
          message: `Size selection is required for ${product.name}.`,
        });
        continue;
      }

      const sizeListError = validateSizeInList(size, variantSizes, product.name);
      if (sizeListError) {
        errors.push(sizeListError);
        continue;
      }

      const basePrice = variant.price ?? product.price;
      let unitPrice = Number(basePrice);
      if (product.sale_active && product.discount_percent && product.discount_percent > 0) {
        unitPrice = unitPrice * (1 - product.discount_percent / 100);
      }
      if (item.expectedUnitPrice != null) {
        const priceError = validatePrice(unitPrice, item.expectedUnitPrice);
        if (priceError) {
          errors.push(priceError);
          continue;
        }
      }

      const effectiveSizeStock = variant.size_stock ?? product.size_stock;
      const sizeStockError = validateSizeStock(size, effectiveSizeStock, product.name);
      if (sizeStockError) {
        errors.push(sizeStockError);
        continue;
      }

      const { quantity: maxAvailable } = getAvailableStock(
        { stock: variant.stock, size_stock: effectiveSizeStock },
        size,
      );

      const qtyError = validateQuantity(item.quantity, maxAvailable, product.name);
      if (qtyError) {
        errors.push(qtyError);
        continue;
      }

      const lineSubtotal = Number(unitPrice) * item.quantity;
      subtotal += lineSubtotal;
      validated.push({
        productId: item.productId,
        variantId: item.variantId,
        size,
        productName: product.name,
        unitPrice: Number(unitPrice),
        quantity: item.quantity,
        maxAvailable,
        subtotal: lineSubtotal,
        imageUrl: (item.variantId && variantImageMap.get(item.variantId)) || imageMap.get(item.productId),
        color: color || undefined,
        variantName: variant.name !== "Default" ? variant.name : undefined,
      });
      continue;
    }

    // Fall through: No color variant is required for this product.
    if (item.variantId) {
      // If a variantId is passed, validate using the variant details
      const variant = variantMap.get(item.variantId);
      if (variant && variant.product_id === item.productId && variant.is_active) {
        const variantSizes = variant.sizes ?? product.sizes;
        const actualSizesExist = variantSizes && variantSizes.length > 0 && !(variantSizes.length === 1 && variantSizes[0] === "OS");
        if (actualSizesExist && !size) {
          errors.push({
            code: "SIZE_NOT_FOUND",
            message: `Size selection is required for ${product.name}.`,
          });
          continue;
        }

        const sizeListError = validateSizeInList(size, variantSizes, product.name);
        if (sizeListError) {
          errors.push(sizeListError);
          continue;
        }

        const basePrice = variant.price ?? product.price;
        let unitPrice = Number(basePrice);
        if (product.sale_active && product.discount_percent && product.discount_percent > 0) {
          unitPrice = unitPrice * (1 - product.discount_percent / 100);
        }
        if (item.expectedUnitPrice != null) {
          const priceError = validatePrice(unitPrice, item.expectedUnitPrice);
          if (priceError) {
            errors.push(priceError);
            continue;
          }
        }

        const effectiveSizeStock = variant.size_stock ?? product.size_stock;
        const sizeStockError = validateSizeStock(size, effectiveSizeStock, product.name);
        if (sizeStockError) {
          errors.push(sizeStockError);
          continue;
        }

        const { quantity: maxAvailable } = getAvailableStock(
          { stock: variant.stock, size_stock: effectiveSizeStock },
          size,
        );

        const qtyError = validateQuantity(item.quantity, maxAvailable, product.name);
        if (qtyError) {
          errors.push(qtyError);
          continue;
        }

        const lineSubtotal = Number(unitPrice) * item.quantity;
        subtotal += lineSubtotal;
        validated.push({
          productId: item.productId,
          variantId: item.variantId,
          size,
          productName: product.name,
          unitPrice: Number(unitPrice),
          quantity: item.quantity,
          maxAvailable,
          subtotal: lineSubtotal,
          imageUrl: (item.variantId && variantImageMap.get(item.variantId)) || imageMap.get(item.productId),
          color: variant.name !== "Default" ? variant.name : undefined,
          variantName: variant.name !== "Default" ? variant.name : undefined,
        });
        continue;
      } else {
        errors.push({
          code: "VARIANT_NOT_FOUND",
          message: `Product ${product.name} does not have active variants.`,
        });
        continue;
      }
    }

    // No variantId passed, and color variant is not required. Validate using product base details:
    const productSizes = product.sizes;
    const actualSizesExist = productSizes && productSizes.length > 0 && !(productSizes.length === 1 && productSizes[0] === "OS");
    if (actualSizesExist && !size) {
      errors.push({
        code: "SIZE_NOT_FOUND",
        message: `Size selection is required for ${product.name}.`,
      });
      continue;
    }

    const sizeListError = validateSizeInList(size, productSizes, product.name);
    if (sizeListError) {
      errors.push(sizeListError);
      continue;
    }

    const sizeStockError = validateSizeStock(size, product.size_stock, product.name);
    if (sizeStockError) {
      errors.push(sizeStockError);
      continue;
    }

    const { quantity: maxAvailable } = getAvailableStock(product, size);

    const qtyError = validateQuantity(item.quantity, maxAvailable, product.name);
    if (qtyError) {
      errors.push(qtyError);
      continue;
    }

    let unitPrice = Number(product.price);
    if (product.sale_active && product.compare_price && Number(product.compare_price) > Number(product.price)) {
      unitPrice = Number(product.compare_price);
    }
    if (product.sale_active && product.discount_percent && product.discount_percent > 0) {
      unitPrice = unitPrice * (1 - product.discount_percent / 100);
    }

    if (item.expectedUnitPrice != null) {
      const priceError = validatePrice(unitPrice, item.expectedUnitPrice);
      if (priceError) {
        errors.push(priceError);
        continue;
      }
    }

    const lineSubtotal = unitPrice * item.quantity;
    subtotal += lineSubtotal;
    validated.push({
      productId: item.productId,
      variantId: null,
      size,
      productName: product.name,
      unitPrice: Number(unitPrice),
      quantity: item.quantity,
      maxAvailable,
      subtotal: lineSubtotal,
      imageUrl: imageMap.get(item.productId),
    });
  }

  if (errors.length > 0) {
    const { message } = collectErrors(errors);
    return { ok: false, error: message, items: [], subtotal: 0, total: 0 };
  }

  return {
    ok: true,
    items: validated,
    subtotal,
    total: subtotal,
  };
}

export interface CouponValidationResult {
  ok: boolean;
  error?: string;
  discountType?: "percentage" | "fixed";
  discountValue?: number;
}

export async function validateCoupon(
  code: string,
  subtotal?: number,
): Promise<CouponValidationResult> {
  if (!code) return { ok: false, error: "No coupon code provided" };

  const { data, error } = await supabaseAdmin
    .from("coupons")
    .select("discount_type, discount_value, min_order, max_uses, used_count, starts_at, expires_at")
    .eq("code", code.toUpperCase())
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return { ok: false, error: "Invalid coupon code" };
  }

  const now = new Date();

  if (data.starts_at && new Date(data.starts_at) > now) {
    return { ok: false, error: "Coupon is not yet active" };
  }

  if (data.expires_at && new Date(data.expires_at) < now) {
    return { ok: false, error: "Coupon has expired" };
  }

  if (data.max_uses && data.used_count >= data.max_uses) {
    return { ok: false, error: "Coupon usage limit has been reached" };
  }

  if (subtotal !== undefined && data.min_order && subtotal < Number(data.min_order)) {
    return {
      ok: false,
      error: `Minimum order of $${Number(data.min_order).toFixed(2)} required`,
    };
  }

  return {
    ok: true,
    discountType: data.discount_type as "percentage" | "fixed",
    discountValue: Number(data.discount_value),
  };
}
