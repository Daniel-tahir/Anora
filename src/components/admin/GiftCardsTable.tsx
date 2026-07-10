import { useState } from "react";
import {
  useGiftCardsManagement,
  useGiftCardDetails,
  useGiftCardAnalytics,
  createGiftCard,
  toggleGiftCardStatus,
  type GiftCardRow,
  type GiftCardTransaction,
} from "@/lib/admin-gift-cards";
import { DashboardCard } from "@/components/admin/DashboardCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Gift, CreditCard, RefreshCw, ArrowUpDown, Plus, Search, Eye } from "lucide-react";

const PAGE_SIZE = 10;

export function GiftCardsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const { result, loading, error, refetch } = useGiftCardsManagement(
    page,
    PAGE_SIZE,
    search,
    sortBy,
    sortDir,
    statusFilter,
  );
  const { data: analytics, refetch: refetchAnalytics } = useGiftCardAnalytics();

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 0;

  function toggleSort(col: string) {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return <ArrowUpDown className={`h-3 w-3 ${sortDir === "asc" ? "rotate-180" : ""}`} />;
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      active: "text-emerald-600 dark:text-emerald-400",
      inactive: "text-stone-500 dark:text-stone-400",
      expired: "text-red/60",
      depleted: "text-amber-600 dark:text-amber-400",
    };
    return (
      <span
        className={`text-[11px] tracking-wider uppercase ${colors[status] ?? "text-muted-foreground"}`}
      >
        {status}
      </span>
    );
  }

  async function handleToggle(cardId: string) {
    try {
      await toggleGiftCardStatus(cardId);
      refetch();
      refetchAnalytics();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-8">
      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <DashboardCard
            label="Total"
            value={analytics.total_gift_cards.toLocaleString()}
            icon={<Gift className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          />
          <DashboardCard
            label="Active"
            value={analytics.active_gift_cards.toLocaleString()}
            icon={<CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          />
          <DashboardCard
            label="Outstanding Balance"
            value={`$${analytics.outstanding_balance.toLocaleString()}`}
            icon={<CreditCard className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          />
          <DashboardCard
            label="Total Redeemed"
            value={`$${analytics.total_redeemed.toLocaleString()}`}
            icon={<CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          />
          <DashboardCard
            label="Transactions"
            value={analytics.total_transactions.toLocaleString()}
            icon={<RefreshCw className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by code..."
            className="w-full border border-border/60 bg-transparent py-2 pl-10 pr-4 text-sm outline-none focus:border-foreground/30 transition-colors"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
          <option value="depleted">Depleted</option>
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="border border-border/60 px-4 py-2 text-[11px] tracking-[0.32em] uppercase hover:bg-neutral/50 transition-colors flex items-center gap-2"
        >
          <Plus className="h-3 w-3" /> Add Gift Card
        </button>
        <button
          onClick={() => {
            refetch();
            refetchAnalytics();
          }}
          className="border border-border/60 p-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Error */}
      {error && !loading && (
        <div className="border border-red/20 bg-red/5 p-4 text-sm text-red/80">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-neutral/30">
              <Th onClick={() => toggleSort("code")}>
                <SortIcon col="code" /> Code
              </Th>
              <Th onClick={() => toggleSort("initial_balance")}>
                <SortIcon col="initial_balance" /> Initial
              </Th>
              <Th onClick={() => toggleSort("current_balance")}>
                <SortIcon col="current_balance" /> Current
              </Th>
              <Th onClick={() => toggleSort("status")}>
                <SortIcon col="status" /> Status
              </Th>
              <Th>Usage</Th>
              <Th onClick={() => toggleSort("expires_at")}>
                <SortIcon col="expires_at" /> Expires
              </Th>
              <Th onClick={() => toggleSort("created_at")}>
                <SortIcon col="created_at" /> Created
              </Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              !result &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  ))}
                </tr>
              ))}
            {result && result.gift_cards.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No gift cards found.
                </td>
              </tr>
            )}
            {result &&
              result.gift_cards.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-border/40 hover:bg-neutral/20 transition-colors"
                >
                  <td className="px-3 py-3 font-mono text-xs">{g.code}</td>
                  <td className="px-3 py-3 tabular-nums">${g.initial_balance.toFixed(2)}</td>
                  <td className="px-3 py-3 tabular-nums">${g.current_balance.toFixed(2)}</td>
                  <td className="px-3 py-3">{statusBadge(g.status)}</td>
                  <td className="px-3 py-3 tabular-nums">{g.usage_count}</td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {g.expires_at ? new Date(g.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewing(g.id)}
                        className="px-2 py-1 text-[11px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5 inline mr-1" /> View
                      </button>
                      <button
                        onClick={() => handleToggle(g.id)}
                        className="px-2 py-1 text-[11px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {g.status === "active"
                          ? "Deactivate"
                          : g.status === "inactive"
                            ? "Activate"
                            : "—"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {result && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[11px] tracking-[0.2em] text-muted-foreground">{result.total} total</p>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="border border-border/60 px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase disabled:opacity-30 disabled:pointer-events-none hover:bg-neutral/50 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, totalPages - 4));
              return i + start;
            }).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`border border-border/60 px-3 py-1.5 text-[11px] tracking-[0.2em] transition-colors ${p === page ? "bg-foreground text-background" : "hover:bg-neutral/50"}`}
              >
                {p}
              </button>
            ))}
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="border border-border/60 px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase disabled:opacity-30 disabled:pointer-events-none hover:bg-neutral/50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add Dialog */}
      {showAdd && (
        <GiftCardFormDialog
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refetch();
            refetchAnalytics();
          }}
        />
      )}

      {/* View Details Drawer */}
      {viewing && <GiftCardDetailsDrawer giftCardId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Th({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-3 py-3 text-[11px] tracking-[0.32em] uppercase text-left ${className ?? ""} ${onClick ? "cursor-pointer hover:text-foreground" : ""}`}
    >
      <div className="flex items-center gap-1.5">{children}</div>
    </th>
  );
}

function GiftCardFormDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [balance, setBalance] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!balance || Number(balance) <= 0) {
      setFormError("Balance must be positive");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await createGiftCard({
        p_initial_balance: Number(balance),
        p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        p_notes: notes || undefined,
      });
      if (!res.success) {
        setFormError(res.error ?? "Failed to create");
        setSaving(false);
        return;
      }
      setResult({ code: res.code ?? "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred");
      setSaving(false);
    }
  }

  if (result) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gift Card Created</DialogTitle>
            <DialogDescription>Share this code with the recipient.</DialogDescription>
          </DialogHeader>
          <div className="text-center py-6 space-y-4">
            <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground">
              Gift Card Code
            </p>
            <p className="font-mono text-2xl tracking-[0.3em]">{result.code}</p>
            <p className="text-xs text-muted-foreground">This code will not be shown again.</p>
            <button
              onClick={onClose}
              className="border border-border/60 px-6 py-2 text-[11px] tracking-[0.32em] uppercase hover:bg-neutral/50 transition-colors"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Gift Card</DialogTitle>
          <DialogDescription>Generate a new gift card with a unique code.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <p className="text-sm text-red/80 bg-red/5 p-3">{formError}</p>}
          <div>
            <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
              Initial Balance ($)
            </label>
            <input
              required
              type="number"
              step="0.01"
              min="1"
              className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="50.00"
            />
          </div>
          <div>
            <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
              Expires At (optional)
            </label>
            <input
              type="datetime-local"
              className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
              Notes (optional)
            </label>
            <input
              className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-border/60 px-4 py-2 text-[11px] tracking-[0.32em] uppercase hover:bg-neutral/50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="border border-foreground bg-foreground text-background px-4 py-2 text-[11px] tracking-[0.32em] uppercase hover:opacity-80 transition-colors disabled:opacity-40"
            >
              {saving ? "Generating..." : "Generate"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GiftCardDetailsDrawer({
  giftCardId,
  onClose,
}: {
  giftCardId: string;
  onClose: () => void;
}) {
  const { details, loading, error } = useGiftCardDetails(giftCardId);

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Gift Card Details</SheetTitle>
          <SheetDescription>Balance history and transaction log.</SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {error && (
          <div className="border border-red/20 bg-red/5 p-4 mt-6 text-sm text-red/80">{error}</div>
        )}

        {details && (
          <div className="mt-6 space-y-6">
            {/* Summary */}
            <div className="border border-border/60 p-4 space-y-3">
              <p className="font-mono text-lg tracking-[0.2em]">{details.code}</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">
                    Initial Balance
                  </p>
                  <p className="tabular-nums mt-1">${details.initial_balance.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">
                    Current Balance
                  </p>
                  <p className="tabular-nums mt-1 font-medium">
                    ${details.current_balance.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">
                    Status
                  </p>
                  <p className="mt-1 capitalize">{details.status}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.32em] uppercase text-muted-foreground">
                    Usage Count
                  </p>
                  <p className="tabular-nums mt-1">{details.usage_count}</p>
                </div>
              </div>
            </div>

            {/* Balance Progress */}
            <div className="space-y-2">
              <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground">
                Balance Used
              </p>
              <div className="h-2 bg-neutral/40 rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground/60 rounded-full transition-all"
                  style={{
                    width: `${
                      details.initial_balance > 0
                        ? ((details.initial_balance - details.current_balance) /
                            details.initial_balance) *
                          100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>${(details.initial_balance - details.current_balance).toFixed(2)} used</span>
                <span>${details.current_balance.toFixed(2)} remaining</span>
              </div>
            </div>

            {/* Transactions */}
            <div>
              <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
                Transaction History
              </p>
              {details.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <div className="space-y-2">
                  {details.transactions.map((t: GiftCardTransaction) => (
                    <div
                      key={t.id}
                      className="border border-border/40 p-3 text-sm flex items-center justify-between"
                    >
                      <div>
                        <p className="text-[11px] tracking-wider uppercase text-muted-foreground">
                          {t.transaction_type}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(t.created_at).toLocaleString()}
                        </p>
                        {t.notes && <p className="text-xs text-muted-foreground mt-1">{t.notes}</p>}
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums font-medium">-${t.amount.toFixed(2)}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          ${t.balance_before.toFixed(2)} → ${t.balance_after.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
