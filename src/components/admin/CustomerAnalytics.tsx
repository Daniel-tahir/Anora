import { useCustomerAnalytics } from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Users, UserPlus, Repeat } from "lucide-react";

const COLORS = ["#6366f1", "#14b8a6"];

export function CustomerAnalytics() {
  const { analytics, loading, error, refetch } = useCustomerAnalytics();

  return (
    <div>
      <div className="mb-6">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Customers</h2>
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
          <Skeleton className="h-20 rounded-lg" />
        </div>
      )}

      {!loading && !error && analytics && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="border border-border/60 p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground">
                  New Customers
                </p>
                <UserPlus className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {analytics.newCustomers.toLocaleString()}
              </p>
            </div>
            <div className="border border-border/60 p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground">
                  Returning Customers
                </p>
                <Repeat className="h-4 w-4 text-teal-500" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {analytics.returningCustomers.toLocaleString()}
              </p>
            </div>
            <div className="border border-border/60 p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground">
                  Total Active
                </p>
                <Users className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="font-serif text-2xl tabular-nums tracking-tight">
                {(analytics.newCustomers + analytics.returningCustomers).toLocaleString()}
              </p>
            </div>
          </div>

          {analytics.newCustomers === 0 && analytics.returningCustomers === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-border/60">
              <p className="text-sm text-muted-foreground">No customer activity data available</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { name: "New Customers", value: analytics.newCustomers },
                  { name: "Returning Customers", value: analytics.returningCustomers },
                ]}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border/50"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  className="text-muted-foreground"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                        <p className="font-medium mb-1">{label}</p>
                        <p className="tabular-nums">{Number(payload[0].value).toLocaleString()}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  <Cell fill={COLORS[0]} />
                  <Cell fill={COLORS[1]} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </>
      )}
    </div>
  );
}
