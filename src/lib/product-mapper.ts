import type { Product, ColorVariant } from "./products";
import type { DbProduct, DbProductImage, DbProductVariant } from "./products-db";

function mapImages(images: DbProductImage[]): string[] {
  return images
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => img.image_url)
    .filter(Boolean);
}

function mapDbVariantsToVariants(dbVariants: DbProductVariant[], parentImages: string[], parentProduct: DbProduct): ColorVariant[] {
  if (!dbVariants || dbVariants.length === 0) {
    if (!parentProduct.colors || parentProduct.colors.length === 0) return [];
    return parentProduct.colors.map((c) => ({
      color: c.name,
      color_hex: c.hex,
      images: parentImages,
      sizes: parentProduct.sizes,
      sizeStock: parentProduct.size_stock ?? {},
      stock: parentProduct.stock,
      sku: parentProduct.sku ?? "",
    }));
  }
  
  return dbVariants.map((v) => ({
    id: v.id,
    color: v.name,
    color_hex: v.color_hex || undefined,
    images: v.images && v.images.length > 0 ? v.images : parentImages,
    sizes: v.sizes,
    sizeStock: v.size_stock ?? {},
    stock: v.stock,
    sku: v.sku ?? "",
    priceOverride: v.price ? Number(v.price) : undefined,
    comparePriceOverride: v.compare_price ? Number(v.compare_price) : undefined,
  }));
}

export function mapDbProductToStatic(
  db: DbProduct,
  dbImages: DbProductImage[],
  parentCategorySlug: string,
  subcategoryName: string,
  dbVariants: DbProductVariant[] = [],
): Product {
  const imageUrls = mapImages(dbImages);
  const variants = mapDbVariantsToVariants(dbVariants, imageUrls, db);

  return {
    id: db.id,
    slug: db.slug,
    name: db.name,
    price: db.price,
    category: parentCategorySlug as "clothing" | "jewellery",
    subcategory: subcategoryName,
    category_id: db.category_id,
    description: db.description ?? "",
    fabric: db.fabric ?? undefined,
    material: db.material ?? undefined,
    color: variants?.[0]?.color ?? db.colors?.[0]?.name ?? "Ivory",
    sizes: db.sizes,
    sku: db.sku ?? "",
    stock: db.stock,
    sizeStock: db.size_stock ?? {},
    images: imageUrls,
    badge: db.is_new ? "New" : db.is_best_seller ? "Best Seller" : undefined,
    colorVariants: variants.length > 0 ? variants : undefined,
    compare_price: db.compare_price,
    sale_active: db.sale_active,
    discount_percent: db.discount_percent,
    metadata: {
      low_stock: db.stock > 0 && db.stock <= db.low_stock_threshold,
    },
    short_description: db.short_description,
  };
}
