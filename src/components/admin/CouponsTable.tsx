import { useState } from "react";
import {
  useCouponsManagement,
  useCouponAnalytics,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  type CouponRow,
} from "@/lib/admin-coupons";
import { DashboardCard } from "@/components/admin/DashboardCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tag,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  ArrowUpDown,
  Plus,
  Search,
} from "lucide-react";

const PAGE_SIZE = 10;

export function CouponsTable() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [deleting, setDeleting] = useState<CouponRow | null>(null);

  const { result, loading, error, refetch } = useCouponsManagement(
    page,
    PAGE_SIZE,
    search,
    sortBy,
    sortDir,
    statusFilter,
    typeFilter,
  );
  const { data: analytics, refetch: refetchAnalytics } = useCouponAnalytics();

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

  function statusLabel(c: CouponRow): { label: string; color: string } {
    if (!c.is_active) return { label: "Inactive", color: "text-stone-500 dark:text-stone-400" };
    if (c.expires_at && new Date(c.expires_at) <= new Date())
      return { label: "Expired", color: "text-red/60" };
    if (c.max_uses !== null && c.used_count >= c.max_uses)
      return { label: "Exhausted", color: "text-amber-600 dark:text-amber-400" };
    if (c.starts_at && new Date(c.starts_at) > new Date())
      return { label: "Scheduled", color: "text-blue-600 dark:text-blue-400" };
    return { label: "Active", color: "text-emerald-600 dark:text-emerald-400" };
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteCoupon(deleting.id);
      setDeleting(null);
      refetch();
      refetchAnalytics();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggle(couponId: string) {
    try {
      await toggleCouponStatus(couponId);
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
            label="Total Coupons"
            value={analytics.total_coupons.toLocaleString()}
            icon={<Tag className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
          />
          <DashboardCard
            label="Active"
            value={analytics.active_coupons.toLocaleString()}
            icon={<CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          />
          <DashboardCard
            label="Expired"
            value={analytics.expired_coupons.toLocaleString()}
            icon={<XCircle className="h-4 w-4 text-red/60" />}
          />
          <DashboardCard
            label="Redemptions"
            value={analytics.total_redemptions.toLocaleString()}
            icon={<Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />}
          />
          <DashboardCard
            label="Revenue Impact"
            value={`$${analytics.total_discounted.toLocaleString()}`}
            icon={<Tag className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by code or description..."
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
          <option value="exhausted">Exhausted</option>
        </select>
        <select
          className="border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Types</option>
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed</option>
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="border border-border/60 px-4 py-2 text-[11px] tracking-[0.32em] uppercase hover:bg-neutral/50 transition-colors flex items-center gap-2"
        >
          <Plus className="h-3 w-3" /> Add Coupon
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
              <Th onClick={() => toggleSort("discount_type")}>
                <SortIcon col="discount_type" /> Type
              </Th>
              <Th onClick={() => toggleSort("discount_value")}>
                <SortIcon col="discount_value" /> Value
              </Th>
              <Th>Status</Th>
              <Th onClick={() => toggleSort("used_count")}>
                <SortIcon col="used_count" /> Used
              </Th>
              <Th onClick={() => toggleSort("max_uses")}>
                <SortIcon col="max_uses" /> Limit
              </Th>
              <Th onClick={() => toggleSort("starts_at")}>
                <SortIcon col="starts_at" /> Start
              </Th>
              <Th onClick={() => toggleSort("expires_at")}>
                <SortIcon col="expires_at" /> Expiry
              </Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              !result &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-3 py-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  ))}
                </tr>
              ))}
            {result && result.coupons.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No coupons found.
                </td>
              </tr>
            )}
            {result &&
              result.coupons.map((c) => {
                const st = statusLabel(c);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border/40 hover:bg-neutral/20 transition-colors"
                  >
                    <td className="px-3 py-3 font-medium">{c.code}</td>
                    <td className="px-3 py-3 text-muted-foreground capitalize">
                      {c.discount_type}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {c.discount_type === "percentage"
                        ? `${c.discount_value}%`
                        : `$${c.discount_value}`}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] tracking-wider uppercase ${st.color}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{c.used_count}</td>
                    <td className="px-3 py-3 tabular-nums">{c.max_uses ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {c.starts_at ? new Date(c.starts_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditing(c)}
                          className="px-2 py-1 text-[11px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggle(c.id)}
                          className="px-2 py-1 text-[11px] tracking-wider uppercase text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {c.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => setDeleting(c)}
                          className="px-2 py-1 text-[11px] tracking-wider uppercase text-red/60 hover:text-red transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
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

      {/* Add/Edit Dialog */}
      {(showAdd || editing) && (
        <CouponFormDialog
          coupon={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditing(null);
            refetch();
            refetchAnalytics();
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Coupon</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete coupon <strong>{deleting?.code}</strong>? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red/80 hover:bg-red text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function CouponFormDialog({
  coupon,
  onClose,
  onSaved,
}: {
  coupon: CouponRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [description, setDescription] = useState(coupon?.description ?? "");
  const [discountType, setDiscountType] = useState(coupon?.discount_type ?? "percentage");
  const [discountValue, setDiscountValue] = useState(coupon?.discount_value?.toString() ?? "");
  const [minOrder, setMinOrder] = useState(coupon?.min_order?.toString() ?? "0");
  const [maxUses, setMaxUses] = useState(coupon?.max_uses?.toString() ?? "");
  const [maxDiscount, setMaxDiscount] = useState(coupon?.maximum_discount_amount?.toString() ?? "");
  const [startsAt, setStartsAt] = useState(coupon?.starts_at ? coupon.starts_at.slice(0, 16) : "");
  const [expiresAt, setExpiresAt] = useState(
    coupon?.expires_at ? coupon.expires_at.slice(0, 16) : "",
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function validate() {
    if (!code.trim()) return "Code is required";
    if (!discountValue || Number(discountValue) <= 0) return "Discount value must be positive";
    if (discountType === "percentage" && Number(discountValue) > 100)
      return "Percentage cannot exceed 100";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const params: Record<string, unknown> = {
        p_code: code.trim(),
        p_description: description || null,
        p_discount_type: discountType,
        p_discount_value: Number(discountValue),
        p_min_order: Number(minOrder),
        p_max_uses: maxUses ? Number(maxUses) : null,
        p_maximum_discount_amount: maxDiscount ? Number(maxDiscount) : null,
        p_starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        p_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      };
      if (coupon) {
        const result = await updateCoupon({ ...params, p_id: coupon.id } as {
          p_id: string;
          p_code?: string;
          p_description?: string;
          p_discount_type?: string;
          p_discount_value?: number;
          p_min_order?: number;
          p_max_uses?: number;
          p_maximum_discount_amount?: number;
          p_starts_at?: string;
          p_expires_at?: string;
        });
        if (!result.success) {
          setFormError(result.error ?? "Failed to update");
          setSaving(false);
          return;
        }
      } else {
        const result = await createCoupon(
          params as {
            p_code: string;
            p_description?: string;
            p_discount_type: string;
            p_discount_value: number;
            p_min_order?: number;
            p_max_uses?: number;
            p_maximum_discount_amount?: number;
            p_starts_at?: string;
            p_expires_at?: string;
          },
        );
        if (!result.success) {
          setFormError(result.error ?? "Failed to create");
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{coupon ? "Edit Coupon" : "Add Coupon"}</DialogTitle>
          <DialogDescription>
            {coupon ? "Update coupon details" : "Create a new discount coupon"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <p className="text-sm text-red/80 bg-red/5 p-3">{formError}</p>}

          <div>
            <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
              Code
            </label>
            <input
              required
              className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="SUMMER20"
            />
          </div>

          <div>
            <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
              Description
            </label>
            <input
              className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="20% off summer collection"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Discount Type
              </label>
              <select
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Value
              </label>
              <input
                required
                type="number"
                step="0.01"
                min="0.01"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder={discountType === "percentage" ? "20" : "10.00"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Min Order
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Max Discount ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Max Uses
              </label>
              <input
                type="number"
                min="1"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="flex items-end gap-1">
              <span className="text-[10px] text-muted-foreground pb-2">—</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Start Date
              </label>
              <input
                type="datetime-local"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-1.5">
                Expiry Date
              </label>
              <input
                type="datetime-local"
                className="w-full border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-foreground/30"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
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
              {saving ? "Saving..." : coupon ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
