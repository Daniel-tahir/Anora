import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminBlogManagement } from "@/modules/blog";

export const Route = createFileRoute("/admin/blogs")({
  head: () => ({
    meta: [{ title: "Blog Management — ANORA" }],
  }),
  component: AdminBlogsPage,
});

function AdminBlogsPage() {
  return (
    <AdminLayout>
      <AdminBlogManagement />
    </AdminLayout>
  );
}
