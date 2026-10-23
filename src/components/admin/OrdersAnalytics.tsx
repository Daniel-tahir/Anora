import {
  useOrdersByStatus,
  useOrdersByCategory,
  type OrdersByStatusItem,
  type OrdersByCategoryItem,
} from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { memo } from "react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  confirmed: "#3b82f6",
  processing: "#8b5cf6",
  shipped: "#06b6d4",
  delivered: "#10b981",
  returned: "#f97316",
  cancelled: "#ef4444",
  refunded: "#6b7280",
};

const CATEGORY_COLORS = [
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#e11d48",
  "#0ea5e9",
  "#a855f7",
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center border border-border/40 bg-muted/20 rounded-lg">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-6 text-center rounded-lg">
      <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      <button
        onClick={onRetry}
        className="mt-3 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[260px] w-full rounded-lg" />;
}

const OrdersByStatusChartContent = memo(function OrdersByStatusChartContent({
  data,
}: {
  data: OrdersByStatusItem[];
}) {
  const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

  if (isEmpty) return <EmptyState message="No orders found" />;

  const chartData = data.map((d) => ({
    ...d,
    fill: STATUS_COLORS[d.status] || "#6b7280",
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" className="stroke-border/30" vertical={false} />
        <XAxis
          dataKey="status"
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted-foreground [&_.recharts-text]:capitalize"
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
                <p className="capitalize font-medium text-foreground mb-1">{label}</p>
                <p className="tabular-nums font-medium">
                  {Number(payload[0].value).toLocaleString()} orders
                </p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#6366f1"
          strokeWidth={2}
          dot={(props) => {
            const { cx, cy, payload } = props;
            return (
              <circle
                key={payload.status}
                cx={cx}
                cy={cy}
                r={4}
                fill={STATUS_COLORS[payload.status] || "#6366f1"}
                stroke="none"
              />
            );
          }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

const OrdersByCategoryChartContent = memo(function OrdersByCategoryChartContent({
  data,
}: {
  data: OrdersByCategoryItem[];
}) {
  const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

  if (isEmpty) return <EmptyState message="No category data available" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="category"
          cx="50%"
          cy="50%"
          outerRadius={95}
          innerRadius={52}
          paddingAngle={2}
          strokeWidth={0}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const entry = payload[0];
            return (
              <div className="rounded-lg border border-border/60 bg-background px-3.5 py-2.5 text-xs shadow-xl shadow-black/5">
                <p className="font-medium text-foreground mb-1">{entry.name}</p>
                <p className="tabular-nums font-medium">
                  {Number(entry.value).toLocaleString()} orders
                </p>
              </div>
            );
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-[11px] text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
});

export function OrdersAnalytics() {
  const {
    data: statusData,
    loading: statusLoading,
    error: statusError,
    refetch: statusRefetch,
  } = useOrdersByStatus();

  const {
    data: categoryData,
    loading: categoryLoading,
    error: categoryError,
    refetch: categoryRefetch,
  } = useOrdersByCategory();

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Orders Breakdown</h2>
        <p className="text-xs text-muted-foreground mt-1">Status distribution and category breakdown</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border/50 bg-card p-5 sm:p-6">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium mb-5">
            By Status
          </p>
          {statusError && <ErrorState error={statusError} onRetry={statusRefetch} />}
          {statusLoading && !statusError && <ChartSkeleton />}
          {!statusLoading && !statusError && statusData && (
            <OrdersByStatusChartContent data={statusData} />
          )}
        </div>

        <div className="border border-border/50 bg-card p-5 sm:p-6">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground font-medium mb-5">
            By Category
          </p>
          {categoryError && <ErrorState error={categoryError} onRetry={categoryRefetch} />}
          {categoryLoading && !categoryError && <ChartSkeleton />}
          {!categoryLoading && !categoryError && categoryData && (
            <OrdersByCategoryChartContent data={categoryData} />
          )}
        </div>
      </div>
    </div>
  );
}
