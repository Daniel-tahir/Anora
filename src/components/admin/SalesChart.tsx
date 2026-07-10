import { useSalesAnalytics, type SalesDataPoint } from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useState } from "react";

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

function ChartContent({ data, period }: ChartContentProps) {
  const isEmpty = data.length === 0 || data.every((d) => d.orders === 0 && d.sales === 0);

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">No sales data for this period</p>
      </div>
    );
  }

  const dateKey = period === "yearly" ? "date" : "date";

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
        <XAxis
          dataKey={dateKey}
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
          tickFormatter={formatSalesValue}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="font-medium mb-1">{label}</p>
                {payload.map((entry) => (
                  <div key={entry.dataKey} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">
                      {entry.name === "sales" ? "Revenue" : "Orders"}:
                    </span>
                    <span className="font-medium tabular-nums">
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
          formatter={(value) => (
            <span className="text-xs text-muted-foreground">
              {value === "sales" ? "Revenue" : "Orders"}
            </span>
          )}
        />
        <Bar
          dataKey="sales"
          fill="hsl(var(--primary))"
          radius={[2, 2, 0, 0]}
          opacity={0.85}
          name="sales"
        />
        <Bar
          dataKey="orders"
          fill="hsl(var(--chart-2, 200 70% 50%))"
          radius={[2, 2, 0, 0]}
          opacity={0.5}
          name="orders"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SalesChart() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { data, loading, error, refetch } = useSalesAnalytics(period);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <p className="eyebrow">Analytics</p>
          <h2 className="font-serif text-2xl mt-1">Sales</h2>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase rounded-md transition-colors ${
                period === p.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
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

      {loading && !error && <Skeleton className="h-[320px] w-full rounded-lg" />}

      {!loading && !error && data && <ChartContent data={data} period={period} />}
    </div>
  );
}
