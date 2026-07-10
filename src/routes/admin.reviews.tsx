import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { ReviewsTable } from "@/components/admin/ReviewsTable";

export const Route = createFileRoute("/admin/reviews")({
  head: () => ({
    meta: [{ title: "Reviews — ANORA" }],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  return (
    <AdminLayout>
      <div>
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Reviews</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Manage product reviews — approve, reject, and moderate customer feedback.
          </p>
        </div>
        <ReviewsTable />
      </div>
    </AdminLayout>
  );
}
