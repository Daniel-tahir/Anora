import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Product } from "./products";
import type { Category } from "./products";
import { registerProduct } from "./customer-services";

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  parent_id: string | null;
  product_count: number;
  children: CategoryNode[];
}

export interface CategoryInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  parent_name: string | null;
}

export interface PublicProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_price: number | null;
  description: string | null;
  badge: string | null;
  is_active: boolean;
  created_at: string;
  category_slug: string;
  category_name: string;
  category_id: string;
  sizes?: string[];
  images?: string[];
  sku?: string;
  stock?: number;
  size_stock?: Record<string, number>;
  color?: string;
  sale_active?: boolean;
  discount_percent?: number;
  featured?: boolean;
  popularity_score?: number;
}

export function buildCategoryTree(flatList: any[]): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>();
  
  for (const item of flatList) {
    nodeMap.set(item.id, {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description ?? null,
      image_url: item.image_url ?? null,
      sort_order: item.sort_order ?? 0,
      parent_id: item.parent_id ?? null,
      product_count: item.product_count ?? 0,
      children: []
    });
  }
  
  const rootNodes: CategoryNode[] = [];
  
  for (const item of flatList) {
    const node = nodeMap.get(item.id);
    if (node) {
      if (node.parent_id) {
        const parent = nodeMap.get(node.parent_id);
        if (parent) {
          parent.children.push(node);
        } else {
          rootNodes.push(node);
        }
      } else {
        rootNodes.push(node);
      }
    }
  }
  
  const sortNodeChildren = (node: CategoryNode) => {
    node.children.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    node.children.forEach(sortNodeChildren);
  };
  
  rootNodes.forEach(sortNodeChildren);
  rootNodes.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  
  return rootNodes;
}

export function calculateProductCounts(node: CategoryNode): number {
  let count = node.product_count;
  for (const child of node.children) {
    count += calculateProductCounts(child);
  }
  node.product_count = count;
  return count;
}

export async function getActiveCategories(): Promise<CategoryNode[]> {
  const { data, error } = await supabase.rpc("get_active_categories");
  if (error) throw error;
  
  const tree = buildCategoryTree(data ?? []);
  for (const root of tree) {
    calculateProductCounts(root);
  }
  return tree;
}

export async function getCategoryBySlug(slug: string): Promise<CategoryInfo | null> {
  const { data, error } = await supabase.rpc("get_category_by_slug", { p_slug: slug });
  if (error) throw error;
  return data as CategoryInfo | null;
}



async function fetchAndAttachVariants(products: PublicProduct[]): Promise<PublicProduct[]> {
  if (products.length === 0) return products;
  const productIds = products.map((p) => p.id);
  const { data: variants, error: varError } = await supabase
    .from("product_variants")
    .select("id, product_id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active")
    .in("product_id", productIds)
    .eq("is_active", true);

  if (!varError && variants) {
    for (const p of products) {
      const pVars = variants.filter((v) => v.product_id === p.id);
      if (pVars.length > 0) {
        (p as any).colorVariants = pVars.map((v) => ({
          id: v.id,
          color: v.name,
          color_hex: v.color_hex || undefined,
          images: p.images || [],
          sizes: v.sizes || p.sizes || [],
          sizeStock: v.size_stock || {},
          stock: v.stock || 0,
          sku: v.sku || p.sku || "",
          priceOverride: v.price ? Number(v.price) : undefined,
          comparePriceOverride: v.compare_price ? Number(v.compare_price) : undefined,
        }));
      }
    }
  }
  return products;
}

export async function getProductsByCategorySlug(
  slug: string,
  page = 1,
  pageSize = 50,
): Promise<PublicProduct[]> {
  const { data, error } = await supabase.rpc("get_products_by_category_slug", {
    p_slug: slug,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  return fetchAndAttachVariants((data ?? []) as PublicProduct[]);
}

export async function getProductsByCategoryAndSubcategory(
  categorySlug: string,
  subcategorySlug: string,
  page = 1,
  pageSize = 50,
): Promise<PublicProduct[]> {
  const { data, error } = await supabase.rpc("get_products_by_category_and_subcategory", {
    p_category_slug: categorySlug,
    p_subcategory_slug: subcategorySlug,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw error;
  return fetchAndAttachVariants((data ?? []) as PublicProduct[]);
}

// ─── TanStack Query hooks ──────────────────────────────────────────────

export function useActiveCategories() {
  return useQuery({
    queryKey: ["active-categories"],
    queryFn: getActiveCategories,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
  });
}

export function useCategoryProducts(slug: string) {
  return useQuery({
    queryKey: ["category-products", slug],
    queryFn: () => getProductsByCategorySlug(slug),
    enabled: !!slug,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
  });
}

export function useSubcategoryProducts(categorySlug: string, subcategorySlug: string) {
  return useQuery({
    queryKey: ["subcategory-products", categorySlug, subcategorySlug],
    queryFn: () => getProductsByCategoryAndSubcategory(categorySlug, subcategorySlug),
    enabled: !!categorySlug && !!subcategorySlug,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
    gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
  });
}

export function toProductProps(p: PublicProduct): Product {
  const product: Product = {
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: Number(p.price),
    compare_price: p.compare_price,
    category: p.category_slug as Category,
    subcategory: p.category_name,
    description: p.description ?? "",
    color: p.color ?? "Ivory",
    sizes: p.sizes ?? [],
    sku: p.sku ?? "",
    stock: p.stock ?? 0,
    sizeStock: p.size_stock ?? {},
    images: p.images ?? [],
    badge: p.badge ?? undefined,
    sale_active: p.sale_active,
    discount_percent: p.discount_percent,
    colorVariants: (p as any).colorVariants,
    featured: p.featured,
    popularity_score: p.popularity_score,
    created_at: p.created_at,
    category_slug: p.category_slug,
  };
  registerProduct(product);
  return product;
}
