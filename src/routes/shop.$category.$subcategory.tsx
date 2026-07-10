import { createFileRoute, notFound } from "@tanstack/react-router";
import { ProductCard } from "@/components/site/ProductCard";
import { getActiveCategories, useSubcategoryProducts, toProductProps } from "@/lib/categories";

const VALID_PARENT_SLUGS = ["clothing", "jewellery"];

export const Route = createFileRoute("/shop/$category/$subcategory")({
  loader: async ({ params }) => {
    if (!VALID_PARENT_SLUGS.includes(params.category)) throw notFound();
    const allCats = await getActiveCategories();
    const parent = allCats.find((c) => c.slug === params.category);
    const child = parent?.children.find((c) => c.slug === params.subcategory);
    if (!child) throw notFound();
    return { category: params.category, subcategory: params.subcategory, childName: child.name };
  },
  head: ({ params }) => {
    const name = params.subcategory.charAt(0).toUpperCase() + params.subcategory.slice(1);
    return {
      meta: [
        { title: `${name} — ANORA` },
        { name: "description", content: `Explore ANORA ${params.subcategory}.` },
      ],
    };
  },
  component: ShopSubcategory,
  notFoundComponent: () => (
    <div className="py-32 text-center">
      <p className="eyebrow">Not found</p>
      <h1 className="font-serif text-4xl mt-4">This category doesn't exist</h1>
    </div>
  ),
});

function ShopSubcategory() {
  const { category, subcategory, childName } = Route.useLoaderData() as {
    category: string;
    subcategory: string;
    childName: string;
  };
  const { data: dbProducts = [] } = useSubcategoryProducts(category, subcategory);

  return (
    <div className="pt-16 pb-24">
      <div className="text-center px-6 mb-14 max-w-2xl mx-auto">
        <span className="eyebrow">The House of</span>
        <h1 className="mt-4 font-serif text-5xl md:text-6xl">{childName}</h1>
      </div>

      <div className="px-5 lg:px-10">
        {dbProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-20">
            New pieces in this collection are arriving soon.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-14 max-w-7xl mx-auto">
            {dbProducts.map((p) => (
              <ProductCard key={p.id} product={toProductProps(p)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
