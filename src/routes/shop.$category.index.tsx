import { createFileRoute } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { useState } from "react";
import {
  useActiveCategories,
  useCategoryProducts,
  type CategoryNode,
  toProductProps,
} from "@/lib/categories";

export const Route = createFileRoute("/shop/$category/")({
  head: ({ params }) => {
    const name = params.category.charAt(0).toUpperCase() + params.category.slice(1);
    return {
      meta: [
        { title: `${name} — ANORA` },
        { name: "description", content: `Explore the ANORA ${params.category} collection.` },
        { property: "og:title", content: `${name} — ANORA` },
      ],
    };
  },
  component: ShopCategory,
});

function ShopCategory() {
  const { category } = Route.useParams();
  const [sub, setSub] = useState("All");

  const { data: dbProducts = [] } = useCategoryProducts(category);
  const { data: allCats = [] } = useActiveCategories();

  const parent = allCats.find((c) => c.slug === category);
  const children: CategoryNode[] = parent?.children ?? [];

  const subs = ["All", ...children.map((c) => c.name)];
  const filtered =
    sub === "All"
      ? dbProducts
      : dbProducts.filter((p) => p.category_slug === children.find((c) => c.name === sub)?.slug);

  const heading = category === "clothing" ? "Clothing" : "Jewellery";
  const tagline =
    category === "clothing"
      ? "Silks, cashmere and ceremonial dress — slow tailored in our atelier."
      : "Recycled 18k gold and considered stones, finished entirely by hand.";

  return (
    <div className="pt-16 pb-24">
      <div className="text-center px-6 mb-14 max-w-2xl mx-auto">
        <span className="eyebrow">The House of</span>
        <h1 className="mt-4 font-serif text-5xl md:text-6xl">{heading}</h1>
        <p className="mt-5 text-muted-foreground">{tagline}</p>
      </div>

      <div className="px-5 lg:px-10">
        {subs.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2 mb-14">
            {subs.map((s) => (
              <button
                key={s}
                onClick={() => setSub(s)}
                className={`text-[11px] tracking-[0.28em] uppercase px-4 py-2 border transition-colors ${
                  sub === s
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            New pieces in this collection are arriving soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-14 max-w-7xl mx-auto">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={toProductProps(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
