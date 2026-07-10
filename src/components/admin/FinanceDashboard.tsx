import { useState } from "react";
import {
  useFinanceDashboard,
  useRevenueTrend,
  useTaxTrend,
  useRefundTrend,
  useDiscountTrend,
  useMonthlyComparison,
  useYearlyComparison,
} from "@/lib/admin-finance";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  RotateCcw,
  Percent,
  ShoppingCart,
  FileText,
  Ban,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function FinanceDashboard() {
  const [dateRange, setDateRange] = useState("30days");
  const startDate =
    dateRange === "30days"
      ? new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
      : dateRange === "90days"
        ? new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]
        : dateRange === "1year"
          ? new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
          : undefined;
  const endDate = new Date().toISOString().split("T")[0];

  const { data: dashboard, loading: dashLoading } = useFinanceDashboard();
  const { data: revenueTrend, loading: revLoading } = useRevenueTrend(startDate, endDate);
  const { data: taxTrend } = useTaxTrend(startDate, endDate);
  const { data: refundTrend } = useRefundTrend(startDate, endDate);
  const { data: discountTrend } = useDiscountTrend(startDate, endDate);
  const { data: monthlyCmp } = useMonthlyComparison();
  const { data: yearlyCmp } = useYearlyComparison();

  const revenueCards = dashboard
    ? [
        {
          label: "Gross Revenue",
          value: formatCurrency(dashboard.grossRevenue),
          icon: <DollarSign className="h-4 w-4" />,
        },
        {
          label: "Net Revenue",
          value: formatCurrency(dashboard.netRevenue),
          icon: <TrendingUp className="h-4 w-4" />,
        },
        {
          label: "Revenue Today",
          value: formatCurrency(dashboard.revenueToday),
          icon: <DollarSign className="h-4 w-4" />,
        },
        {
          label: "This Week",
          value: formatCurrency(dashboard.revenueThisWeek),
          icon: <DollarSign className="h-4 w-4" />,
        },
        {
          label: "This Month",
          value: formatCurrency(dashboard.revenueThisMonth),
          icon: <DollarSign className="h-4 w-4" />,
        },
        {
          label: "This Year",
          value: formatCurrency(dashboard.revenueThisYear),
          icon: <DollarSign className="h-4 w-4" />,
        },
      ]
    : [];

  const financialCards = dashboard
    ? [
        {
          label: "Taxes Collected",
          value: formatCurrency(dashboard.taxesCollected),
          icon: <Receipt className="h-4 w-4" />,
        },
        {
          label: "Discounts Applied",
          value: formatCurrency(dashboard.discountsApplied),
          icon: <Percent className="h-4 w-4" />,
        },
        {
          label: "Refund Amounts",
          value: formatCurrency(dashboard.refundAmounts),
          icon: <RotateCcw className="h-4 w-4" />,
        },
        {
          label: "Avg Order Value",
          value: formatCurrency(dashboard.averageOrderValue),
          icon: <ShoppingCart className="h-4 w-4" />,
        },
        {
          label: "Paid Orders",
          value: dashboard.totalPaidOrders.toLocaleString(),
          icon: <FileText className="h-4 w-4" />,
        },
        {
          label: "Outstanding",
          value: formatCurrency(dashboard.outstandingAmounts),
          icon: <Ban className="h-4 w-4" />,
        },
      ]
    : [];

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Finance Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Revenue, taxes, refunds, and financial metrics at a glance.
        </p>
      </div>

      <div className="flex gap-2 mb-8">
        {["30days", "90days", "1year"].map((r) => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase rounded-md transition-colors ${
              dateRange === r
                ? "bg-foreground text-background"
                : "border border-border/60 text-muted-foreground hover:border-foreground/30"
            }`}
          >
            {r === "30days" ? "30 Days" : r === "90days" ? "90 Days" : "1 Year"}
          </button>
        ))}
      </div>

      {dashLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <DashboardCard key={i} label="—" loading />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-10">
            <h2 className="text-sm font-medium mb-4 uppercase tracking-wider text-muted-foreground">
              Revenue
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {revenueCards.map((c) => (
                <DashboardCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
              ))}
            </div>
          </div>

          <div className="mb-10">
            <h2 className="text-sm font-medium mb-4 uppercase tracking-wider text-muted-foreground">
              Financial Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {financialCards.map((c) => (
                <DashboardCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
              ))}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 mb-10">
            <div className="border border-border/60 p-6">
              <h3 className="text-sm font-medium mb-4">Revenue Trend</h3>
              {revLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : revenueTrend && revenueTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={revenueTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5, 10)}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="hsl(var(--foreground))"
                      fill="hsl(var(--foreground))"
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No data
                </div>
              )}
            </div>

            <div className="border border-border/60 p-6">
              <h3 className="text-sm font-medium mb-4">Tax & Discounts Trend</h3>
              {taxTrend && taxTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={taxTrend.map((t, i) => ({
                      ...t,
                      discounts: discountTrend?.[i]?.discount || 0,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5, 10)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="tax" fill="hsl(var(--foreground))" opacity={0.6} name="Tax" />
                    <Bar dataKey="discounts" fill="hsl(var(--gold))" name="Discounts" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No data
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 mb-10">
            <div className="border border-border/60 p-6">
              <h3 className="text-sm font-medium mb-4">Refund Trend</h3>
              {refundTrend && refundTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={refundTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5, 10)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="refund"
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No refund data
                </div>
              )}
            </div>

            <div className="border border-border/60 p-6">
              <h3 className="text-sm font-medium mb-4">Monthly Comparison</h3>
              {monthlyCmp && monthlyCmp.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyCmp}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => MONTH_NAMES[v - 1]}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill="hsl(var(--foreground))" name="This Year" />
                    <Bar
                      dataKey="previousRevenue"
                      fill="hsl(var(--muted-foreground))"
                      name="Previous Year"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
                  No comparison data
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
