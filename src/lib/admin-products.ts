import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ProductManagementRow {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_name: string;
  category_id: string;
  subcategory_name?: string;
  thumbnail?: string | null;
}

export interface AdminProductFull {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  description: string | null;
  short_description: string | null;
  price: number;
  compare_price: number | null;
  stock: number;
  low_stock_threshold: number;
  sizes: string[];
  size_stock: Record<string, number>;
  colors: { name: string; hex: string }[];
  fabric: string | null;
  material: string | null;
  badge: string | null;
  is_new: boolean;
  is_best_seller: boolean;
  featured: boolean;
  is_active: boolean;
  status: string;
  category_id: string;
  created_at: string;
  updated_at: string;
}

export interface AdminProductImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}

export interface AdminProductResponse {
  product: AdminProductFull;
  images: AdminProductImage[];
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  children?: CategoryNode[];
}

export interface ProductsManagementResponse {
  products: ProductManagementRow[];
  total: number;
}

export interface CategoryOption {
  id: string;
  name: string;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useProductsManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  status = "",
  categoryId = "",
  stockStatus = "",
) {
  const [result, setResult] = useState<ProductsManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = {
        p_page: page,
        p_page_size: pageSize,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
      };
      if (search) params.p_search = search;
      if (status) params.p_status = status;
      if (categoryId) params.p_category_id = categoryId;
      if (stockStatus) params.p_stock_status = stockStatus;

      const data = await rpc<ProductsManagementResponse>("get_products_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, status, categoryId, stockStatus]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export function useProductCategories() {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        setCategories(data ?? []);
        setLoading(false);
      });
  }, []);

  return { categories, loading };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function createProduct(data: {
  name: string;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  category_id: string;
  description?: string;
  short_description?: string;
  compare_price?: number;
  low_stock_threshold?: number;
  sizes?: string[];
  size_stock?: Record<string, number>;
  colors?: { name: string; hex: string }[];
  fabric?: string;
  material?: string;
  is_new?: boolean;
  is_best_seller?: boolean;
  featured?: boolean;
  status?: string;
}) {
  const isActive =
    (data.status ?? "draft") === "active" || (data.status ?? "draft") === "out_of_stock";
  const { error } = await supabase.from("products").insert({
    name: data.name,
    slug: data.slug,
    sku: data.sku,
    price: data.price,
    stock: data.stock,
    category_id: data.category_id,
    description: data.description ?? null,
    short_description: data.short_description ?? null,
    compare_price: data.compare_price ?? null,
    low_stock_threshold: data.low_stock_threshold ?? 5,
    sizes: data.sizes ?? [],
    size_stock: data.size_stock ?? {},
    colors: data.colors ?? [],
    fabric: data.fabric ?? null,
    material: data.material ?? null,
    is_new: data.is_new ?? false,
    is_best_seller: data.is_best_seller ?? false,
    featured: data.featured ?? false,
    status: data.status ?? "draft",
    is_active: isActive,
  });
  if (error) throw error;
}

export async function updateProduct(
  id: string,
  data: {
    name: string;
    slug: string;
    sku: string;
    price: number;
    stock: number;
    category_id: string;
    description?: string;
    short_description?: string;
    compare_price?: number;
    low_stock_threshold?: number;
    sizes?: string[];
    size_stock?: Record<string, number>;
    colors?: { name: string; hex: string }[];
    fabric?: string;
    material?: string;
    is_new?: boolean;
    is_best_seller?: boolean;
    featured?: boolean;
    status?: string;
  },
) {
  const updateData: Record<string, unknown> = {
    name: data.name,
    slug: data.slug,
    sku: data.sku,
    price: data.price,
    stock: data.stock,
    category_id: data.category_id,
    description: data.description ?? null,
    short_description: data.short_description ?? null,
    compare_price: data.compare_price ?? null,
    low_stock_threshold: data.low_stock_threshold ?? 5,
    sizes: data.sizes ?? [],
    size_stock: data.size_stock ?? {},
    colors: data.colors ?? [],
    fabric: data.fabric ?? null,
    material: data.material ?? null,
    is_new: data.is_new ?? false,
    is_best_seller: data.is_best_seller ?? false,
    featured: data.featured ?? false,
    updated_at: new Date().toISOString(),
  };
  if (data.status !== undefined) {
    updateData.status = data.status;
    updateData.is_active = data.status === "active" || data.status === "out_of_stock";
  }

  const { error } = await supabase.from("products").update(updateData).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  if (!id) throw new Error("deleteProduct: id is required");
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateProduct(productId: string): Promise<RpcResult> {
  if (!productId) throw new Error("duplicateProduct: productId is required");
  return rpc<RpcResult>("duplicate_product", { p_product_id: productId });
}

export async function bulkUpdateProducts(
  ids: string[],
  data: { status?: string; is_active?: boolean },
): Promise<RpcResult> {
  const params: Record<string, unknown> = { p_ids: ids };
  if (data.status) params.p_status = data.status;
  if (data.is_active !== undefined) params.p_is_active = data.is_active;
  return rpc<RpcResult>("bulk_update_products", params);
}

export async function bulkDeleteProducts(ids: string[]): Promise<RpcResult> {
  return rpc<RpcResult>("bulk_delete_products", { p_ids: ids });
}

export async function getAdminProduct(productId: string): Promise<AdminProductResponse> {
  return rpc<AdminProductResponse>("get_admin_product", { p_product_id: productId });
}

export async function getActiveCategoriesTree(): Promise<CategoryNode[]> {
  const { data, error } = await supabase.rpc("get_active_categories");
  if (error) throw error;
  return (data ?? []) as CategoryNode[];
}

export async function getAllActiveCategories(): Promise<
  { id: string; name: string; parent_id: string | null }[]
> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function uploadProductImage(
  productId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ image_url: string; id: string }> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const filePath = `products/${productId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filePath);

  const imageUrl = urlData?.publicUrl ?? "";
  if (!imageUrl) throw new Error("Failed to get public URL");

  const { data, error: insertError } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      image_url: imageUrl,
      sort_order: 0,
    })
    .select("id, image_url")
    .single();

  if (insertError) throw insertError;
  return { image_url: data.image_url, id: data.id };
}

export async function deleteProductImage(imageId: string): Promise<void> {
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw error;
}

export async function reorderProductImages(
  images: { id: string; sort_order: number }[],
): Promise<void> {
  for (const img of images) {
    const { error } = await supabase
      .from("product_images")
      .update({ sort_order: img.sort_order })
      .eq("id", img.id);
    if (error) throw error;
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
