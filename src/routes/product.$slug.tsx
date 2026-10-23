import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ChevronDown, Heart, Minus, Plus, Share2, Truck, X } from "lucide-react";
import { getProductPriceInfo } from "@/lib/products";
import { useCart, useWishlist } from "@/lib/store";
import { registerProduct } from "@/lib/customer-services";
import { getProductAvailability, validateStockBeforeCheckout } from "@/lib/inventory";
import { ProductCard } from "@/components/site/ProductCard";
import { ProductPrice } from "@/components/site/ProductPrice";
import { toast } from "sonner";
import type { Product } from "@/lib/products";
import { useProductDetailQuery, useProductsCatalog } from "@/lib/products-query";
import { useActiveCategories } from "@/lib/categories";
import { getProductBySlug } from "@/lib/products-db";
import { mapDbProductToStatic } from "@/lib/product-mapper";
import { SITE_URL } from "@/lib/config";
import { ReviewsSection, useProductReviews } from "@/components/site/ReviewsSection";

interface ProductSearch {
  color?: string;
}

export const Route = createFileRoute("/product/$slug")({
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    return {
      color: typeof search.color === "string" ? search.color : undefined,
    };
  },
  loader: async ({ params }) => {
    try {
      const dbResult = await getProductBySlug(params.slug);
      if (!dbResult || !dbResult.product) return null;
      const parentSlug = dbResult.parent_category?.slug ?? "clothing";
      const subName = dbResult.category?.name ?? "";
      const product = mapDbProductToStatic(
        dbResult.product,
        dbResult.images,
        parentSlug,
        subName,
        dbResult.variants,
      );
      return product;
    } catch {
      return null;
    }
  },
  head: ({ params, loaderData }: { params: { slug: string }; loaderData?: unknown }) => {
    const product = loaderData as Product | null | undefined;
    const title = product
      ? `${product.name} | ANORA New York`
      : "Buy Luxury Women's Fashion Online | ANORA New York";
    const desc = product
      ? product.short_description || product.description || "ANORA atelier piece"
      : "ANORA atelier piece";
    const imageUrl =
      product && product.images && product.images.length > 0
        ? product.images[0]
        : `${SITE_URL}/logo.png`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:url", content: `${SITE_URL}/product/${params.slug}` },
        { property: "og:type", content: "product" },
        { property: "og:image", content: imageUrl },
        { property: "og:site_name", content: "ANORA" },
        { property: "og:locale", content: "en_US" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: imageUrl },
      ],
      links: [{ rel: "canonical", href: `${SITE_URL}/product/${params.slug}` }],
    };
  },
  component: ProductPage,
});

function getActiveState(product: Product, color: string) {
  const availability = getProductAvailability(product, color);
  const variant = availability.selectedVariant;
  if (!variant) {
    return {
      images: product.images,
      sizes: availability.sizes,
      sizeStock: availability.sizeStock,
      stock: availability.stock,
      sku: availability.sku,
      color: availability.color,
      lowStock: availability.lowStock,
      isAvailable: availability.isAvailable,
      id: undefined,
    };
  }
  return {
    images: variant.images,
    sizes: variant.sizes,
    sizeStock: variant.sizeStock,
    stock: variant.stock,
    sku: variant.sku,
    color: variant.color,
    lowStock: variant.lowStock,
    isAvailable: variant.isAvailable,
    id: variant.id,
  };
}

function ProductPage() {
  const { slug } = Route.useParams();
  const searchParams = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const cart = useCart();
  const wish = useWishlist();

  const { data: product, isLoading, error } = useProductDetailQuery(slug);
  const { data: catalog = [] } = useProductsCatalog();
  const { data: allCategories = [] } = useActiveCategories();
  const { data: reviews = [] } = useProductReviews(product?.id || "");

  const [openAccordion, setOpenAccordion] = useState<string | null>("details");

  const categoryPathSlugs = useMemo(() => {
    if (!product || !product.category_id || allCategories.length === 0) return null;

    function getPath(
      nodes: any[],
      targetId: string,
      current: { name: string; slug: string }[] = [],
    ): { name: string; slug: string }[] | null {
      for (const node of nodes) {
        const item = { name: node.name, slug: node.slug };
        if (node.id === targetId) {
          return [...current, item];
        }
        if (node.children && node.children.length > 0) {
          const path = getPath(node.children, targetId, [...current, item]);
          if (path) return path;
        }
      }
      return null;
    }

    return getPath(allCategories, product.category_id);
  }, [allCategories, product]);

  const related = useMemo(() => {
    if (!product) return [];
    return catalog
      .filter((p) => p.id !== product.id && p.category === product.category)
      .slice(0, 4);
  }, [catalog, product]);

  // Update page title dynamically once details load
  useEffect(() => {
    if (product) {
      document.title = `Buy ${product.name} Online | ANORA New York`;
    }
  }, [product]);

  // Safe intermediate state variables for loading state
  const defaultColor = product ? (product.colorVariants?.[0]?.color ?? product.color) : "";
  const activeColor = searchParams.color || defaultColor;
  const active = product ? getActiveState(product, activeColor) : null;
  const priceInfo = product ? getProductPriceInfo(product, activeColor) : null;

  // Hooks moved above early returns
  const [size, setSize] = useState(active?.sizes?.[0] ?? "");

  useEffect(() => {
    if (!active) return;
    // Find the first size that is in stock for the current variant
    const inStockSize = active.sizes.find((s) => (active.sizeStock?.[s] ?? 0) > 0);
    // If current selected size is out of stock or not in variant's sizes, update it
    if (active.sizes.length > 0) {
      if (!active.sizes.includes(size) || (active.sizeStock && active.sizeStock[size] === 0)) {
        const targetSize = inStockSize || active.sizes[0];
        if (size !== targetSize) {
          setSize(targetSize);
        }
      }
    }
  }, [activeColor, active, size]);

  useEffect(() => {
    if (!product) return;
    setImgIdx((prev) => (prev !== 0 ? 0 : prev));
    setGuideOpen(false);
  }, [activeColor, product]);

  const [qty, setQty] = useState(1);
  const [imgIdx, setImgIdx] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // ─── Color switch ───
  const switchColor = useCallback(
    (c: string) => {
      if (!product) return;
      void navigate({ search: (old) => ({ ...old, color: c }) });
      const next = getActiveState(product, c);
      const targetSize = next.sizes[0];
      setSize((prev) => (prev !== targetSize ? targetSize : prev));
      setImgIdx((prev) => (prev !== 0 ? 0 : prev));
    },
    [product, navigate],
  );

  // ─── Image zoom ───
  const imgRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = imgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setOrigin({ x, y });
  }, []);

  // ─── Mobile swipe ───
  const touchStart = useRef<number>(0);

  const jsonLdData = useMemo(() => {
    if (!product) return null;
    const finalPrice = priceInfo
      ? priceInfo.isOnSale
        ? priceInfo.salePrice
        : priceInfo.originalPrice
      : product.price;
    const isAvailable = ((active?.stock ?? product.stock) || 0) > 0;

    const productSchema: any = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      image: (active?.images && active.images.length > 0)
        ? active.images.map((img) => (img.startsWith("http") ? img : `${SITE_URL}${img}`))
        : (product.images && product.images.length > 0)
          ? product.images.map((img) => (img.startsWith("http") ? img : `${SITE_URL}${img}`))
          : [`${SITE_URL}/logo.png`],
      description: product.description || undefined,
      sku: active?.sku || product.sku || undefined,
      brand: {
        "@type": "Brand",
        name: "ANORA",
      },
      offers: {
        "@type": "Offer",
        url: `${SITE_URL}/product/${product.slug}`,
        priceCurrency: "USD",
        price: String(finalPrice),
        availability: isAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    };

    const totalReviews = reviews.length;
    const avgRating = totalReviews > 0
      ? Number((reviews.reduce((acc, curr) => acc + curr.rating, 0) / totalReviews).toFixed(1))
      : 0;

    if (totalReviews > 0) {
      productSchema.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: String(avgRating),
        reviewCount: String(totalReviews),
        bestRating: "5",
        worstRating: "1",
      };
      productSchema.review = reviews.slice(0, 5).map((r) => ({
        "@type": "Review",
        author: {
          "@type": "Person",
          name: r.reviewer_name,
        },
        datePublished: r.created_at.split("T")[0],
        reviewBody: r.review_text,
        name: r.title || undefined,
        reviewRating: {
          "@type": "Rating",
          ratingValue: String(r.rating),
          bestRating: "5",
          worstRating: "1",
        },
      }));
    }

    const breadcrumbs: { "@type": string; position: number; name: string; item: string }[] = [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: `${SITE_URL}/shop`,
      },
    ];

    if (categoryPathSlugs && categoryPathSlugs.length > 0) {
      categoryPathSlugs.forEach((item) => {
        breadcrumbs.push({
          "@type": "ListItem",
          position: breadcrumbs.length + 1,
          name: item.name,
          item: `${SITE_URL}/shop/${item.slug}`,
        });
      });
    } else if (product.category) {
      breadcrumbs.push({
        "@type": "ListItem",
        position: 3,
        name: product.category.charAt(0).toUpperCase() + product.category.slice(1),
        item: `${SITE_URL}/shop/${product.category.toLowerCase()}`,
      });
    }

    breadcrumbs.push({
      "@type": "ListItem",
      position: breadcrumbs.length + 1,
      name: product.name,
      item: `${SITE_URL}/product/${product.slug}`,
    });

    const breadcrumbSchema = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumbs,
    };

    return { productSchema, breadcrumbSchema };
  }, [product, priceInfo, active, categoryPathSlugs, reviews]);

  // Conditional early returns
  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (error || !product || !active || !priceInfo) {
    return (
      <div className="py-32 text-center">
        <h1 className="font-serif text-4xl">Piece not found</h1>
        <Link
          to="/shop"
          className="inline-block mt-6 text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          Return to shop
        </Link>
      </div>
    );
  }

  // Once product and active are guaranteed, register product and compute layout variables
  registerProduct(product);

  const colors = product.colorVariants?.map((v) => ({
    name: v.color,
    hex:
      v.color_hex || (v.color === "Ivory" ? "#f5f0e8" : v.color === "Blush" ? "#f5d6d6" : "#ccc"),
    stock: v.stock,
  })) ?? [
    {
      name: product.color,
      hex: "#f5f0e8",
      stock: product.stock,
    },
  ];

  const hasColors = !!(product.colorVariants && product.colorVariants.length > 0);

  const activeSizes = active.sizes;
  const activeSizeStock = active.sizeStock;
  const activeStock = active.stock;
  const activeIsAvailable = active.isAvailable;
  const activeImages = active.images;
  const activeSku = active.sku;
  const activeColorValue = active.color;
  const activeId = active.id;

  const productTotalStock =
    product.colorVariants && product.colorVariants.length > 0
      ? product.colorVariants.reduce((sum, v) => sum + (v.stock ?? 0), 0)
      : product.stock;
  const productTotalOOS = productTotalStock === 0;

  const hasSizeStock = activeSizeStock && Object.keys(activeSizeStock).length > 0;
  const allOOS = hasSizeStock && activeSizes.every((s) => (activeSizeStock[s] ?? 0) === 0);
  const selectedSizeStock = activeSizeStock?.[size] ?? 0;
  const isSizeOOS = hasSizeStock && selectedSizeStock === 0;
  const isOOS = productTotalOOS || !activeIsAvailable || activeStock === 0 || allOOS || isSizeOOS;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!activeImages) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) setImgIdx((i) => Math.min(activeImages.length - 1, i + 1));
      else setImgIdx((i) => Math.max(0, i - 1));
    }
  };

  return (
    <div className="pt-8 lg:pt-12 pb-24 font-sans bg-background">
      {jsonLdData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([jsonLdData.productSchema, jsonLdData.breadcrumbSchema]),
          }}
        />
      )}
      {/* ─── 1. Premium Breadcrumbs ─── */}
      <div className="px-5 lg:px-10 mb-6 text-[12px] font-normal tracking-normal uppercase text-muted-foreground/50 max-w-7xl mx-auto flex items-center gap-y-1.5 whitespace-nowrap overflow-x-auto scrollbar-none justify-start">
        <Link
          to="/"
          className="hover:text-foreground hover:underline transition-colors duration-300"
        >
          Home
        </Link>
        {categoryPathSlugs ? (
          categoryPathSlugs.map((item, index) => {
            const pathSlugs = categoryPathSlugs.slice(0, index + 1).map((c) => c.slug);
            const href = `/shop/${pathSlugs.join("/")}`;
            return (
              <span key={item.slug} className="flex items-center">
                <span className="mx-2 text-[10px] text-muted-foreground/30 font-sans select-none">
                  &gt;
                </span>
                <Link
                  to={href as "/shop"}
                  className="hover:text-foreground hover:underline transition-colors duration-300"
                >
                  {item.name}
                </Link>
              </span>
            );
          })
        ) : (
          <>
            <span className="mx-2 text-[10px] text-muted-foreground/30 font-sans select-none">
              &gt;
            </span>
            <Link
              to={
                `/shop/${(product as unknown as Record<string, unknown>).category_slug || (product.category as string).toLowerCase()}` as "/shop"
              }
              className="hover:text-foreground hover:underline transition-colors duration-300"
            >
              {product.category}
            </Link>
            {product.subcategory && (
              <span className="flex items-center">
                <span className="mx-2 text-[10px] text-muted-foreground/30 font-sans select-none">
                  &gt;
                </span>
                <span className="text-muted-foreground/55">{product.subcategory}</span>
              </span>
            )}
          </>
        )}
        <span className="mx-2 text-[10px] text-muted-foreground/30 font-sans select-none">
          &gt;
        </span>
        <span className="text-foreground/90 font-semibold">{product.name}</span>
      </div>

      <div className="px-5 lg:px-10 grid lg:grid-cols-[706px_1fr] gap-12 lg:gap-16 max-w-7xl mx-auto items-stretch">
        {/* ─── 2. Image Gallery ─── */}
        <div className="grid grid-cols-1 md:grid-cols-[90px_1fr] gap-6 md:gap-8 h-fit lg:sticky lg:top-28">
          {/* Thumbnails (Desktop) */}
          <div className="hidden md:flex flex-col gap-3">
            {activeImages.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setImgIdx(i)}
                className={`overflow-hidden aspect-[3/4] rounded-md border transition-all duration-300 focus:outline-none ${
                  i === imgIdx
                    ? "border-foreground scale-[1.03] shadow-sm ring-1 ring-foreground/10"
                    : "border-border/60 opacity-60 hover:opacity-100 hover:border-foreground/45"
                }`}
                aria-label={`View image ${i + 1}`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {/* Main image */}
          <div
            ref={imgRef}
            onMouseEnter={() => setZoom(true)}
            onMouseLeave={() => setZoom(false)}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onClick={() => setLightboxOpen(true)}
            className="md:col-start-2 overflow-hidden aspect-[3/4] lg:aspect-auto w-full lg:w-[584px] lg:h-[876px] rounded-lg bg-neutral/40 cursor-crosshair relative shadow-inner border border-border/15"
          >
            <img
              src={activeImages[imgIdx]}
              alt={product.name}
              className={`h-full w-full object-cover transition-opacity duration-500 ${
                zoom ? "opacity-0" : "opacity-100"
              }`}
            />
            {!isOOS && priceInfo.isOnSale && priceInfo.discountPercent > 0 && (
              <span className="absolute top-4 left-4 inline-flex items-center justify-center text-[10px] font-extrabold tracking-[0.2em] uppercase border border-gold/30 text-gold bg-background/95 px-3 py-1.5 backdrop-blur rounded-full shadow-sm leading-none z-10 antialiased">
                {priceInfo.badgeText}
              </span>
            )}
            {zoom && (
              <img
                src={activeImages[imgIdx]}
                alt=""
                className="absolute inset-0 h-[200%] w-[200%] max-w-none pointer-events-none"
                style={{
                  transformOrigin: `${origin.x}% ${origin.y}%`,
                  transform: `translate(-${origin.x / 2}%, -${origin.y / 2}%)`,
                }}
              />
            )}

            {/* Touch arrows (Mobile) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImgIdx((i) => Math.max(0, i - 1));
              }}
              className="md:hidden absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-background/90 rounded-full shadow-sm grid place-items-center hover:text-gold transition-colors duration-300 focus:outline-none"
              aria-label="Previous image"
            >
              <span className="text-lg leading-none font-serif">‹</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setImgIdx((i) => Math.min(activeImages.length - 1, i + 1));
              }}
              className="md:hidden absolute right-3 top-1/2 -translate-y-1/2 h-9 w-9 bg-background/90 rounded-full shadow-sm grid place-items-center hover:text-gold transition-colors duration-300 focus:outline-none"
              aria-label="Next image"
            >
              <span className="text-lg leading-none font-serif">›</span>
            </button>
          </div>

          {/* Mobile thumbnails with swipe container */}
          <div className="md:hidden flex gap-3 overflow-x-auto col-span-2 scrollbar-none pb-1">
            {activeImages.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setImgIdx(i)}
                className={`w-16 aspect-[3/4] flex-none border transition-all duration-300 focus:outline-none ${
                  i === imgIdx ? "border-foreground scale-105" : "border-transparent opacity-50"
                }`}
                aria-label={`View image ${i + 1}`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* ─── 3. Product Information Section ─── */}
        <div className="lg:sticky lg:top-24 lg:self-start space-y-8">
          {/* 1. Product Brand & Title & Price & SKU & Short Description */}
          <div className="space-y-6">
            {/* Product Brand */}
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/80 font-bold">
              ANORA NEW YORK
            </div>

            {/* Product Title */}
            <div>
              {priceInfo?.isOnSale && (
                <span className="inline-flex items-center justify-center text-[10px] font-extrabold tracking-[0.25em] uppercase text-background bg-foreground px-3 py-1 mb-3 leading-none antialiased mr-2 font-sans">
                  Sale
                </span>
              )}
              {product.badge && (
                <span className="inline-flex items-center justify-center text-[10px] font-extrabold tracking-[0.25em] uppercase text-gold bg-gold/5 border border-gold/15 px-3 py-1 rounded-full mb-3 leading-none antialiased">
                  {product.badge}
                </span>
              )}
              <h1 className="font-serif text-[24px] tracking-wide text-foreground leading-tight font-semibold">
                {product.name}
              </h1>
            </div>

            {/* Price Section */}
            <div className="flex items-baseline gap-3 flex-wrap">
              {priceInfo.isOnSale ? (
                <>
                  <span className="font-sans text-2xl font-bold text-[#000000] tracking-wide leading-none">
                    ${priceInfo.salePrice.toLocaleString()}
                  </span>
                  <span className="font-sans text-sm font-normal text-[#81807f] line-through decoration-[#81807f]/30 decoration-[0.5px] leading-none">
                    ${priceInfo.originalPrice.toLocaleString()}
                  </span>
                  {priceInfo.discountPercent > 0 && (
                    <span className="ml-2 text-[9px] tracking-widest uppercase border border-gold/20 text-gold bg-gold/5 px-2 py-0.5 rounded-full font-bold leading-none align-middle">
                      {priceInfo.discountPercent}% OFF
                    </span>
                  )}
                </>
              ) : (
                <span className="font-sans text-2xl font-bold text-[#000000] tracking-wide leading-none">
                  ${priceInfo.salePrice.toLocaleString()}
                </span>
              )}
            </div>

            {/* SKU & Stock */}
            <div className="flex items-center gap-3.5 text-xs text-muted-foreground/70">
              <span className={isOOS ? "text-red font-semibold" : "text-emerald-700 font-semibold"}>
                {isOOS ? "Out of Stock" : "In Stock"}
              </span>
              <span className="opacity-30">|</span>
              <span className="tracking-[0.2em] uppercase text-[10px] font-medium">
                SKU: {activeSku}
              </span>
            </div>

            {/* Short Description */}
            <p className="text-sm text-muted-foreground/80 leading-relaxed font-sans max-w-xl">
              {product.description
                ? product.description.split("\n")[0]
                : "A classic, elegant piece designed with premium craftsmanship for a lifetime of luxury styling."}
            </p>
          </div>

          <div className="h-px w-full bg-border/20" />

          {/* Color Selection */}
          {hasColors && colors.length > 1 && (
            <div className="space-y-3">
              <span className="text-[10px] tracking-[0.24em] uppercase text-muted-foreground font-semibold block">
                Color: <span className="text-foreground font-bold ml-1">{activeColor}</span>
              </span>
              <div className="flex flex-wrap gap-3.5">
                {colors.map((color) => {
                  const isSelected = activeColor.toLowerCase() === color.name.toLowerCase();
                  const isColorOOS = productTotalOOS || color.stock === 0;
                  const isTexture = color.hex.startsWith("http") || color.hex.startsWith("/");

                  return (
                    <button
                      key={color.name}
                      disabled={isColorOOS}
                      onClick={() => switchColor(color.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          switchColor(color.name);
                        }
                      }}
                      className={`relative h-10 w-10 rounded-full border transition-all duration-300 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
                        isSelected
                          ? "border-gold scale-110 shadow-md ring-1 ring-gold/40"
                          : isColorOOS
                            ? "border-border/20 opacity-30 cursor-not-allowed"
                            : "border-border hover:border-foreground hover:scale-105"
                      }`}
                      title={isColorOOS ? `${color.name} (Out of Stock)` : color.name}
                      aria-label={`Select color ${color.name}${isColorOOS ? " (Out of Stock)" : ""}`}
                      aria-current={isSelected ? "true" : "false"}
                    >
                      <span
                        className="absolute inset-1 rounded-full overflow-hidden transition-transform duration-300 shadow-inner"
                        style={
                          isTexture
                            ? {
                                backgroundImage: `url(${color.hex})`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }
                            : { backgroundColor: color.hex }
                        }
                      >
                        {isColorOOS && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-background/20 backdrop-blur-[0.5px]">
                            <div className="w-[140%] h-[1.5px] bg-foreground/50 rotate-45" />
                          </div>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasColors && colors.length <= 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
              <span className="text-[10px] tracking-[0.24em] uppercase text-foreground/75 font-semibold">
                Color:
              </span>
              <span className="font-medium text-foreground">{activeColor}</span>
            </div>
          )}

          {/* Size Selector */}
          {activeSizes.length > 0 && !(activeSizes.length === 1 && activeSizes[0] === "OS") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.24em] uppercase text-muted-foreground font-semibold">
                  Size
                </span>
                {product.subcategory?.trim().toLowerCase() !== "unstitched" && (
                  <button
                    type="button"
                    onClick={() => setGuideOpen(true)}
                    className="text-[10px] tracking-[0.24em] uppercase text-muted-foreground/75 hover:text-foreground transition-colors duration-300 focus:outline-none hover-underline"
                  >
                    Size Guide
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeSizes.map((s) => {
                  const qty = activeSizeStock?.[s];
                  const disabled =
                    productTotalOOS ||
                    activeStock === 0 ||
                    (hasSizeStock && qty !== undefined && qty === 0);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (!disabled) setSize(s);
                      }}
                      className={`w-10 h-10 flex items-center justify-center text-xs tracking-wider border rounded-md transition-all duration-200 focus:outline-none ${
                        size === s && !disabled
                          ? "border-foreground bg-foreground text-background font-semibold shadow-sm"
                          : disabled
                            ? "border-border/20 text-border/40 line-through cursor-not-allowed opacity-55"
                            : "border-border hover:border-foreground hover:bg-foreground/5 hover:scale-[1.02]"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="h-px w-full bg-border/10" />

          {/* Quantity Selector */}
          <div className="space-y-3">
            <span className="text-[10px] tracking-[0.24em] uppercase text-muted-foreground font-semibold block">
              Quantity
            </span>
            <div className="flex items-center border border-border h-10 w-28 rounded-md overflow-hidden bg-background">
              <button
                type="button"
                aria-label="decrease"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-full w-9 flex items-center justify-center hover:bg-neutral/45 transition-colors focus:outline-none text-muted-foreground hover:text-foreground"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="flex-1 text-center text-xs font-semibold text-foreground select-none">
                {qty}
              </span>
              <button
                type="button"
                aria-label="increase"
                onClick={() => setQty((q) => q + 1)}
                className="h-full w-9 flex items-center justify-center hover:bg-neutral/45 transition-colors focus:outline-none text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Add To Bag & Buy Now Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (isOOS) return;
                const validation = validateStockBeforeCheckout(product, {
                  productId: product.id,
                  variantId: activeId,
                  size,
                  quantity: qty,
                  color: activeColor,
                });
                if (!validation.ok) {
                  toast.error(validation.reason ?? "Selected option is unavailable");
                  return;
                }
                cart.add(product.id, size, qty, activeId);
                toast.success("Added to bag", {
                  description: `${product.name} · ${size} · Qty ${qty}`,
                });
              }}
              disabled={isOOS}
              className={`h-12 w-full flex items-center justify-center text-xs tracking-[0.25em] uppercase transition-all duration-300 font-semibold rounded-md focus:outline-none ${
                isOOS
                  ? "bg-neutral text-muted-foreground/60 border border-border cursor-not-allowed"
                  : "bg-foreground text-background border border-foreground hover:bg-gold hover:border-gold hover:text-ink hover:scale-[1.01]"
              }`}
            >
              {isOOS ? "Out of Stock" : "Add to Bag"}
            </button>
            {!isOOS && (
              <Link
                to="/checkout"
                onClick={() => cart.add(product.id, size, qty, activeId)}
                className="flex items-center justify-center text-center border border-foreground h-12 text-xs tracking-[0.25em] uppercase hover:bg-foreground hover:text-background transition-all duration-300 font-semibold rounded-md hover:scale-[1.01]"
              >
                Buy Now
              </Link>
            )}
          </div>

          {/* Wishlist & Share Secondary Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                const wasWishlisted = wish.has(product.id, activeId);
                wish.toggle(product.id, activeId);
                toast(wasWishlisted ? "Removed from Wishlist" : "Added to Wishlist");
              }}
              className="flex-1 h-11 flex items-center justify-center gap-2 border border-border rounded-md hover:border-foreground hover:bg-foreground/5 transition-all duration-300 focus:outline-none text-xs tracking-wider uppercase font-medium text-muted-foreground hover:text-foreground"
            >
              <Heart
                className={`h-4 w-4 ${wish.has(product.id, activeId) ? "fill-gold text-gold" : ""}`}
              />
              {wish.has(product.id, activeId) ? "Wishlisted" : "Add to Wishlist"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator
                    .share({ title: product.name, url: window.location.href })
                    .catch(() => {});
                } else {
                  navigator.clipboard.writeText(window.location.href);
                  toast("Link copied to clipboard");
                }
              }}
              className="h-11 w-11 flex items-center justify-center border border-border rounded-md hover:border-foreground hover:bg-foreground/5 transition-all duration-300 focus:outline-none text-muted-foreground hover:text-foreground"
              aria-label="Share product"
              title="Share"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>

          {/* ─── 4. Premium Accordions ─── */}
          <div className="border-t border-border/40 divide-y divide-border/40 pt-2">
            <AccordionItem
              title="Details"
              isOpen={openAccordion === "details"}
              onToggle={() => setOpenAccordion(openAccordion === "details" ? null : "details")}
            >
              <p className="whitespace-pre-line leading-relaxed">{product.description}</p>
              {(product.fabric || product.material) && (
                <p className="mt-3">
                  <span className="font-semibold text-foreground">Composition:</span>{" "}
                  {product.fabric ?? product.material}
                </p>
              )}
              <p className="mt-1">
                <span className="font-semibold text-foreground">Colour:</span> {activeColorValue}
              </p>
            </AccordionItem>

            <AccordionItem
              title="Care Instructions"
              isOpen={openAccordion === "care"}
              onToggle={() => setOpenAccordion(openAccordion === "care" ? null : "care")}
            >
              <p>
                Store in the protective pouch provided. Avoid direct contact with perfume,
                hairspray, makeup, and water. Polish regularly with a soft lint-free cloth to
                maintain its original luster.
              </p>
            </AccordionItem>

            <AccordionItem
              title="Product Tags"
              isOpen={openAccordion === "tags"}
              onToggle={() => setOpenAccordion(openAccordion === "tags" ? null : "tags")}
            >
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-2.5 py-1 text-[9px] tracking-wider uppercase border border-border bg-stone-50/50 text-muted-foreground/90 font-medium">
                  {product.category}
                </span>
                {product.subcategory && (
                  <span className="px-2.5 py-1 text-[9px] tracking-wider uppercase border border-border bg-stone-50/50 text-muted-foreground/90 font-medium">
                    {product.subcategory}
                  </span>
                )}
                <span className="px-2.5 py-1 text-[9px] tracking-wider uppercase border border-border bg-stone-50/50 text-muted-foreground/90 font-medium">
                  {activeColorValue}
                </span>
              </div>
            </AccordionItem>

            <AccordionItem
              title="Shipping & Delivery"
              isOpen={openAccordion === "shipping"}
              onToggle={() => setOpenAccordion(openAccordion === "shipping" ? null : "shipping")}
            >
              <p>
                ANORA offers complimentary express courier delivery worldwide. Orders are processed
                within 24 hours of placement and arrive at your doorstep in 3 to 5 business days.
                Real-time tracking is provided with every shipment.
              </p>
            </AccordionItem>

            <AccordionItem
              title="Returns & Exchange"
              isOpen={openAccordion === "returns"}
              onToggle={() => setOpenAccordion(openAccordion === "returns" ? null : "returns")}
            >
              <p>
                We accept returns and exchanges on all unworn items within 14 days of receipt. Items
                must be in original condition with all tags and protective packing intact. Easy
                return pick-ups can be arranged through your account dashboard.
              </p>
            </AccordionItem>
          </div>
        </div>
      </div>

      {/* ─── 6 & 7. Related Products ("YOU MAY ALSO LIKE") Carousel ─── */}
      {related.length > 0 && (
        <section className="mt-10 md:mt-14 lg:mt-20">
          <div className="max-w-7xl mx-auto text-center mb-12">
            <h2 className="font-serif text-base md:text-lg lg:text-[22px] tracking-[0.25em] uppercase text-foreground leading-none">
              You May Also Like
            </h2>
            <p className="text-[10px] md:text-[11px] lg:text-[12px] tracking-[0.2em] text-gold uppercase mt-3 font-semibold">
              Curated for your style
            </p>
          </div>
          <RelatedCarousel products={related} />
        </section>
      )}

      {/* ─── 5. Premium Divider ─── */}
      <div className="my-20 h-px w-full bg-border/20 max-w-7xl mx-auto" />

      {/* ─── Reviews Section ─── */}
      <ReviewsSection productId={product.id} />

      {/* ─── Lightbox ─── */}
      {lightboxOpen && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-[80] bg-ink/80 backdrop-blur-sm animate-fade flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-6 right-6 text-background hover:text-gold transition-colors focus:outline-none"
            aria-label="Close image lightbox"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="max-w-2xl max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={activeImages[imgIdx]}
              alt={product.name}
              className="w-full h-full object-contain max-h-[85vh]"
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((i) => Math.max(0, i - 1));
            }}
            className="absolute left-6 top-1/2 -translate-y-1/2 text-background/70 hover:text-gold text-3xl transition-colors focus:outline-none"
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setImgIdx((i) => Math.min(activeImages.length - 1, i + 1));
            }}
            className="absolute right-6 top-1/2 -translate-y-1/2 text-background/70 hover:text-gold text-3xl transition-colors focus:outline-none"
            aria-label="Next image"
          >
            ›
          </button>
        </div>
      )}

      {/* ─── Size Guide ─── */}
      {guideOpen && product.subcategory?.trim().toLowerCase() !== "unstitched" && (
        <div
          onClick={() => setGuideOpen(false)}
          className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-sm animate-fade flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-background w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-luxe animate-fade-up p-10"
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="font-serif text-2xl">Size Guide</h2>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="hover:text-gold transition-colors focus:outline-none"
                aria-label="Close size guide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="py-2 text-left font-medium">Size</th>
                  <th className="py-2 text-left font-medium">Bust (in)</th>
                  <th className="py-2 text-left font-medium">Waist (in)</th>
                  <th className="py-2 text-left font-medium">Hip (in)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {["XS", "S", "M", "L", "XL", "XXL"].map((s) => (
                  <tr key={s}>
                    <td className="py-2.5 font-medium">{s}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {32 + ["XS", "S", "M", "L", "XL"].indexOf(s) * 2}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {24 + ["XS", "S", "M", "L", "XL"].indexOf(s) * 2}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {34 + ["XS", "S", "M", "L", "XL"].indexOf(s) * 2}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-6 font-sans">
              Measurements are body measurements. For the best fit, we recommend comparing with a
              piece you already own.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function AccordionItem({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/50">
      <button
        onClick={onToggle}
        type="button"
        className="w-full flex items-center justify-between py-4.5 text-left focus:outline-none group"
      >
        <span className="text-[11px] tracking-[0.24em] uppercase font-semibold text-foreground hover:text-gold transition-colors duration-300">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-350 ${
            isOpen ? "rotate-180 text-foreground" : ""
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)] ${
          isOpen ? "max-h-[500px] opacity-100 pb-6" : "max-h-0 opacity-0"
        }`}
      >
        <div className="text-[13px] text-muted-foreground/90 leading-relaxed font-sans space-y-3 pr-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function RelatedCarousel({ products }: { products: Product[] }) {
  const N = products.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [visibleCards, setVisibleCards] = useState(4);
  const [containerWidth, setContainerWidth] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const startXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef(0);

  // Determine visible cards based on screen sizes
  const getVisibleCards = () => {
    if (typeof window === "undefined") return 4;
    if (window.innerWidth < 640) return 2;
    if (window.innerWidth < 1024) return 3;
    return 4;
  };

  useEffect(() => {
    if (N <= getVisibleCards()) {
      return;
    }

    const handleResize = () => {
      const k = getVisibleCards();
      setVisibleCards(k);
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const k = getVisibleCards();
    setCurrentIndex(k);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
    };
  }, [N]);

  const shouldSlider = N > visibleCards;

  const clonedItems = useMemo(() => {
    if (!shouldSlider) return products;
    const K = visibleCards;
    return [...products.slice(-K), ...products, ...products.slice(0, K)];
  }, [products, visibleCards, shouldSlider]);

  const slideNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev + 1);
  };

  const slidePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => prev - 1);
  };

  const handleTransitionEnd = () => {
    setIsTransitioning(false);
    if (currentIndex >= N + visibleCards) {
      setCurrentIndex(currentIndex - N);
    } else if (currentIndex < visibleCards) {
      setCurrentIndex(currentIndex + N);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!shouldSlider || isTransitioning) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    isDraggingRef.current = true;
    dragOffsetRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    const touch = e.touches[0];
    const diff = touch.clientX - startXRef.current;
    dragOffsetRef.current = diff;
    setDragOffset(diff);
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const threshold = containerWidth / 5;
    const offset = dragOffsetRef.current;
    setDragOffset(0);
    dragOffsetRef.current = 0;

    if (offset < -threshold) {
      slideNext();
    } else if (offset > threshold) {
      slidePrev();
    } else {
      setIsTransitioning(true);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!shouldSlider || isTransitioning) return;
    startXRef.current = e.clientX;
    isDraggingRef.current = true;
    dragOffsetRef.current = 0;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const diff = ev.clientX - startXRef.current;
      dragOffsetRef.current = diff;
      setDragOffset(diff);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      const threshold = containerWidth / 5;
      const offset = dragOffsetRef.current;
      setDragOffset(0);
      dragOffsetRef.current = 0;

      if (offset < -threshold) {
        slideNext();
      } else if (offset > threshold) {
        slidePrev();
      } else {
        setIsTransitioning(true);
      }
    };

    document.addEventListener("mousemove", handleMouseMove, { passive: true });
    document.addEventListener("mouseup", handleMouseUp, { passive: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!shouldSlider) return;
    if (e.key === "ArrowLeft") {
      slidePrev();
    } else if (e.key === "ArrowRight") {
      slideNext();
    }
  };

  const baseTranslation = -currentIndex * (100 / clonedItems.length);
  const dragTranslation = containerWidth > 0 ? (dragOffset / containerWidth) * 100 : 0;
  const scaleFactor = clonedItems.length / visibleCards;
  const translateX = baseTranslation + dragTranslation / scaleFactor;

  if (!shouldSlider) {
    return (
      <div className="max-w-7xl mx-auto px-5 lg:px-10">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative group max-w-7xl mx-auto px-5 lg:px-10 overflow-hidden select-none outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        onClick={slidePrev}
        className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full border border-border bg-background/90 flex items-center justify-center hover:bg-foreground hover:text-background hover:scale-105 transition-all duration-300 shadow-luxe focus:outline-none"
        aria-label="Previous products"
      >
        <span className="text-xl">‹</span>
      </button>
      <button
        onClick={slideNext}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full border border-border bg-background/90 flex items-center justify-center hover:bg-foreground hover:text-background hover:scale-105 transition-all duration-300 shadow-luxe focus:outline-none"
        aria-label="Next products"
      >
        <span className="text-xl">›</span>
      </button>

      <div
        ref={trackRef}
        className="flex will-change-transform"
        onTransitionEnd={handleTransitionEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translate3d(${translateX}%, 0, 0)`,
          transition: isTransitioning
            ? "transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
            : "none",
          width: `${scaleFactor * 100}%`,
        }}
      >
        {clonedItems.map((p, idx) => (
          <div
            key={`${p.id}-clone-${idx}`}
            style={{ width: `${100 / clonedItems.length}%` }}
            className="px-2 sm:px-3 flex-shrink-0"
          >
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </div>
  );
}
