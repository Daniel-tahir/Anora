import { useState } from "react";
import { useAuditLogs, type AuditLogEntry } from "@/lib/admin-security";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, User, Globe, Monitor } from "lucide-react";

const ACTION_BADGES: Record<string, string> = {
  created: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  order_status_changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

function ActionBadge({ action }: { action: string }) {
  const cls = ACTION_BADGES[action] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.15em] uppercase ${cls}`}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const pageSize = 20;
  const { result, loading, error, refetch } = useAuditLogs(
    page,
    pageSize,
    entityType,
    action,
    search,
  );
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

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Audit Logs</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Immutable audit trail of all critical actions. Records cannot be edited or deleted.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Search entity, action, or ID…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            debouncedSearch(e.target.value);
          }}
          className="max-w-sm h-9 text-sm"
        />
        <select
          value={entityType}
          onChange={(e) => {
            setEntityType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">All Entity Types</option>
          <option value="products">Products</option>
          <option value="orders">Orders</option>
          <option value="coupons">Coupons</option>
          <option value="categories">Categories</option>
          <option value="reviews">Reviews</option>
          <option value="refunds">Refunds</option>
          <option value="gift_cards">Gift Cards</option>
        </select>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">All Actions</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
          <option value="order_status_changed">Status Changed</option>
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

      {!loading && !error && result && result.logs.length === 0 && (
        <div className="border border-border/60 p-12 text-center">
          <p className="text-sm text-muted-foreground">No audit logs found.</p>
        </div>
      )}

      {!loading && !error && result && result.logs.length > 0 && (
        <>
          <div className="border border-border/60 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <Th onClick={() => toggleSort("action")}>
                    Action
                    <SortIcon column="action" />
                  </Th>
                  <Th onClick={() => toggleSort("entity_type")}>
                    Entity
                    <SortIcon column="entity_type" />
                  </Th>
                  <Th>Entity ID</Th>
                  <Th onClick={() => toggleSort("actor_name")}>
                    Actor
                    <SortIcon column="actor_name" />
                  </Th>
                  <Th>IP / Device</Th>
                  <Th onClick={() => toggleSort("created_at")}>
                    Timestamp
                    <SortIcon column="created_at" />
                  </Th>
                </tr>
              </thead>
              <tbody>
                {result.logs.map((log: AuditLogEntry) => (
                  <tr key={log.id} className="border-b border-border/40 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">
                      {log.entity_type?.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {log.entity_id ? log.entity_id.slice(0, 12) + "…" : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-muted-foreground" />
                        {log.actor_name || "System"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.ip_address || log.user_agent ? (
                        <span className="flex items-center gap-1">
                          {log.ip_address && (
                            <>
                              <Globe className="h-3 w-3" />
                              {log.ip_address}
                            </>
                          )}
                          {log.user_agent && (
                            <>
                              <Monitor className="h-3 w-3 ml-1" />
                              {log.user_agent.slice(0, 30)}…
                            </>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(log.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
            <span>
              {result.total} log{result.total !== 1 ? "s" : ""}
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
