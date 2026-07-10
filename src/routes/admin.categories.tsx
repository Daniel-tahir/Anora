import { createFileRoute } from "@tanstack/react-router";
import { CategoriesTable } from "@/components/admin/CategoriesTable";
import { AdminLayout } from "@/components/admin/AdminLayout";

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [{ title: "Categories — ANORA" }],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <AdminLayout>
      <div>
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Categories</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">Manage product categories.</p>
        </div>
        <CategoriesTable />
      </div>
    </AdminLayout>
  );
}
