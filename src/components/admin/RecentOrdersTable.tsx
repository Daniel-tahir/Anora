import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAdminOrders, type OrderRow } from "@/lib/admin-data";

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  refunded: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-300",
};

function StatusBadge({ status }: { status: string }) {
  const classes = STATUS_BADGES[status] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${classes}`}>
      {status}
    </span>
  );
}

function OrdersTableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function OrdersEmptyState() {
  return (
    <div className="border border-border/60 p-10 text-center">
      <p className="text-sm text-muted-foreground">No orders found</p>
    </div>
  );
}

function OrdersErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="border border-red/20 bg-red/5 p-6 text-center">
      <p className="text-sm text-red/80">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
        Retry
      </Button>
    </div>
  );
}

function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground pt-4">
      <span>
        {total} order{total !== 1 ? "s" : ""}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="text-xs">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export function RecentOrdersTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const pageSize = 10;

  const { result, loading, error, refetch } = useAdminOrders(
    page,
    pageSize,
    search,
    sortBy,
    sortDir,
  );

  function toggleSort(column: string) {
    if (sortBy === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: string }) {
    if (sortBy !== column) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-serif text-xl">Recent Orders</h3>
        <Input
          placeholder="Search orders…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-60 h-9 text-sm"
        />
      </div>

      {error && <OrdersErrorState message={error} onRetry={refetch} />}

      {loading && <OrdersTableSkeleton />}

      {!loading && !error && result && result.orders.length === 0 && <OrdersEmptyState />}

      {!loading && !error && result && result.orders.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("order_number")}>
                    Order
                    <SortIcon column="order_number" />
                  </TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("total")}>
                    Total
                    <SortIcon column="total" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                    Status
                    <SortIcon column="status" />
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                    Date
                    <SortIcon column="created_at" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.orders.map((order: OrderRow) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-xs">
                      {order.order_number ?? order.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {order.customer_email}
                    </TableCell>
                    <TableCell className="font-serif">
                      ${Number(order.total).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
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
          <Pagination page={page} total={result.total} pageSize={pageSize} onPage={setPage} />
        </>
      )}
    </div>
  );
}
