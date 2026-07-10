import { useState } from "react";
import {
  useAbandonedCarts,
  useAbandonedCartAnalytics,
  markCartRecovered,
  type AbandonedCartRow,
} from "@/lib/admin-security";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, TrendingUp, RefreshCw, DollarSign } from "lucide-react";

const STATUS_BADGES: Record<string, string> = {
  abandoned: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  recovered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  converted: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  expired: "bg-neutral-100 text-neutral-800 dark:bg-neutral-900/30 dark:text-neutral-300",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGES[status] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${cls}`}>
      {status}
    </span>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function AbandonedCartsTable() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const pageSize = 15;
  const { result, loading, error, refetch } = useAbandonedCarts(page, pageSize, status, search);
  const { data: analytics } = useAbandonedCartAnalytics();
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));

  const debouncedSearch = (() => {
    let timer: ReturnType<typeof setTimeout>;
    return (val: string) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setSearch(val);
        setPage(1);
      }, 300);
    };
  })();

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: string }) {
    if (sortBy !== column) return <span className="text-muted-foreground/40 ml-1">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const metricCards = analytics
    ? [
        {
          label: "Abandoned Carts",
          value: analytics.total_abandoned_carts.toLocaleString(),
          icon: <ShoppingCart className="h-4 w-4" />,
        },
        {
          label: "Lost Revenue",
          value: formatCurrency(analytics.lost_revenue),
          icon: <TrendingUp className="h-4 w-4" />,
        },
        {
          label: "Recovered Value",
          value: formatCurrency(analytics.recovered_revenue),
          icon: <RefreshCw className="h-4 w-4" />,
        },
        {
          label: "Recovery Rate",
          value: `${analytics.recovery_rate}%`,
          icon: <DollarSign className="h-4 w-4" />,
        },
        {
          label: "Avg Cart Value",
          value: formatCurrency(analytics.average_cart_value),
          icon: <ShoppingCart className="h-4 w-4" />,
        },
      ]
    : [];

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Abandoned Carts</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Track, recover, and analyze abandoned shopping carts.
        </p>
      </div>

      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          {metricCards.map((c) => (
            <DashboardCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Search by customer or session…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="max-w-sm h-9 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">All Statuses</option>
          <option value="abandoned">Abandoned</option>
          <option value="recovered">Recovered</option>
          <option value="converted">Converted</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {error && (
        <div className="border border-red/20 bg-red/5 p-6 text-center mb-6">
          <p className="text-sm text-red/80">{error}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Retry
          </Button>
        </div>
      )}

      {loading && !error && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {!loading && !error && result && result.carts.length === 0 && (
        <div className="border border-border/60 p-12 text-center">
          <p className="text-sm text-muted-foreground">No abandoned carts found.</p>
        </div>
      )}

      {!loading && !error && result && result.carts.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <Th onClick={() => toggleSort("user_name")}>
                    Customer
                    <SortIcon column="user_name" />
                  </Th>
                  <Th onClick={() => toggleSort("subtotal")}>
                    Value
                    <SortIcon column="subtotal" />
                  </Th>
                  <Th>Items</Th>
                  <Th onClick={() => toggleSort("status")}>
                    Status
                    <SortIcon column="status" />
                  </Th>
                  <Th onClick={() => toggleSort("created_at")}>
                    Created
                    <SortIcon column="created_at" />
                  </Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {result.carts.map((cart: AbandonedCartRow) => (
                  <tr key={cart.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{cart.customer_name || "Guest"}</td>
                    <td className="px-4 py-3 text-sm font-serif tabular-nums">
                      {formatCurrency(cart.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {cart.item_count} item{cart.item_count !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={cart.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(cart.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {cart.status === "abandoned" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await markCartRecovered(cart.id);
                            refetch();
                          }}
                        >
                          Mark Recovered
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
            <span>
              {result.total} cart{result.total !== 1 ? "s" : ""}
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
              <span className="text-xs">
                {page} of {totalPages}
              </span>
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
    </div>
  );
}

function Th({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium ${onClick ? "cursor-pointer hover:text-foreground" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </th>
  );
}
