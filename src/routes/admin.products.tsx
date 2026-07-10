import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ProductsTable } from "@/components/admin/ProductsTable";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/products")({
  head: () => ({
    meta: [{ title: "Products Management — ANORA" }],
  }),
  component: AdminProductsPage,
});

function AdminProductsPage() {
  return (
    <AdminLayout>
      <div className="mb-10">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="eyebrow">
              <Link to="/admin" className="hover:text-foreground transition-colors">
                Admin
              </Link>
            </p>
            <h1 className="font-serif text-4xl mt-2">Products</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg">
              Manage your product catalog — create, edit, duplicate, and organize products.
            </p>
          </div>
        </div>
      </div>

      <ProductsTable />
    </AdminLayout>
  );
}
