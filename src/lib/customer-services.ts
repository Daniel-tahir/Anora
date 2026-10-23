import { supabase } from "./supabase";
import { products as catalog, getProductPriceInfo, type Product, type ColorVariant } from "./products";
import {
  DEFAULT_SIZE_THRESHOLD,
  getProductAvailability,
  validateStockBeforeCheckout,
} from "./inventory";
import { isStockOnlyError } from "./inventory-validation";

export interface CartItem {
  id: string;
  productId: string;
  variantId?: string | null;
  size: string;
  quantity: number;
  source: "local" | "server";
}

export interface WishlistState {
  ids: string[];
}

export interface CartSnapshot {
  items: CartItem[];
  count: number;
  subtotal: number;
  detailed: { item: CartItem; product: Product; active: boolean; availableQuantity: number }[];
}

type Listener = () => void;

const CART_KEY = "anora.customer.cart.v2";
const WISH_KEY = "anora.customer.wishlist.v2";
const SESSION_KEY = "anora.customer.session.v1";

let cartItems: CartItem[] = [];
let wishIds: string[] = [];
let currentUserId: string | null = null;
let hydrated = false;
let cartSnapshotCache: CartSnapshot = { items: [], count: 0, subtotal: 0, detailed: [] };
let wishlistSnapshotCache: WishlistState = { ids: [] };
const listeners = new Set<Listener>();
const productRegistry = new Map<string, Product>();
const searchCache = new Map<string, Product[]>();

for (const p of catalog) {
  productRegistry.set(p.id, p);
}

let dbCatalog: Product[] = [];
let dbCatalogLoaded = false;
let dbCatalogPromise: Promise<void> | null = null;

async function loadDbCatalog() {
  if (dbCatalogPromise) return dbCatalogPromise;
  dbCatalogPromise = (async () => {
    try {
      const { data: rows, error } = await supabase
        .from("products")
        .select(`
          id, slug, name, price, compare_price, stock, size_stock, sizes, sku, colors, fabric, material, is_new, is_best_seller, featured, status, is_active, sale_active, discount_percent, description, category_id,
          product_images (image_url, sort_order, variant_id),
          product_variants (id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active)
        `)
        .eq("is_active", true)
        .eq("status", "active");

      if (error) throw error;

      if (rows) {
        dbCatalog = rows.map((row) => {
          const sortedImages = (row.product_images || [])
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((img: any) => img.image_url)
            .filter(Boolean);

          const activeVariants = (row.product_variants || [])
            .filter((v: any) => v.is_active)
            .map((v: any) => {
              const varImages = (row.product_images || [])
                .filter((img: any) => img.variant_id === v.id)
                .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
                .map((img: any) => img.image_url)
                .filter(Boolean);

              return {
                id: v.id,
                color: v.name,
                color_hex: v.color_hex || undefined,
                images: varImages.length > 0 ? varImages : sortedImages,
                sizes: v.sizes || row.sizes || [],
                sizeStock: v.size_stock || {},
                stock: v.stock || 0,
                sku: v.sku || row.sku || "",
                priceOverride: v.price ? Number(v.price) : undefined,
                comparePriceOverride: v.compare_price ? Number(v.compare_price) : undefined,
              };
            });

          return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            price: Number(row.price),
            compare_price: row.compare_price,
            category: "clothing" as const,
            subcategory: "",
            description: row.description || "",
            fabric: row.fabric || undefined,
            material: row.material || undefined,
            color: (row.colors as any)?.[0]?.name || "Ivory",
            sizes: (row.sizes as string[]) || [],
            sku: row.sku || "",
            stock: row.stock || 0,
            sizeStock: (row.size_stock as Record<string, number>) || {},
            images: sortedImages,
            badge: row.is_new ? "New" : row.is_best_seller ? "Best Seller" : undefined,
            sale_active: row.sale_active || false,
            discount_percent: row.discount_percent || 0,
            colorVariants: activeVariants.length > 0 ? activeVariants : undefined,
          };
        });
        dbCatalogLoaded = true;
      }
    } catch (err) {
      console.error("Failed to load search catalog", err);
    }
  })();
  return dbCatalogPromise;
}

interface CartRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  size: string | null;
  quantity: number;
}

interface WishlistRow {
  product_id: string;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function ensureSessionId() {
  if (!isBrowser()) return "server";
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, next);
  return next;
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function initCrossTabSync() {
  if (!isBrowser()) return;
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === CART_KEY || e.key === WISH_KEY) {
      hydrated = false;
      hydrate();
      notify();
    }
  });
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  cartItems = readJson<CartItem[]>(CART_KEY, []);
  wishIds = readJson<string[]>(WISH_KEY, []);
  ensureSessionId();
  rebuildSnapshots();

  loadDbCatalog().then(() => {
    notify();
  });

  const missingIds = [
    ...cartItems.map((i) => i.productId),
    ...wishIds,
  ].filter((id) => !productRegistry.has(id) && !catalog.find((p) => p.id === id));
  if (missingIds.length > 0) {
    loadProductsByIds(missingIds).then(() => {
      rebuildSnapshots();
      notify();
    });
  }
}

function persist() {
  writeJson(CART_KEY, cartItems);
  writeJson(WISH_KEY, wishIds);
}

function rebuildSnapshots() {
  const detailed = cartItems.flatMap((item) => {
    const product = getProduct(item.productId);
    if (!product) {
      return [
        {
          item,
          product: {
            id: item.productId,
            slug: "",
            name: "",
            price: 0,
            category: "clothing" as const,
            subcategory: "",
            description: "",
            color: "",
            sizes: [],
            sku: "",
            stock: 0,
            sizeStock: {},
            images: [],
          },
          active: false,
          availableQuantity: 0,
        },
      ];
    }
    const validation = validateStockBeforeCheckout(product, {
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      size: item.size,
      quantity: item.quantity,
    });

    const isStockIssue =
      !validation.ok && validation.code ? isStockOnlyError(validation.code) : false;

    return [
      {
        item,
        product,
        active: isStockIssue ? item.quantity > 0 : validation.ok && item.quantity > 0,
        availableQuantity: validation.availableQuantity,
      },
    ];
  });

  const activeDetailed = detailed.filter((entry) => entry.active);
  cartSnapshotCache = {
    items: cartItems,
    count: activeDetailed.reduce((sum, entry) => sum + entry.item.quantity, 0),
    subtotal: activeDetailed.reduce((sum, entry) => {
      if (!entry.product) return sum;
      const variant = entry.item.variantId ? entry.product.colorVariants?.find((v) => v.id === entry.item.variantId) : undefined;
      const price = getProductPriceInfo(entry.product, variant?.color).salePrice;
      return sum + entry.item.quantity * price;
    }, 0),
    detailed,
  };
  wishlistSnapshotCache = { ids: wishIds };
}

export function registerProduct(product: Product) {
  productRegistry.set(product.id, product);
}

export function getProduct(productId: string) {
  return productRegistry.get(productId) ?? catalog.find((entry) => entry.id === productId);
}

const productsLoading = new Set<string>();

async function loadProductsByIds(ids: string[]) {
  const missing = ids.filter(
    (id) =>
      !productRegistry.has(id) && !catalog.find((p) => p.id === id) && !productsLoading.has(id),
  );
  if (missing.length === 0) return;
  for (const id of missing) productsLoading.add(id);

  try {
    const { data: stockRows } = await supabase
      .from("products")
      .select(
        "id, stock, size_stock, sizes, sku, price, compare_price, name, slug, color, description, material, fabric, is_new, is_best_seller, low_stock_threshold, category_id, sale_active, discount_percent",
      )
      .in("id", missing);

    const { data: imageRows } = await supabase
      .from("product_images")
      .select("product_id, image_url, sort_order, variant_id")
      .in("product_id", missing)
      .order("sort_order");

    const { data: variantRows } = await supabase
      .from("product_variants")
      .select("id, product_id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex")
      .in("product_id", missing)
      .eq("is_active", true);

    const imageMap = new Map<string, string[]>();
    const variantImageMap = new Map<string, string[]>();
    if (imageRows) {
      for (const row of imageRows) {
        if (row.variant_id) {
          const list = variantImageMap.get(row.variant_id) ?? [];
          list.push(row.image_url);
          variantImageMap.set(row.variant_id, list);
        } else {
          const list = imageMap.get(row.product_id) ?? [];
          list.push(row.image_url);
          imageMap.set(row.product_id, list);
        }
      }
    }

    const variantMap = new Map<string, ColorVariant[]>();
    if (variantRows) {
      for (const row of variantRows) {
        const list = variantMap.get(row.product_id) ?? [];
        const varImages = variantImageMap.get(row.id) ?? [];
        list.push({
          id: row.id,
          color: row.name,
          color_hex: row.color_hex ?? undefined,
          images: varImages.length > 0 ? varImages : (imageMap.get(row.product_id) ?? []),
          sizes: (row.sizes as string[]) ?? [],
          sizeStock: (row.size_stock as Record<string, number>) ?? {},
          stock: row.stock,
          sku: row.sku ?? "",
          priceOverride: row.price ? Number(row.price) : undefined,
          comparePriceOverride: row.compare_price ? Number(row.compare_price) : undefined,
        });
        variantMap.set(row.product_id, list);
      }
    }

    if (stockRows) {
      for (const row of stockRows) {
        const parentImages = imageMap.get(row.id) ?? [];
        const colorVariants = variantMap.get(row.id);
        const stub: Product = {
          id: row.id,
          slug: row.slug,
          name: row.name,
          price: row.price,
          compare_price: row.compare_price,
          category: "clothing" as const,
          subcategory: "",
          description: row.description ?? "",
          fabric: row.fabric ?? undefined,
          material: row.material ?? undefined,
          color: colorVariants?.[0]?.color ?? row.color ?? "Ivory",
          sizes: (row.sizes as string[]) ?? [],
          sku: row.sku ?? "",
          stock: row.stock,
          sizeStock: (row.size_stock as Record<string, number>) ?? {},
          images: parentImages.length > 0 ? parentImages : (colorVariants?.[0]?.images ?? []),
          badge: row.is_new ? "New" : row.is_best_seller ? "Best Seller" : undefined,
          sale_active: row.sale_active ?? false,
          discount_percent: row.discount_percent ?? 0,
          colorVariants: colorVariants && colorVariants.length > 0 ? colorVariants : undefined,
        };
        productRegistry.set(row.id, stub);
      }
    }
  } catch {
    // Best-effort
  } finally {
    for (const id of missing) productsLoading.delete(id);
  }
}

function cartKey(productId: string, variantId?: string | null, size?: string) {
  return [productId, variantId ?? "", size ?? ""].join("|");
}

function clamp(qty: number) {
  return Math.max(0, Math.floor(Number(qty) || 0));
}

function computeCartItem(
  existing: CartItem | undefined,
  productId: string,
  variantId: string | null | undefined,
  size: string,
  quantity: number,
): CartItem {
  return {
    id: existing?.id ?? crypto.randomUUID(),
    productId,
    variantId: variantId ?? null,
    size,
    quantity: clamp(quantity),
    source: currentUserId ? "server" : "local",
  };
}

export function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCartSnapshot(): CartSnapshot {
  hydrate();
  return cartSnapshotCache;
}

export function getWishlistSnapshot() {
  hydrate();
  return wishlistSnapshotCache;
}

export function setCustomerUser(userId: string | null) {
  hydrate();
  currentUserId = userId;
  if (userId === null) {
    cartItems = cartItems.map((item) => ({
      ...item,
      source: "local" as const,
    }));
    persist();
    rebuildSnapshots();
    notify();
  }
}

export async function validateCartStock(items: CartItem[] = cartItems): Promise<CartItem[]> {
  hydrate();
  if (items.length === 0) return items;

  const productIds = Array.from(new Set(items.map((i) => i.productId)));
  try {
    const { data: rows } = await supabase
      .from("products")
      .select(`
        id, slug, name, price, compare_price, stock, size_stock, sizes, sku, colors, fabric, material, is_new, is_best_seller, featured, status, is_active, sale_active, discount_percent, description, category_id, popularity_score, created_at,
        product_images (image_url, sort_order, variant_id),
        product_variants (id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active)
      `)
      .in("id", productIds);

    if (rows) {
      const { mapDbProduct } = await import("./products-query");
      rows.forEach((row) => {
        const mapped = mapDbProduct(row);
        productRegistry.set(mapped.id, mapped);
      });
    }
  } catch (err) {
    console.error("Failed to fetch fresh stock for validation:", err);
  }

  const validated = items.map((item) => {
    const product = getProduct(item.productId);
    if (!product) {
      return { ...item, quantity: 0 };
    }
    const validation = validateStockBeforeCheckout(product, {
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      size: item.size,
      quantity: item.quantity,
    });

    const isStockIssue =
      !validation.ok && validation.code ? isStockOnlyError(validation.code) : false;

    if (!validation.ok && !isStockIssue) {
      return { ...item, quantity: 0 };
    }

    const nextQty = validation.ok
      ? item.quantity
      : Math.min(item.quantity, validation.availableQuantity);
    return {
      ...item,
      quantity: nextQty,
    };
  });
  cartItems = validated;
  persist();
  rebuildSnapshots();
  notify();
  return validated;
}

export async function addToCart(productId: string, variantId?: string | null, size = "", qty = 1) {
  hydrate();
  const product = getProduct(productId);
  const validation = product
    ? validateStockBeforeCheckout(product, {
      productId,
      variantId: variantId ?? undefined,
      size,
      quantity: qty,
    })
    : null;
  if (validation && !validation.ok) {
    const isStockIssue = validation.code ? isStockOnlyError(validation.code) : false;
    if (!isStockIssue) return;
  }

  const key = cartKey(productId, variantId, size);
  const existing = cartItems.find(
    (item) => cartKey(item.productId, item.variantId, item.size) === key,
  );
  const nextQuantity = clamp((existing?.quantity ?? 0) + qty);
  const capped = validation ? Math.min(nextQuantity, validation.availableQuantity) : nextQuantity;
  const next = computeCartItem(existing, productId, variantId, size, capped);
  cartItems = existing
    ? cartItems.map((item) => (item.id === existing.id ? next : item))
    : [...cartItems, next];
  persist();
  rebuildSnapshots();
  notify();
  if (currentUserId) {
    await syncCartWithServer();
  }
}

export async function removeFromCart(itemId: string) {
  hydrate();
  cartItems = cartItems.filter((item) => item.id !== itemId);
  persist();
  rebuildSnapshots();
  notify();
  if (currentUserId) {
    await syncCartWithServer();
  }
}

export async function clearCart() {
  hydrate();
  cartItems = [];
  persist();
  rebuildSnapshots();
  notify();
  if (currentUserId) {
    await syncCartWithServer();
  }
}

export async function updateCartQuantity(itemId: string, qty: number) {
  hydrate();
  const nextQty = clamp(qty);
  cartItems = cartItems
    .map((item) => (item.id === itemId ? { ...item, quantity: nextQty } : item))
    .filter((item) => item.quantity > 0);
  validateCartStock();
  if (currentUserId) {
    await syncCartWithServer();
  }
}

export async function syncCartWithServer() {
  hydrate();
  if (!currentUserId) return cartItems;

  await loadProductsByIds(cartItems.map((i) => i.productId));

  cartItems = cartItems.map((item) => {
    const product = getProduct(item.productId);
    if (!product) {
      return { ...item, source: "server" as const };
    }
    const validation = validateStockBeforeCheckout(product, {
      productId: item.productId,
      variantId: item.variantId ?? undefined,
      size: item.size,
      quantity: item.quantity,
    });

    const isStockIssue =
      !validation.ok && validation.code ? isStockOnlyError(validation.code) : false;

    if (!validation.ok && !isStockIssue) {
      return { ...item, quantity: 0, source: "server" as const };
    }

    return {
      ...item,
      quantity: validation.ok
        ? item.quantity
        : Math.min(item.quantity, validation.availableQuantity),
      source: "server" as const,
    };
  });

  const { error: deleteError } = await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", currentUserId);

  if (deleteError) return cartItems;

  if (cartItems.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("cart_items")
      .insert(
        cartItems.map((item) => ({
          user_id: currentUserId!,
          product_id: item.productId,
          variant_id: item.variantId ?? null,
          size: item.size || "",
          quantity: item.quantity,
        })),
      )
      .select("id, product_id, variant_id, size");

    if (!insertError && inserted) {
      const idMap = new Map<string, string>();
      for (const row of inserted) {
        const key = cartKey(row.product_id, row.variant_id, row.size ?? "");
        idMap.set(key, row.id);
      }
      cartItems = cartItems.map((item) => ({
        ...item,
        id: idMap.get(cartKey(item.productId, item.variantId, item.size)) ?? item.id,
        source: "server" as const,
      }));
    }
  }

  persist();
  rebuildSnapshots();
  notify();
  return cartItems;
}

export async function mergeGuestCartToUser(userId: string) {
  if (!userId || typeof userId !== "string" || userId.length !== 36) {
    return cartItems;
  }
  hydrate();
  currentUserId = userId;

  const { data, error } = await supabase
    .from("cart_items")
    .select("id, product_id, variant_id, size, quantity")
    .eq("user_id", userId);

  if (currentUserId !== userId) return cartItems;
  if (error) return cartItems;

  // If local cart was cleared while we read from DB (e.g., by checkout
  // success handler after 3DS redirect), don't restore from server.
  // This prevents a race where mergeGuestCartToUser reads old server
  // items before syncCartWithServer deletes them, restoring a just-checked-out cart.
  const freshLocal = readJson<CartItem[]>(CART_KEY, []);
  if (freshLocal.length === 0 && cartItems.length > 0) {
    cartItems = [];
    await supabase.from("cart_items").delete().eq("user_id", userId);
    if (currentUserId !== userId) return cartItems;
    persist();
    rebuildSnapshots();
    notify();
    return cartItems;
  }

  // Re-instate fresh local state in case it changed
  cartItems = freshLocal;

  await loadProductsByIds(cartItems.map((i) => i.productId));
  if (currentUserId !== userId) return cartItems;

  const localMap = new Map<string, CartItem>();
  for (const item of cartItems) {
    const key = cartKey(item.productId, item.variantId, item.size);
    const existing = localMap.get(key);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + item.quantity, 999);
    } else {
      localMap.set(key, { ...item });
    }
  }

  const merged = new Map<string, CartItem>();
  for (const row of (data ?? []) as CartRow[]) {
    const key = cartKey(row.product_id, row.variant_id, row.size ?? "");
    merged.set(key, {
      id: row.id,
      productId: row.product_id,
      variantId: row.variant_id,
      size: row.size ?? "",
      quantity: row.quantity,
      source: "server" as const,
    });
  }

  for (const [key, item] of localMap) {
    const existing = merged.get(key);
    if (existing) {
      const maxQty = Math.max(existing.quantity, item.quantity);
      const product = getProduct(item.productId);
      const validation = product
        ? validateStockBeforeCheckout(product, {
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          size: item.size,
          quantity: maxQty,
        })
        : null;
      merged.set(key, {
        ...existing,
        quantity: validation?.ok
          ? maxQty
          : Math.min(maxQty, validation?.availableQuantity ?? maxQty),
      });
    } else {
      merged.set(key, {
        ...item,
        source: "server" as const,
      });
    }
  }

  cartItems = Array.from(merged.values());
  await syncCartWithServer();
  if (currentUserId !== userId) return cartItems;
  rebuildSnapshots();
  return cartItems;
}

export async function addToWishlist(productId: string, variantId?: string | null) {
  hydrate();
  const key = variantId ? `${productId}|${variantId}` : productId;
  if (!wishIds.includes(key)) {
    wishIds = [...wishIds, key];
    persist();
    rebuildSnapshots();
    notify();
  }
  if (!currentUserId) return;
  await supabase
    .from("wishlists")
    .upsert(
      { user_id: currentUserId, product_id: productId, variant_id: variantId || null },
      { onConflict: "user_id,product_id,variant_id" },
    );
}

export async function removeFromWishlist(productId: string, variantId?: string | null) {
  hydrate();
  const key = variantId ? `${productId}|${variantId}` : productId;
  wishIds = wishIds.filter((id) => id !== key);
  persist();
  rebuildSnapshots();
  notify();
  if (!currentUserId) return;

  const query = supabase
    .from("wishlists")
    .delete()
    .eq("user_id", currentUserId)
    .eq("product_id", productId);

  if (variantId) {
    void query.eq("variant_id", variantId);
  } else {
    void query.is("variant_id", null);
  }
  await query;
}

export function isInWishlist(productId: string, variantId?: string | null) {
  hydrate();
  const key = variantId ? `${productId}|${variantId}` : productId;
  return wishIds.includes(key);
}

export async function syncWishlistOnLogin(userId: string) {
  if (!userId || typeof userId !== "string" || userId.length !== 36) {
    return wishIds;
  }
  hydrate();
  currentUserId = userId;
  const { data, error } = await supabase
    .from("wishlists")
    .select("product_id, variant_id")
    .eq("user_id", userId);
  if (currentUserId !== userId) return wishIds;
  if (error) return wishIds;
  const dbKeys = ((data ?? []) as any[]).map((row) =>
    row.variant_id ? `${row.product_id}|${row.variant_id}` : row.product_id
  );
  const merged = new Set([
    ...dbKeys,
    ...wishIds,
  ]);
  wishIds = Array.from(merged);
  await supabase.from("wishlists").upsert(
    wishIds.map((key) => {
      const [productId, variantId] = key.split("|");
      return { user_id: userId, product_id: productId, variant_id: variantId || null };
    }),
    { onConflict: "user_id,product_id,variant_id" },
  );
  if (currentUserId !== userId) return wishIds;
  persist();
  rebuildSnapshots();
  notify();

  const missingIds = wishIds.map(key => key.split("|")[0]).filter(
    (id) => !productRegistry.has(id) && !catalog.find((p) => p.id === id)
  );
  if (missingIds.length > 0) {
    await loadProductsByIds(missingIds);
    if (currentUserId !== userId) return wishIds;
    rebuildSnapshots();
    notify();
  }

  return wishIds;
}

function scoreProduct(product: Product, query: string) {
  const target = [
    product.name,
    product.slug,
    product.color,
    product.fabric,
    product.material,
    product.category,
    product.subcategory,
    product.sku,
    ...(product.colorVariants ?? []).flatMap((variant) => [
      variant.color,
      variant.sku ?? "",
      ...(Object.values(variant.attributes ?? {}) as Array<string | number | boolean | null>).map(
        String,
      ),
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (target.includes(token)) score += 2;
    if (product.name.toLowerCase().includes(token)) score += 3;
    if (product.sku.toLowerCase().includes(token)) score += 3;
  }
  return score;
}

export function searchProducts(query: string) {
  hydrate();
  loadDbCatalog().then(() => {
    notify();
  });

  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const cached = searchCache.get(trimmed);
  if (cached) return cached;

  const sourceList = dbCatalogLoaded && dbCatalog.length > 0 ? dbCatalog : catalog;

  const localResults = sourceList
    .map((product) => ({ product, score: scoreProduct(product, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((entry) => entry.product);

  searchCache.set(trimmed, localResults);
  return localResults;
}

export function getCustomerFlags(product: Product) {
  const availability = getProductAvailability(product);
  return {
    lowStock:
      availability.lowStock || (product.metadata?.low_stock as boolean | undefined) === true,
    threshold: DEFAULT_SIZE_THRESHOLD,
  };
}
