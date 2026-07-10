import { useRevenueAnalytics } from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function RevenueChart() {
  const { analytics, loading, error, refetch } = useRevenueAnalytics();

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Revenue</h2>
      </div>

      {error && (
        <div className="border border-red/20 bg-red/5 p-8 text-center">
          <p className="text-sm text-red/80">{error}</p>
          <button
            onClick={refetch}
            className="mt-4 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
          <Skeleton className="h-[280px] w-full rounded-lg" />
        </div>
      )}

      {!loading && !error && analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border border-border/60 p-4">
              <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1">
                Current Period
              </p>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {formatCurrency(analytics.current)}
              </p>
            </div>
            <div className="border border-border/60 p-4">
              <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1">
                Previous Period
              </p>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {formatCurrency(analytics.previous)}
              </p>
            </div>
            <div className="border border-border/60 p-4">
              <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1">
                Change
              </p>
              <div className="flex items-center gap-2">
                {analytics.change > 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                ) : analytics.change < 0 ? (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                ) : (
                  <Minus className="h-5 w-5 text-muted-foreground" />
                )}
                <p
                  className={`font-serif text-2xl tabular-nums tracking-tight ${
                    analytics.change > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : analytics.change < 0
                        ? "text-red-600 dark:text-red-400"
                        : ""
                  }`}
                >
                  {analytics.change > 0 ? "+" : ""}
                  {analytics.change}%
                </p>
              </div>
            </div>
          </div>

          {analytics.trend.length > 0 && analytics.trend.some((t) => t.sales > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={analytics.trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium mb-1">{label}</p>
                        <p className="tabular-nums">{formatCurrency(Number(payload[0].value))}</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="hsl(var(--primary))"
                  fill="url(#revenueGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-border/60">
              <p className="text-sm text-muted-foreground">No revenue data available</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
