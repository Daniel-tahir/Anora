import { Link } from "@tanstack/react-router";
import { Heart, Eye, X, Minus, Plus } from "lucide-react";
import { useState, useMemo } from "react";
import { getProductPriceInfo, type Product } from "@/lib/products";
import { ProductPrice } from "./ProductPrice";
import { useCart, useWishlist } from "@/lib/store";
import { getProductAvailability, validateStockBeforeCheckout } from "@/lib/inventory";
import { toast } from "sonner";

export function ProductCard({ product }: { product: Product }) {
  const priceInfo = getProductPriceInfo(product);
  const wish = useWishlist();
  const cart = useCart();
  const second = product.images[1] ?? product.images[0];

  const activeColor = useMemo(() => {
    if (!product.colorVariants || product.colorVariants.length === 0) return product.color;
    const baseAvailability = getProductAvailability(product);
    const availableVariant = baseAvailability.colorVariants.find((v) => v.isAvailable);
    return availableVariant?.color ?? product.colorVariants[0]?.color ?? product.color;
  }, [product.color, product.colorVariants]);

  const availability = useMemo(() => {
    return getProductAvailability(product, activeColor);
  }, [product, activeColor]);

  const sizeStock = availability.sizeStock ?? {};
  const hasSizeStock = Object.keys(sizeStock).length > 0;
  const allOOS = hasSizeStock && availability.sizes.every((s) => (sizeStock[s] ?? 1) === 0);
  const isOOS = !availability.isAvailable || availability.stock === 0 || allOOS;

  const firstAvailableSize = useMemo(() => {
    if (isOOS) return null;
    return (
      availability.sizes.find((s) => {
        const qty = sizeStock[s];
        const disabled = hasSizeStock && qty !== undefined && qty === 0;
        return !disabled;
      }) ?? null
    );
  }, [availability.sizes, sizeStock, hasSizeStock, isOOS]);

  const [size, setSize] = useState<string | null>(firstAvailableSize);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickSize, setQuickSize] = useState(firstAvailableSize ?? product.sizes[0]);
  const [quickQty, setQuickQty] = useState(1);

  const activeVariantId = useMemo(() => {
    return availability.selectedVariant?.id ?? product.colorVariants?.[0]?.id;
  }, [availability.selectedVariant, product.colorVariants]);

  const [isExpanded, setIsExpanded] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const hasSizes = availability.sizes && availability.sizes.length > 0;

  const handleAddDirectly = (sizeValue: string) => {
    if (sizeValue && !product.sizes.includes(sizeValue)) {
      if (process.env.NODE_ENV === "development") {
        console.error(
          `Validation Failure: Selected size "${sizeValue}" does not exist on product.`,
          product,
        );
      }
      return;
    }
    const validation = validateStockBeforeCheckout(product, {
      productId: product.id,
      size: sizeValue,
      quantity: 1,
      color: availability.color,
    });
    if (!validation.ok) {
      toast.error(validation.reason ?? "This size is out of stock");
      return;
    }
    cart.add(product.id, sizeValue, 1, activeVariantId);
    toast.success("Added to bag", { description: `${product.name} · ${sizeValue || "One Size"}` });
  };

  return (
    <>
      <div className="group flex flex-col h-full">
        {/* PART 1: Large product image */}
        <div className="relative overflow-hidden bg-neutral aspect-[3/5] sm:aspect-[3/4] w-full">
          {priceInfo.isOnSale && (
            <div className="absolute top-3.5 left-3.5 z-30">
              <span className="text-[10px] font-bold tracking-widest uppercase bg-foreground text-background px-2.5 py-1 font-sans">
                Sale
              </span>
            </div>
          )}
          {/* Mobile view with slider/swipe container */}
          <div className="sm:hidden relative w-full h-full">
            {product.images.length > 1 ? (
              <>
                <div
                  className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-none touch-pan-x"
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const index = Math.round(container.scrollLeft / container.clientWidth);
                    if (index !== activeImageIndex) {
                      setActiveImageIndex(index);
                    }
                  }}
                >
                  {product.images.map((img, idx) => (
                    <div key={idx} className="w-full h-full shrink-0 snap-start relative">
                      <Link
                        to="/product/$slug"
                        params={{ slug: product.slug }}
                        className="block w-full h-full"
                      >
                        <img
                          src={img}
                          alt={`${product.name} - image ${idx + 1}`}
                          loading={idx === 0 ? "eager" : "lazy"}
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      </Link>
                    </div>
                  ))}
                </div>
                {/* Subtle indicator dots */}
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none">
                  {product.images.map((_, idx) => (
                    <span
                      key={idx}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        activeImageIndex === idx ? "w-2.5 bg-foreground" : "w-1 bg-foreground/30"
                      }`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <Link
                to="/product/$slug"
                params={{ slug: product.slug }}
                className="block w-full h-full"
              >
                <img
                  src={product.images[0]}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </Link>
            )}
          </div>

          {/* Desktop view with hover effect */}
          <div className="hidden sm:block relative w-full h-full">
            <Link to="/product/$slug" params={{ slug: product.slug }}>
              <img
                src={product.images[0]}
                alt={product.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 group-hover:opacity-0"
              />
              <img
                src={second}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition-[opacity,transform] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-hover:scale-105"
              />
            </Link>
          </div>

          {/* OOS Overlay */}
          {isOOS && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
              <span className="text-[11px] tracking-[0.32em] uppercase text-foreground/70">
                Out of Stock
              </span>
            </div>
          )}

          {/* Floating Wishlist Button */}
          <button
            aria-label="Add to wishlist"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const wasWishlisted = wish.has(product.id);
              wish.toggle(product.id);
              toast(wasWishlisted ? "Removed from Wishlist" : "Added to Wishlist");
            }}
            className="absolute top-3.5 right-3.5 h-10 w-10 rounded-full flex items-center justify-center bg-white/25 backdrop-blur-md border border-white/20 shadow-lg text-foreground hover:text-gold transition-[color,transform] duration-300 active:scale-95 z-30"
          >
            <Heart
              className={`h-[18px] w-[18px] transition-transform duration-300 ${
                wish.has(product.id) ? "fill-gold text-gold" : "text-foreground"
              }`}
            />
          </button>

          {/* Floating Add to Cart Button with Size Selector */}
          {!isOOS && (
            <div
              className={`absolute bottom-3.5 left-3.5 z-30 flex items-center bg-white/25 backdrop-blur-md border border-white/20 shadow-lg transition-[width,max-width,padding,transform] duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] rounded-full overflow-hidden ${
                isExpanded
                  ? "px-3 py-1.5 max-w-[calc(100%-1.75rem)] h-10 w-full"
                  : "w-10 h-10 justify-center"
              }`}
              onMouseEnter={() => {
                if (hasSizes) setIsExpanded(true);
              }}
              onMouseLeave={() => {
                if (hasSizes) setIsExpanded(false);
              }}
            >
              <style>{`
                .scrollbar-none::-webkit-scrollbar {
                  display: none !important;
                }
              `}</style>
              {!isExpanded ? (
                <button
                  aria-label="Add to bag"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (hasSizes) {
                      setIsExpanded(true);
                    } else {
                      handleAddDirectly("");
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center text-foreground hover:text-gold transition-colors duration-300 shrink-0"
                >
                  <Plus className="h-5 w-5" />
                </button>
              ) : (
                <div
                  className="flex items-center gap-1.5 overflow-x-auto scrollbar-none touch-pan-x w-full select-none py-0.5"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {availability.sizes.map((s) => {
                    const qty = sizeStock[s];
                    const disabled =
                      availability.stock === 0 || (hasSizeStock && qty !== undefined && qty === 0);
                    return (
                      <button
                        key={s}
                        disabled={disabled}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddDirectly(s);
                          setIsExpanded(false);
                        }}
                        className={`w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-medium border shrink-0 transition-colors duration-300 ${
                          disabled
                            ? "border-black/5 text-black/20 line-through cursor-not-allowed"
                            : "border-black/10 hover:border-foreground hover:bg-foreground hover:text-background text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* PART 2: Compact Product Information Section (Left Aligned) */}
        <div className="pt-3 flex flex-col items-start gap-1">
          {/* Category */}
          <span className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {product.category || "clothing"}
          </span>

          {/* Name */}
          <Link
            to="/product/$slug"
            params={{ slug: product.slug }}
            className="font-serif text-base leading-tight hover:text-gold transition-colors duration-300 mt-0.5 block text-left"
          >
            {product.name}
          </Link>

          {/* Prices (Old Price first, then Current Price) */}
          <div className="flex items-baseline gap-2 mt-1 flex-wrap">
            {priceInfo.isOnSale ? (
              <>
                <span className="text-[11px] text-[#81807f] line-through tracking-wider font-sans">
                  ${priceInfo.originalPrice.toLocaleString()}
                </span>
                <span className="text-xs font-semibold text-black tracking-wider font-sans">
                  ${priceInfo.salePrice.toLocaleString()}
                </span>
              </>
            ) : (
              <span className="text-xs text-foreground tracking-wider font-sans">
                ${priceInfo.salePrice.toLocaleString()}
              </span>
            )}
          </div>

          {/* Sale Percentage (Rounded pill, soft background, placed directly below price) */}
          {priceInfo.isOnSale && priceInfo.discountPercent > 0 && (
            <span className="inline-flex items-center justify-center text-[10px] font-extrabold tracking-widest uppercase border border-gold/25 text-gold bg-gold/5 px-3 py-1 rounded-full mt-1.5 leading-none antialiased">
              {priceInfo.discountPercent}% OFF
            </span>
          )}

          {/* Product Tags (placed below the sale badge, small pills, soft background) */}
          {product.badge && (
            <span className="inline-flex items-center justify-center text-[10px] font-extrabold tracking-widest uppercase border border-border/40 text-muted-foreground bg-neutral/10 px-3 py-1 rounded-full mt-2 leading-none antialiased">
              {product.badge}
            </span>
          )}
        </div>
      </div>

      {/* ─── Quick View Modal ─── */}
      {quickOpen && (
        <div
          onClick={() => setQuickOpen(false)}
          className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-sm animate-fade flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-background w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-luxe animate-fade-up grid md:grid-cols-2"
          >
            {/* Image */}
            <div className="aspect-[3/4] bg-neutral">
              <img
                src={product.images[0]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Details */}
            <div className="p-8 lg:p-10 flex flex-col justify-center relative">
              <button
                onClick={() => setQuickOpen(false)}
                aria-label="Close"
                className="absolute top-4 right-4 hover:text-gold transition-colors"
              >
                <X className="h-5 w-5" />
              </button>

              {product.badge && (
                <div className="mb-3.5">
                  <span className="inline-flex items-center justify-center text-[10px] font-extrabold tracking-widest uppercase border border-gold/25 text-gold bg-gold/5 px-3 py-1 rounded-full leading-none antialiased">
                    {product.badge}
                  </span>
                </div>
              )}
              <h1 className="font-serif text-3xl font-light text-foreground">{product.name}</h1>
              <p className="text-xs text-muted-foreground tracking-widest uppercase mt-1">
                {product.subcategory}
              </p>
              <ProductPrice product={product} size="lg" className="mt-5" />

              <p className="text-sm text-muted-foreground mt-5 leading-relaxed">
                {product.description}
              </p>

              {/* Sizes */}
              <div className="mt-6">
                <p className="eyebrow mb-3">Size</p>
                <div className="flex flex-wrap gap-2">
                  {availability.sizes.map((s) => {
                    const qty = sizeStock[s];
                    const disabled = hasSizeStock && qty !== undefined && qty === 0;
                    return (
                      <button
                        key={s}
                        disabled={disabled}
                        onClick={() => {
                          setQuickSize(s);
                        }}
                        className={`min-w-10 h-10 px-3 text-sm border transition-all duration-300 ${
                          quickSize === s && !disabled
                            ? "border-foreground bg-foreground text-background"
                            : disabled
                              ? "border-border/40 text-border/50 line-through diagonal-strike cursor-not-allowed"
                              : "border-border hover:border-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quantity + Add */}
              <div className="mt-6 flex items-center gap-4">
                <div className="flex items-center border border-border">
                  <button
                    aria-label="decrease"
                    onClick={() => setQuickQty((q) => Math.max(1, q - 1))}
                    className="h-10 w-10 grid place-items-center hover:bg-neutral transition-colors"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center text-sm">{quickQty}</span>
                  <button
                    aria-label="increase"
                    onClick={() => setQuickQty((q) => q + 1)}
                    className="h-10 w-10 grid place-items-center hover:bg-neutral transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  const chosen = quickSize;
                  if (!chosen) {
                    toast.error("Please select a size first");
                    return;
                  }
                  if (!product.sizes.includes(chosen)) {
                    if (process.env.NODE_ENV === "development") {
                      console.error(
                        `Validation Failure: Selected size "${chosen}" does not exist on product.`,
                        product,
                      );
                    }
                    return;
                  }
                  if (quickQty < 1) {
                    if (process.env.NODE_ENV === "development") {
                      console.error(`Validation Failure: Invalid quantity "${quickQty}".`, product);
                    }
                    return;
                  }
                  const validation = validateStockBeforeCheckout(product, {
                    productId: product.id,
                    size: chosen,
                    quantity: quickQty,
                    color: availability.color,
                  });
                  if (!validation.ok) {
                    toast.error(validation.reason ?? "This size is out of stock");
                    return;
                  }
                  const activeVariant = product.colorVariants?.find(
                    (v) => v.color === availability.color,
                  ) ?? { sku: product.sku };
                  const targetSku = activeVariant.sku ?? product.sku;
                  if (!targetSku) {
                    if (process.env.NODE_ENV === "development") {
                      console.error("Validation Failure: Product SKU does not exist.", product);
                    }
                    return;
                  }
                  cart.add(product.id, chosen, quickQty, activeVariantId);
                  toast.success("Added to bag", {
                    description: `${product.name} · ${chosen} · Qty ${quickQty}`,
                  });
                  setQuickOpen(false);
                }}
                className="mt-6 w-full bg-foreground text-background py-4 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300"
              >
                Add to Bag — ${(priceInfo.salePrice * quickQty).toLocaleString()}.00
              </button>

              <Link
                to="/product/$slug"
                params={{ slug: product.slug }}
                onClick={() => setQuickOpen(false)}
                className="mt-4 text-center text-[11px] tracking-[0.28em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                Full Details
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
