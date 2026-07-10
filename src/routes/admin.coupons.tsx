import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { CouponsTable } from "@/components/admin/CouponsTable";

export const Route = createFileRoute("/admin/coupons")({
  head: () => ({
    meta: [{ title: "Coupons — ANORA" }],
  }),
  component: CouponsPage,
});

function CouponsPage() {
  return (
    <AdminLayout>
      <div>
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Coupons</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Manage discount coupons — create, edit, activate, and track coupon redemptions.
          </p>
        </div>
        <CouponsTable />
      </div>
    </AdminLayout>
  );
}
