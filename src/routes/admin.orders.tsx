import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { OrderDetailsDrawer } from "@/components/admin/OrderDetailsDrawer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  CheckCircle,
  XCircle,
  RotateCcw,
  ArrowRightLeft,
  DollarSign,
} from "lucide-react";
import { useOrderMetrics, useOrdersManagement, type OrderManagementRow } from "@/lib/admin-orders";

export const Route = createFileRoute("/admin/orders")({
  head: () => ({
    meta: [{ title: "Orders Management — ANORA" }],
  }),
  component: OrdersPage,
});

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  packed: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  out_for_delivery: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  returned: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  refunded: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
};

const PAYMENT_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  const classes = map[status] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${classes}`}>
      {status}
    </span>
  );
}

const ORDER_STATUSES = [
  "",
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
];
const PAYMENT_STATUSES = ["", "pending", "completed", "failed", "refunded"];
const DATE_PRESETS = [
  { label: "All", value: "" },
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7days" },
  { label: "30 Days", value: "30days" },
  { label: "90 Days", value: "90days" },
];

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  if (preset === "today") return { from: to, to };
  if (preset === "7days") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().split("T")[0], to };
  }
  if (preset === "30days") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return { from: d.toISOString().split("T")[0], to };
  }
  if (preset === "90days") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return { from: d.toISOString().split("T")[0], to };
  }
  return { from: "", to: "" };
}

const SORTABLE_COLUMNS = new Set([
  "created_at",
  "total",
  "status",
  "payment_status",
  "customer_name",
]);

function OrdersPage() {
  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useOrderMetrics();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [datePreset, setDatePreset] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageSize = 15;

  const dateRange =
    datePreset === "custom" ? { from: customFrom, to: customTo } : getDateRange(datePreset);

  const {
    result,
    loading: ordersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useOrdersManagement(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
    statusFilter,
    paymentFilter,
    dateRange.from,
    dateRange.to,
  );

  const debouncedSearch = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          setSearch(val);
          setPage(1);
        }, 300);
      };
    })(),
    [],
  );

  function toggleSort(column: string) {
    if (!SORTABLE_COLUMNS.has(column)) return;
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: string }) {
    if (!SORTABLE_COLUMNS.has(column)) return null;
    if (sortBy !== column) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function handleDatePreset(preset: string) {
    setDatePreset(preset);
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  }

  function openDrawer(orderId: string) {
    setSelectedOrderId(orderId);
    setDrawerOpen(true);
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  return (
    <AdminLayout>
      <div>
        <div className="mb-10">
          <p className="eyebrow">Admin</p>
          <h1 className="font-serif text-4xl mt-2">Orders</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-lg">
            Manage orders, process returns, and handle refunds.
          </p>
        </div>

        {/* Metrics */}
        {metricsError && (
          <div className="border border-red/20 bg-red/5 p-6 text-center mb-8">
            <p className="text-sm text-red/80">{metricsError}</p>
            <Button variant="outline" size="sm" onClick={refetchMetrics} className="mt-3">
              Retry
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-10">
          {metricsLoading ? (
            Array.from({ length: 7 }).map((_, i) => <DashboardCard key={i} label="—" loading />)
          ) : metrics ? (
            <>
              <DashboardCard label="Total Orders" value={metrics.totalOrders.toLocaleString()} />
              <DashboardCard
                label="Pending"
                value={metrics.pendingOrders.toLocaleString()}
                icon={<Clock className="h-4 w-4 text-amber-500" />}
              />
              <DashboardCard
                label="Processing"
                value={metrics.processingOrders.toLocaleString()}
                icon={<ArrowRightLeft className="h-4 w-4 text-purple-500" />}
              />
              <DashboardCard
                label="Delivered"
                value={metrics.deliveredOrders.toLocaleString()}
                icon={<CheckCircle className="h-4 w-4 text-emerald-500" />}
              />
              <DashboardCard
                label="Cancelled"
                value={metrics.cancelledOrders.toLocaleString()}
                icon={<XCircle className="h-4 w-4 text-red-500" />}
              />
              <DashboardCard
                label="Returned"
                value={metrics.returnedOrders.toLocaleString()}
                icon={<RotateCcw className="h-4 w-4 text-orange-500" />}
              />
              <DashboardCard
                label="Refunded"
                value={metrics.refundedOrders.toLocaleString()}
                icon={<DollarSign className="h-4 w-4 text-stone-500" />}
              />
            </>
          ) : null}
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 mb-8 p-4 border border-border/40 bg-muted/20 rounded-lg">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by order ID, customer name, email…"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                debouncedSearch(e.target.value);
              }}
              className="h-9 text-sm flex-1 max-w-sm"
            />

            <div className="flex gap-2 flex-wrap shrink-0">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
              >
                <option value="">All Statuses</option>
                {ORDER_STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
              >
                <option value="">All Payments</option>
                {PAYMENT_STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleDatePreset(p.value)}
                className={`px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase rounded-md transition-colors ${
                  datePreset === p.value
                    ? "bg-foreground text-background"
                    : "border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setDatePreset("custom")}
              className={`px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase rounded-md transition-colors ${
                datePreset === "custom"
                  ? "bg-foreground text-background"
                  : "border border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              }`}
            >
              Custom
            </button>
            {datePreset === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {ordersError && (
          <div className="border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-6 text-center mb-6 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">{ordersError}</p>
            <Button variant="outline" size="sm" onClick={refetchOrders} className="mt-3">
              Retry
            </Button>
          </div>
        )}

        {/* Loading */}
        {ordersLoading && !ordersError && (
          <div className="space-y-2">
            <Skeleton className="h-11 w-full rounded-lg" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!ordersLoading && !ordersError && result && result.orders.length === 0 && (
          <div className="border border-border/40 bg-muted/20 p-14 text-center rounded-lg">
            <p className="text-sm text-muted-foreground">
              {search || statusFilter || paymentFilter || datePreset
                ? "No orders match your filters"
                : "No orders found"}
            </p>
          </div>
        )}

        {/* Table */}
        {!ordersLoading && !ordersError && result && result.orders.length > 0 && (
          <>
            <div className="border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => toggleSort("customer_name")}
                    >
                      Customer
                      <SortIcon column="customer_name" />
                    </TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead
                      className="cursor-pointer text-right"
                      onClick={() => toggleSort("total")}
                    >
                      Total
                      <SortIcon column="total" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => toggleSort("payment_status")}
                    >
                      Payment
                      <SortIcon column="payment_status" />
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                      Status
                      <SortIcon column="status" />
                    </TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                      Date
                      <SortIcon column="created_at" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.orders.map((order: OrderManagementRow) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => openDrawer(order.id)}
                    >
                      <TableCell className="font-medium">{order.customer_name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {order.customer_email}
                      </TableCell>
                      <TableCell className="font-serif text-right tabular-nums">
                        ${Number(order.total).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.payment_status} map={PAYMENT_BADGES} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} map={STATUS_BADGES} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                        {order.item_count}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(order.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
              <span>
                {result.total} order{result.total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 text-xs rounded-md ${
                        p === page
                          ? "bg-foreground text-background"
                          : "border border-border/60 text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}

        <OrderDetailsDrawer
          orderId={selectedOrderId}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedOrderId(null);
          }}
          onUpdated={() => {
            refetchOrders();
            refetchMetrics();
          }}
        />
      </div>
    </AdminLayout>
  );
}
