import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { getProductPriceInfo, type Product } from "./products";
import { getProductBySlug } from "./products-db";
import { mapDbProductToStatic } from "./product-mapper";
import { BlogService } from "@/modules/blog";

// Maps database row to UI Product format
export function mapDbProduct(row: any): Product & { featured: boolean; is_new: boolean; is_best_seller: boolean; popularity_score: number; created_at: string } {
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
    compare_price: row.compare_price ? Number(row.compare_price) : null,
    category: "clothing" as const,
    subcategory: "",
    category_id: row.category_id,
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
    featured: row.featured || false,
    is_new: row.is_new || false,
    is_best_seller: row.is_best_seller || false,
    popularity_score: Number(row.popularity_score || 0),
    created_at: row.created_at,
    colorVariants: activeVariants.length > 0 ? activeVariants : undefined,
  };
}

export function useProductsCatalog() {
  return useQuery({
    queryKey: ["products", "catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name, price, compare_price, stock, size_stock, sizes, sku, colors, fabric, material, is_new, is_best_seller, featured, status, is_active, sale_active, discount_percent, description, category_id, popularity_score, created_at,
          product_images (image_url, sort_order, variant_id),
          product_variants (id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active)
        `)
        .eq("is_active", true)
        .eq("status", "active");

      if (error) throw error;
      return (data || []).map(mapDbProduct);
    },
    staleTime: 0, // Bypass cache to ensure fresh stock levels
    gcTime: 1000 * 60 * 30, // 30 minutes garbage collection
  });
}

export function useSaleProductsCatalog() {
  return useQuery({
    queryKey: ["products", "sale-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, slug, name, price, compare_price, stock, size_stock, sizes, sku, colors, fabric, material, is_new, is_best_seller, featured, status, is_active, sale_active, discount_percent, description, category_id, popularity_score, created_at,
          product_images (image_url, sort_order, variant_id),
          product_variants (id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active)
        `)
        .eq("is_active", true)
        .eq("status", "active")
        .or("sale_active.eq.true,compare_price.not.is.null");

      if (error) throw error;
      return (data || [])
        .map(mapDbProduct)
        .filter((p) => getProductPriceInfo(p).isOnSale);
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
  });
}

export function useParentCategories() {
  return useQuery({
    queryKey: ["categories", "parent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, image_url")
        .is("parent_id", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data || []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description || "",
        image_url: cat.image_url || "",
      }));
    },
    staleTime: 1000 * 60 * 10, // 10 minutes cache
    gcTime: 1000 * 60 * 30,
  });
}

export function useProductDetailQuery(slug: string) {
  return useQuery({
    queryKey: ["product-detail", slug],
    queryFn: async () => {
      const dbResult = await getProductBySlug(slug);
      if (!dbResult || !dbResult.product) throw new Error("Product not found");
      const parentSlug = dbResult.parent_category?.slug ?? "clothing";
      const subName = dbResult.category?.name ?? "";
      const product = mapDbProductToStatic(
        dbResult.product,
        dbResult.images,
        parentSlug,
        subName,
        dbResult.variants
      );
      return product;
    },
    staleTime: 0, // Bypass cache to ensure fresh stock levels
    gcTime: 1000 * 60 * 30,
  });
}

export function useBlogPostQuery(slug: string) {
  return useQuery({
    queryKey: ["blog-detail", slug],
    queryFn: async () => {
      const service = new BlogService(supabase);
      const post = await service.getPostBySlug(slug);
      if (!post) throw new Error("Blog post not found");
      return post;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes cache
    gcTime: 1000 * 60 * 30,
  });
}
