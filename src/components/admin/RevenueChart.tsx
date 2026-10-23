import { useRevenueAnalytics } from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { memo } from "react";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

const RevenueAreaChart = memo(function RevenueAreaChart({
  trend,
}: {
  trend: { date: string; sales: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" className="stroke-border/30" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          width={52}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-xs shadow-xl shadow-black/5">
                <p className="font-medium text-foreground mb-1">{label}</p>
                <p className="tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
                  {formatCurrency(Number(payload[0].value))}
                </p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="sales"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#revenueGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: "#10b981" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

export function RevenueChart() {
  const { analytics, loading, error, refetch } = useRevenueAnalytics();

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Revenue Trend</h2>
        <p className="text-xs text-muted-foreground mt-1">Period-over-period revenue comparison</p>
      </div>

      {error && (
        <div className="border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-8 text-center rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
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
            <div className="border border-border/50 bg-card p-5">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium mb-2">
                Current Period
              </p>
              <p className="font-serif text-2xl tabular-nums tracking-tight text-foreground">
                {formatCurrency(analytics.current)}
              </p>
            </div>
            <div className="border border-border/50 bg-card p-5">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium mb-2">
                Previous Period
              </p>
              <p className="font-serif text-2xl tabular-nums tracking-tight text-muted-foreground">
                {formatCurrency(analytics.previous)}
              </p>
            </div>
            <div className="border border-border/50 bg-card p-5">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium mb-2">
                Change
              </p>
              <div className="flex items-center gap-2">
                {analytics.change > 0 ? (
                  <TrendingUp className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : analytics.change < 0 ? (
                  <TrendingDown className="h-5 w-5 text-red-500 shrink-0" />
                ) : (
                  <Minus className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
                <p
                  className={`font-serif text-2xl tabular-nums tracking-tight ${
                    analytics.change > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : analytics.change < 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {analytics.change > 0 ? "+" : ""}
                  {analytics.change}%
                </p>
              </div>
            </div>
          </div>

          {analytics.trend.length > 0 && analytics.trend.some((t) => t.sales > 0) ? (
            <RevenueAreaChart trend={analytics.trend} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-border/40 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">No revenue data available</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
