import { useState } from "react";
import { useActivityTimeline, type ActivityEntry } from "@/lib/admin-security";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User, Tag, ChevronRight } from "lucide-react";

function formatTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const ENTITY_TYPES = [
  { label: "All", value: "" },
  { label: "Products", value: "products" },
  { label: "Orders", value: "orders" },
  { label: "Coupons", value: "coupons" },
  { label: "Categories", value: "categories" },
  { label: "Reviews", value: "reviews" },
  { label: "Refunds", value: "refunds" },
  { label: "Gift Cards", value: "gift_cards" },
];

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

export function ActivityTimeline() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const pageSize = 30;
  const { result, loading, error, refetch } = useActivityTimeline(
    page,
    pageSize,
    entityType,
    "",
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

  return (
    <div>
      <div className="mb-10">
        <p className="eyebrow">Admin</p>
        <h1 className="font-serif text-4xl mt-2">Activity Timeline</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Real-time activity log across all entities.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Input
          placeholder="Search activities…"
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
          {ENTITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
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
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 p-4 border border-border/40">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && result && result.activities.length === 0 && (
        <div className="border border-border/60 p-12 text-center">
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </div>
      )}

      {!loading && !error && result && result.activities.length > 0 && (
        <>
          <div className="space-y-2">
            {result.activities.map((entry: ActivityEntry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 p-4 border border-border/40 hover:bg-muted/20 transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                  {entry.actor_avatar ? (
                    <img
                      src={entry.actor_avatar}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{entry.actor_name || "System"}</span>
                    <ActionBadge action={entry.action} />
                    <span className="text-sm text-muted-foreground capitalize">
                      {entry.entity_type?.replace(/_/g, " ")}
                    </span>
                    {entry.entity_id && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        #{entry.entity_id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  {entry.metadata && entry.action === "order_status_changed" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Status changed: {(entry.metadata as any).from_status} →{" "}
                      {(entry.metadata as any).to_status}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatTime(entry.created_at)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-6 text-sm text-muted-foreground">
            <span>
              {result.total} activity event{result.total !== 1 ? "s" : ""}
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
