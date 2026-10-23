import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { useActiveCategories } from "@/lib/categories";
import { useProductsCatalog } from "@/lib/products-query";
import { SITE_URL } from "@/lib/config";
import { useMemo } from "react";
import { sortProducts } from "@/lib/products";

interface ShopSearch {
  sort?: "featured" | "newest" | "price-asc" | "price-desc" | "name-asc" | "name-desc";
  q?: string;
}

export const Route = createFileRoute("/shop/")({
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
      { title: "Shop Luxury Women's Fashion | ANORA New York" },
      { name: "description", content: "Browse the full ANORA atelier — clothing and jewellery." },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Shop Luxury Women's Fashion | ANORA New York" },
      {
        property: "og:description",
        content: "Browse the full ANORA atelier — clothing and jewellery.",
      },
      { property: "og:url", content: `${SITE_URL}/shop` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: `${SITE_URL}/logo.png` },
      { property: "og:site_name", content: "ANORA" },
      { property: "og:locale", content: "en_US" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Shop Luxury Women's Fashion | ANORA New York" },
      {
        name: "twitter:description",
        content: "Browse the full ANORA atelier — clothing and jewellery.",
      },
      { name: "twitter:image", content: `${SITE_URL}/logo.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/shop` }],
  }),
  component: ShopAll,
});

function ShopAll() {
  const { data: categories = [] } = useActiveCategories();
  const { data: products = [] } = useProductsCatalog();
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
  const subCount = categories.reduce((sum, c) => sum + c.children.length, 0);

  return (
    <div className="px-5 lg:px-10 pt-16 pb-24">
      <div className="text-center mb-14 max-w-2xl mx-auto">
        <span className="eyebrow">The Atelier</span>
        <h1 className="mt-4 font-serif text-5xl md:text-6xl">All Pieces</h1>
        <p className="mt-5 text-muted-foreground">
          A complete edit of our current collection, across both houses.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-14">
        <Link
          to="/shop"
          activeOptions={{ exact: true }}
          activeProps={{ className: "border-foreground text-foreground" }}
          className="text-[11px] tracking-[0.32em] uppercase px-5 py-2.5 border border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
        >
          All
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            to={`/shop/${cat.slug}` as any}
            className="text-[11px] tracking-[0.32em] uppercase px-5 py-2.5 border border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            {cat.name}
          </Link>
        ))}
      </div>

      {/* Catalog Control Bar */}
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 sm:gap-x-6 sm:gap-y-14 max-w-7xl mx-auto">
        {sortedProducts.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-16">
        {subCount} subcategories · {totalProducts} pieces
      </p>
    </div>
  );
}
