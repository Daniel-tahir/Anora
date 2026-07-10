import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { LowStockWidget } from "@/components/admin/LowStockWidget";
import { RecentCustomersTable } from "@/components/admin/RecentCustomersTable";
import { RecentOrdersTable } from "@/components/admin/RecentOrdersTable";
import { SalesChart } from "@/components/admin/SalesChart";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { OrdersAnalytics } from "@/components/admin/OrdersAnalytics";
import { CustomerAnalytics } from "@/components/admin/CustomerAnalytics";
import { ProductAnalytics } from "@/components/admin/ProductAnalytics";
import { useAnalyticsSummary, type AnalyticsSummary } from "@/lib/admin-analytics";
import { useCouponAnalytics } from "@/lib/admin-coupons";
import { useGiftCardAnalytics } from "@/lib/admin-gift-cards";

import {
  ShoppingCart,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  Tag,
  Users,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Package,
  Layers,
  AlertTriangle,
  ArrowRightLeft,
  Gift,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin Dashboard — ANORA" }],
  }),
  component: AdminPage,
});

type CardDef = {
  key: string;
  label: string;
  getValue: (s: AnalyticsSummary) => string;
  icon: React.ReactNode;
  accent: string;
};

const REVENUE_CARDS: CardDef[] = [
  {
    key: "totalRevenue",
    label: "Total Revenue",
    getValue: (s) => `$${s.totalRevenue.toLocaleString()}`,
    icon: <DollarSign className="h-4 w-4" />,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "revenueToday",
    label: "Revenue Today",
    getValue: (s) => `$${s.revenueToday.toLocaleString()}`,
    icon: <TrendingUp className="h-4 w-4" />,
    accent: "text-emerald-500 dark:text-emerald-300",
  },
  {
    key: "revenueThisWeek",
    label: "Revenue This Week",
    getValue: (s) => `$${s.revenueThisWeek.toLocaleString()}`,
    icon: <TrendingUp className="h-4 w-4" />,
    accent: "text-emerald-500 dark:text-emerald-300",
  },
  {
    key: "revenueThisMonth",
    label: "Revenue This Month",
    getValue: (s) => `$${s.revenueThisMonth.toLocaleString()}`,
    icon: <TrendingUp className="h-4 w-4" />,
    accent: "text-emerald-500 dark:text-emerald-300",
  },
];

const ORDER_CARDS: CardDef[] = [
  {
    key: "totalOrders",
    label: "Total Orders",
    getValue: (s) => s.totalOrders.toLocaleString(),
    icon: <ShoppingCart className="h-4 w-4" />,
    accent: "text-sky-600 dark:text-sky-400",
  },
  {
    key: "pendingOrders",
    label: "Pending",
    getValue: (s) => s.pendingOrders.toLocaleString(),
    icon: <Clock className="h-4 w-4" />,
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    key: "confirmedOrders",
    label: "Confirmed",
    getValue: (s) => s.confirmedOrders.toLocaleString(),
    icon: <CheckCircle className="h-4 w-4" />,
    accent: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "processingOrders",
    label: "Processing",
    getValue: (s) => s.processingOrders.toLocaleString(),
    icon: <ArrowRightLeft className="h-4 w-4" />,
    accent: "text-purple-600 dark:text-purple-400",
  },
  {
    key: "shippedOrders",
    label: "Shipped",
    getValue: (s) => s.shippedOrders.toLocaleString(),
    icon: <Package className="h-4 w-4" />,
    accent: "text-cyan-600 dark:text-cyan-400",
  },
  {
    key: "deliveredOrders",
    label: "Delivered",
    getValue: (s) => s.deliveredOrders.toLocaleString(),
    icon: <CheckCircle className="h-4 w-4" />,
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "cancelledOrders",
    label: "Cancelled",
    getValue: (s) => s.cancelledOrders.toLocaleString(),
    icon: <XCircle className="h-4 w-4" />,
    accent: "text-red-600 dark:text-red-400",
  },
  {
    key: "refundedOrders",
    label: "Refunded",
    getValue: (s) => s.refundedOrders.toLocaleString(),
    icon: <RotateCcw className="h-4 w-4" />,
    accent: "text-stone-600 dark:text-stone-400",
  },
];

const CUSTOMER_CARDS: CardDef[] = [
  {
    key: "totalCustomers",
    label: "Total Customers",
    getValue: (s) => s.totalCustomers.toLocaleString(),
    icon: <Users className="h-4 w-4" />,
    accent: "text-violet-600 dark:text-violet-400",
  },
  {
    key: "newCustomers",
    label: "New This Month",
    getValue: (s) => s.newCustomers.toLocaleString(),
    icon: <UserPlus className="h-4 w-4" />,
    accent: "text-indigo-500 dark:text-indigo-300",
  },
  {
    key: "returningCustomers",
    label: "Returning",
    getValue: (s) => s.returningCustomers.toLocaleString(),
    icon: <Users className="h-4 w-4" />,
    accent: "text-teal-600 dark:text-teal-400",
  },
];

const PRODUCT_CARDS: CardDef[] = [
  {
    key: "totalProducts",
    label: "Total Products",
    getValue: (s) => s.totalProducts.toLocaleString(),
    icon: <Tag className="h-4 w-4" />,
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  {
    key: "activeProducts",
    label: "Active",
    getValue: (s) => s.activeProducts.toLocaleString(),
    icon: <CheckCircle className="h-4 w-4" />,
    accent: "text-green-600 dark:text-green-400",
  },
  {
    key: "lowStockProducts",
    label: "Low Stock",
    getValue: (s) => s.lowStockProducts.toLocaleString(),
    icon: <AlertTriangle className="h-4 w-4" />,
    accent: "text-orange-600 dark:text-orange-400",
  },
  {
    key: "totalCategories",
    label: "Categories",
    getValue: (s) => s.totalCategories.toLocaleString(),
    icon: <Layers className="h-4 w-4" />,
    accent: "text-pink-600 dark:text-pink-400",
  },
];

function formatRelativeTime(ms: number): string {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  return `${hours} hours ago`;
}

function CardGrid({
  cards,
  summary,
  loading,
}: {
  cards: CardDef[];
  summary: AnalyticsSummary | null;
  loading: boolean;
}) {
  return (
    <>
      {cards.map((c) => (
        <DashboardCard
          key={c.key}
          label={c.label}
          value={summary ? c.getValue(summary) : undefined}
          icon={<span className={c.accent}>{c.icon}</span>}
          loading={loading}
        />
      ))}
    </>
  );
}

function SectionError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="col-span-full border border-red/20 bg-red/5 p-8 text-center">
      <p className="text-sm text-red/80">{error}</p>
      <button
        onClick={onRetry}
        className="mt-4 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

function AdminPage() {
  const location = useLocation();
  const isDashboard = location.pathname === "/admin";

  const { summary, loading, error, refetch } = useAnalyticsSummary();
  const {
    data: couponData,
    loading: couponLoading,
    refetch: refetchCoupons,
  } = useCouponAnalytics();
  const {
    data: giftCardData,
    loading: giftCardLoading,
    refetch: refetchGiftCards,
  } = useGiftCardAnalytics();
  const [, setTick] = useState(0);

  const lastUpdated = summary ? Date.now() : null;

  useEffect(() => {
    if (!lastUpdated) return;
    const id = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  if (!isDashboard) {
    return <Outlet />;
  }

  const timestamp = lastUpdated !== null ? formatRelativeTime(lastUpdated) : "—";

  const allCards = [...REVENUE_CARDS, ...ORDER_CARDS, ...CUSTOMER_CARDS, ...PRODUCT_CARDS];

  return (
    <AdminLayout>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Store overview — revenue, orders, customers, and analytics at a glance.
        </p>
      </div>

      <div className="flex items-center gap-3 mb-10">
        <span className="text-[10px] sm:text-[11px] tracking-[0.2em] text-muted-foreground whitespace-nowrap">
          Updated {timestamp}
        </span>
        <button
          onClick={refetch}
          className="border border-border/60 p-2 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {error && !loading && <SectionError error={error} onRetry={refetch} />}

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allCards.map((c) => (
            <DashboardCard key={c.key} label={c.label} loading />
          ))}
        </div>
      )}

      {!error && !loading && (
        <>
          <section>
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Revenue
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <CardGrid cards={REVENUE_CARDS} summary={summary} loading={false} />
            </div>
          </section>

          <section className="mt-8">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Orders
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CardGrid cards={ORDER_CARDS} summary={summary} loading={false} />
            </div>
          </section>

          <section className="mt-8">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Customers
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <CardGrid cards={CUSTOMER_CARDS} summary={summary} loading={false} />
            </div>
          </section>

          <section className="mt-8">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Products &amp; Categories
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CardGrid cards={PRODUCT_CARDS} summary={summary} loading={false} />
            </div>
          </section>

          <section className="mt-8">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Coupons
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashboardCard
                label="Total Coupons"
                value={couponData?.total_coupons.toLocaleString()}
                icon={<Tag className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
                loading={couponLoading}
              />
              <DashboardCard
                label="Active"
                value={couponData?.active_coupons.toLocaleString()}
                icon={<Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                loading={couponLoading}
              />
              <DashboardCard
                label="Redemptions"
                value={couponData?.total_redemptions.toLocaleString()}
                icon={<Tag className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
                loading={couponLoading}
              />
              <DashboardCard
                label="Revenue Impact"
                value={couponData ? `$${couponData.total_discounted.toLocaleString()}` : undefined}
                icon={<Tag className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                loading={couponLoading}
              />
            </div>
          </section>

          <section className="mt-8">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
              Gift Cards
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <DashboardCard
                label="Total"
                value={giftCardData?.total_gift_cards.toLocaleString()}
                icon={<Gift className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
                loading={giftCardLoading}
              />
              <DashboardCard
                label="Active"
                value={giftCardData?.active_gift_cards.toLocaleString()}
                icon={<Gift className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                loading={giftCardLoading}
              />
              <DashboardCard
                label="Outstanding"
                value={
                  giftCardData ? `$${giftCardData.outstanding_balance.toLocaleString()}` : undefined
                }
                icon={<Gift className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
                loading={giftCardLoading}
              />
              <DashboardCard
                label="Redeemed"
                value={
                  giftCardData ? `$${giftCardData.total_redeemed.toLocaleString()}` : undefined
                }
                icon={<Gift className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                loading={giftCardLoading}
              />
            </div>
          </section>
        </>
      )}

      <section className="mt-16 border-t border-border/40 pt-12">
        <SalesChart />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <RevenueChart />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <OrdersAnalytics />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <CustomerAnalytics />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <ProductAnalytics />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <RecentOrdersTable />
      </section>

      <section className="mt-14 border-t border-border/40 pt-12">
        <RecentCustomersTable />
      </section>

      <section className="mt-14">
        <LowStockWidget />
      </section>
    </AdminLayout>
  );
}
