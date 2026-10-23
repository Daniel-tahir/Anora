import { useSalesAnalytics, type SalesDataPoint } from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ComposedChart,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { memo, useState } from "react";

type Period = "daily" | "weekly" | "monthly" | "yearly";

const PERIODS: { key: Period; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

function formatSalesValue(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

interface ChartContentProps {
  data: SalesDataPoint[];
  period: Period;
}

const ChartContent = memo(function ChartContent({ data }: ChartContentProps) {
  const isEmpty = data.length === 0 || data.every((d) => d.orders === 0 && d.sales === 0);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border border-border/40 bg-muted/20">
        <p className="text-sm text-muted-foreground">No sales data for this period</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
          yAxisId="revenue"
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatSalesValue}
          width={52}
        />
        <YAxis
          yAxisId="orders"
          orientation="right"
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-xs shadow-xl shadow-black/5">
                <p className="font-medium text-foreground mb-2">{label}</p>
                {payload.map((entry) => (
                  <div key={entry.dataKey} className="flex items-center gap-2 mb-1 last:mb-0">
                    <div
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">
                      {entry.dataKey === "sales" ? "Revenue" : "Orders"}:
                    </span>
                    <span className="font-medium tabular-nums ml-auto pl-4">
                      {entry.dataKey === "sales"
                        ? `$${Number(entry.value).toLocaleString()}`
                        : Number(entry.value).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span className="text-[11px] text-muted-foreground">
              {value === "sales" ? "Revenue" : "Orders"}
            </span>
          )}
        />
        <Area
          yAxisId="revenue"
          type="monotone"
          dataKey="sales"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#salesAreaGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          name="sales"
        />
        <Line
          yAxisId="orders"
          type="monotone"
          dataKey="orders"
          stroke="#6366f1"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          strokeDasharray="0"
          name="orders"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

export function SalesChart() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { data, loading, error, refetch } = useSalesAnalytics(period);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 className="font-serif text-2xl mt-1">Sales Overview</h2>
          <p className="text-xs text-muted-foreground mt-1">Revenue and order volume over time</p>
        </div>
        <div className="flex gap-1 rounded-md border border-border/60 bg-muted/40 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase rounded transition-all duration-150 ${
                period === p.key
                  ? "bg-background text-foreground shadow-sm border border-border/40"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
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

      {loading && !error && <Skeleton className="h-[320px] w-full rounded-lg" />}

      {!loading && !error && data && <ChartContent data={data} period={period} />}
    </div>
  );
}
