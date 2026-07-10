import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { GiftCardsTable } from "@/components/admin/GiftCardsTable";

export const Route = createFileRoute("/admin/gift-cards")({
  head: () => ({
    meta: [{ title: "Gift Cards — ANORA" }],
  }),
  component: GiftCardsPage,
});

function GiftCardsPage() {
  return (
    <AdminLayout>
      <div>
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Gift Cards</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Manage gift cards — create, track balances, and monitor redemption history.
          </p>
        </div>
        <GiftCardsTable />
      </div>
    </AdminLayout>
  );
}
