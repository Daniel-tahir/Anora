import {
  useOrdersByStatus,
  useOrdersByCategory,
  type OrdersByStatusItem,
  type OrdersByCategoryItem,
} from "@/lib/admin-analytics";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
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
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="border border-red/20 bg-red/5 p-6 text-center">
      <p className="text-sm text-red/80">{error}</p>
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

function OrdersByStatusChartContent({ data }: { data: OrdersByStatusItem[] }) {
  const isEmpty = data.length === 0 || data.every((d) => d.count === 0);

  if (isEmpty) return <EmptyState message="No orders found" />;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="status"
          tick={{ fontSize: 11 }}
          className="text-muted-foreground [&_.recharts-text]:capitalize"
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="capitalize font-medium mb-1">{label}</p>
                <p className="tabular-nums">{Number(payload[0].value).toLocaleString()} orders</p>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[0, 2, 2, 0]}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#6b7280"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function OrdersByCategoryChartContent({ data }: { data: OrdersByCategoryItem[] }) {
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
          outerRadius={90}
          innerRadius={50}
          paddingAngle={2}
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
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="font-medium mb-1">{entry.name}</p>
                <p className="tabular-nums">{Number(entry.value).toLocaleString()} orders</p>
              </div>
            );
          }}
        />
        <Legend
          formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

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
      <div className="mb-6">
        <p className="eyebrow">Analytics</p>
        <h2 className="font-serif text-2xl mt-1">Orders</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="border border-border/60 p-4 sm:p-6">
          <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
            By Status
          </p>
          {statusError && <ErrorState error={statusError} onRetry={statusRefetch} />}
          {statusLoading && !statusError && <ChartSkeleton />}
          {!statusLoading && !statusError && statusData && (
            <OrdersByStatusChartContent data={statusData} />
          )}
        </div>

        <div className="border border-border/60 p-4 sm:p-6">
          <p className="text-[10px] sm:text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-4">
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
