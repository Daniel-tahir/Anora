import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { useSaleProductsCatalog } from "@/lib/products-query";
import { SITE_URL } from "@/lib/config";
import { useMemo } from "react";
import { sortProducts } from "@/lib/products";

interface ShopSearch {
  sort?: "featured" | "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";
  q?: string;
}

export const Route = createFileRoute("/shop/sale")({
  validateSearch: (search: Record<string, unknown>): ShopSearch => {
    return {
      sort: (["featured", "newest", "price-asc", "price-desc", "name-asc", "name-desc"].includes(search.sort as string))
        ? (search.sort as any)
        : undefined,
      q: typeof search.q === "string" ? search.q : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Exclusive Offers & Sale Pieces | ANORA New York" },
      {
        name: "description",
        content: "Explore the ANORA sale — selected luxury clothing and jewellery offered at special prices.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Exclusive Offers & Sale Pieces | ANORA New York" },
      {
        property: "og:description",
        content: "Explore the ANORA sale — selected luxury clothing and jewellery offered at special prices.",
      },
      { property: "og:url", content: `${SITE_URL}/shop/sale` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Exclusive Offers & Sale Pieces | ANORA New York" },
      {
        name: "twitter:description",
        content: "Explore the ANORA sale — selected luxury clothing and jewellery offered at special prices.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/shop/sale` }],
  }),
  component: ShopSale,
});

function ShopSale() {
  const { data: products = [], isLoading } = useSaleProductsCatalog();
  const navigate = Route.useNavigate();
  const { sort, q } = Route.useSearch();

  const filteredProducts = useMemo(() => {
    if (!q) return products;
    const query = q.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.subcategory.toLowerCase().includes(query)
    );
  }, [products, q]);

  const sortedProducts = useMemo(() => {
    return sortProducts(filteredProducts, sort);
  }, [filteredProducts, sort]);

  const totalProducts = sortedProducts.length;

  if (isLoading) {
    return (
      <div className="py-32 text-center text-muted-foreground animate-fade font-sans">
        Loading offers...
      </div>
    );
  }

  return (
    <div className="px-5 lg:px-10 pt-16 pb-24">
      <div className="text-center mb-14 max-w-2xl mx-auto animate-fade">
        <span className="eyebrow text-gold">Exclusive Offers</span>
        <h1 className="mt-4 font-serif text-5xl md:text-6xl">Selected Pieces</h1>
        <p className="mt-5 text-muted-foreground font-sans">
          Curated designs offered at special pricing for a limited time.
        </p>
      </div>

      {sortedProducts.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto mb-8 border-b border-border/20 pb-4 animate-fade">
          <span className="text-[11px] tracking-widest text-muted-foreground uppercase font-medium">
            Showing {totalProducts} {totalProducts === 1 ? "piece" : "pieces"} {q && `for "${q}"`}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] tracking-widest text-muted-foreground uppercase font-bold font-sans">Sort By</span>
            <div className="relative">
              <select
                id="sort-select"
                value={sort || "featured"}
                onChange={(e) => {
                  const val = e.target.value;
                  void navigate({
                    search: (old) => {
                      const next = { ...old };
                      if (val === "featured") {
                        delete next.sort;
                      } else {
                        next.sort = val as any;
                      }
                      return next;
                    }
                  });
                }}
                className="appearance-none bg-background border border-border/80 px-4 py-2 pr-10 text-[11px] tracking-wider uppercase focus:outline-none focus:border-foreground transition-colors cursor-pointer rounded-none font-sans text-foreground"
              >
                <option value="featured">Featured</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name-asc">Name: A–Z</option>
                <option value="name-desc">Name: Z–A</option>
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {sortedProducts.length === 0 ? (
        <div className="py-20 text-center max-w-md mx-auto px-6 animate-fade">
          <span className="eyebrow text-gold">Offers</span>
          <h2 className="font-serif text-4xl mt-4">Atelier Archive</h2>
          <p className="text-sm text-muted-foreground mt-4 leading-relaxed font-sans">
            No pieces are currently on sale. Explore our latest custom tailoring and new arrivals.
          </p>
          <Link
            to="/shop"
            className="inline-block mt-8 text-[11px] tracking-[0.32em] uppercase hover-underline border border-border px-6 py-3 font-sans"
          >
            Explore all pieces
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14 max-w-7xl mx-auto">
          {sortedProducts.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
