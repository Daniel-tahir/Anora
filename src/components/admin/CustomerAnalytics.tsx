import { useCustomerAnalytics } from "@/lib/admin-analytics";
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
import { Users, UserPlus, Repeat } from "lucide-react";
import { memo } from "react";

const CustomerAreaChart = memo(function CustomerAreaChart({
  newCustomers,
  returningCustomers,
}: {
  newCustomers: number;
  returningCustomers: number;
}) {
  const chartData = [
    { name: "New", value: newCustomers },
    { name: "Returning", value: returningCustomers },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="newCustomersGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="returningCustomersGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" className="stroke-border/30" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
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
                <p className="font-medium text-foreground mb-1">{label}</p>
                <p className="tabular-nums font-medium">{Number(payload[0].value).toLocaleString()}</p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#newCustomersGrad)"
          dot={{ r: 5, fill: "#6366f1", strokeWidth: 0 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

export function CustomerAnalytics() {
  const { analytics, loading, error, refetch } = useCustomerAnalytics();

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Customers</h2>
        <p className="text-xs text-muted-foreground mt-1">New vs returning customer activity</p>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      )}

      {!loading && !error && analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border border-border/50 bg-card p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium leading-tight">
                  New Customers
                </p>
                <UserPlus className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {analytics.newCustomers.toLocaleString()}
              </p>
            </div>
            <div className="border border-border/50 bg-card p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium leading-tight">
                  Returning Customers
                </p>
                <Repeat className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {analytics.returningCustomers.toLocaleString()}
              </p>
            </div>
            <div className="border border-border/50 bg-card p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium leading-tight">
                  Total Active
                </p>
                <Users className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-0.5" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {(analytics.newCustomers + analytics.returningCustomers).toLocaleString()}
              </p>
            </div>
          </div>

          {analytics.newCustomers === 0 && analytics.returningCustomers === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center border border-border/40 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">No customer activity data available</p>
            </div>
          ) : (
            <CustomerAreaChart
              newCustomers={analytics.newCustomers}
              returningCustomers={analytics.returningCustomers}
            />
          )}
        </>
      )}
    </div>
  );
}
