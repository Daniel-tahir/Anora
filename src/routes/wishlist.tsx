import { createFileRoute, Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCart, useWishlist } from "@/lib/store";
import { toast } from "sonner";
import { getProductPriceInfo, type Product } from "@/lib/products";
import { ProductPrice } from "@/components/site/ProductPrice";

export const Route = createFileRoute("/wishlist")({
  head: () => ({
    meta: [
      { title: "Wishlist | ANORA New York" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const wish = useWishlist();
  const cart = useCart();
  const items = wish.ids
    .map((id) => wish.getProduct(id))
    .filter((p): p is Product => !!p);

  return (
    <div className="px-5 lg:px-10 py-16 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">Saved Pieces</span>
        <h1 className="font-serif text-5xl mt-3">Wishlist</h1>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No pieces saved yet.</p>
          <Link
            to="/shop"
            className="mt-6 inline-block bg-foreground text-background px-8 py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors"
          >
            Discover the Atelier
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-3.5 gap-y-10 sm:gap-x-5 sm:gap-y-14">
          {items.map((p, idx) => {
            const priceInfo = getProductPriceInfo(p);
            const wishKey = wish.ids[idx] || p.id;
            return (
              <div key={wishKey} className="relative group">
                <Link to="/product/$slug" params={{ slug: p.slug }} search={{ color: p.color }}>
                  <div className="aspect-[3/4] bg-neutral overflow-hidden">
                    <img
                      src={p.images && p.images[0] ? p.images[0] : ""}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105"
                    />
                  </div>
                </Link>
                {priceInfo.isOnSale && priceInfo.discountPercent > 0 && (
                  <span className="absolute top-3 left-3 inline-flex items-center justify-center text-[10px] font-extrabold tracking-[0.18em] uppercase border border-gold/30 text-gold bg-background/95 px-3 py-1.5 backdrop-blur rounded-full shadow-sm leading-none z-10 antialiased">
                    {priceInfo.badgeText}
                  </span>
                )}
                <button
                  onClick={() => wish.remove(p.id, p.selectedVariantId)}
                  className="absolute top-3 right-3 h-9 w-9 bg-background/90 backdrop-blur grid place-items-center hover:text-gold"
                  aria-label="remove"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="pt-4 flex items-start justify-between">
                  <div>
                    <Link
                      to="/product/$slug"
                      params={{ slug: p.slug }}
                      search={{ color: p.color }}
                      className="font-serif text-lg hover:text-gold"
                    >
                      {p.name}
                    </Link>
                    <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground mt-1">
                      {p.subcategory} · {p.color}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <ProductPrice product={p} size="md" />
                  </div>
                </div>
                <button
                  onClick={() => {
                    cart.add(p.id, p.sizes && p.sizes[0] ? p.sizes[0] : "S", 1, p.selectedVariantId);
                    toast.success("Added to bag", { description: p.name });
                  }}
                  className="mt-4 w-full border border-foreground py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-foreground hover:text-background transition-colors"
                >
                  Add to Bag
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
