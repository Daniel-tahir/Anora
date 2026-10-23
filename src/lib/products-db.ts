import { supabase } from "./supabase";

export interface DbProductImage {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
}

export interface DbProduct {
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
  sale_active: boolean;
  discount_percent: number;
  created_at: string;
  updated_at: string;
}

export interface DbCategoryInfo {
  id: string;
  name: string;
  slug: string;
}

export interface DbProductVariant {
  id: string;
  name: string;
  sku: string | null;
  price: number | null;
  compare_price: number | null;
  stock: number;
  sizes: string[];
  size_stock: Record<string, number>;
  color_hex: string | null;
  is_active: boolean;
  images: string[];
}

export interface ProductDetailResponse {
  product: DbProduct;
  images: DbProductImage[];
  category: DbCategoryInfo | null;
  parent_category: DbCategoryInfo | null;
  variants: DbProductVariant[];
}

export async function getProductBySlug(slug: string): Promise<ProductDetailResponse | null> {
  const { data, error } = await supabase.rpc("get_product_by_slug", { p_slug: slug });
  if (error) throw error;
  return data as ProductDetailResponse | null;
}

export async function getProductsByCategorySlug(
  slug: string,
  page = 1,
  pageSize = 50,
): Promise<DbProduct[]> {
  const { data, error } = await supabase.rpc("get_products_by_category_slug", {
    p_slug: slug,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  return (data ?? []) as DbProduct[];
}
