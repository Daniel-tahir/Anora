import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  useOrderDetails,
  updateOrderStatus,
  processReturn,
  processRefund,
  type OrderDetails,
} from "@/lib/admin-orders";
import { X, Check, AlertTriangle } from "lucide-react";

interface Props {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  processing: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
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

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  const classes = map[value] ?? "bg-neutral-100 text-muted-foreground";
  return (
    <span className={`inline-block px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase ${classes}`}>
      {value}
    </span>
  );
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right ml-4">{value || "—"}</span>
    </div>
  );
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["returned"],
  cancelled: ["refunded"],
  returned: ["refunded"],
};

function StatusManager({
  currentStatus,
  orderId,
  onUpdated,
}: {
  currentStatus: string;
  orderId: string;
  onUpdated: () => void;
}) {
  const [nextStatus, setNextStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transitions = STATUS_TRANSITIONS[currentStatus] ?? [];

  async function handleConfirm() {
    if (!nextStatus) return;
    setUpdating(true);
    setError(null);
    try {
      const result = await updateOrderStatus(orderId, nextStatus);
      if (!result.success) {
        setError(result.error ?? "Failed to update status");
        return;
      }
      onUpdated();
      setConfirming(false);
      setNextStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div>
      <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-2">
        Update Status
      </p>
      <div className="flex flex-wrap gap-2">
        {transitions.map((s) => (
          <button
            key={s}
            onClick={() => {
              setNextStatus(s);
              setConfirming(true);
            }}
            className={`px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase rounded border transition-colors ${
              s === "cancelled"
                ? "border-red/30 text-red/70 hover:border-red/60 hover:text-red"
                : "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red/80 mt-2">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Order Status</AlertDialogTitle>
            <AlertDialogDescription>
              Change order status from <strong>{currentStatus}</strong> to{" "}
              <strong>{nextStatus}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={updating}>
              {updating ? "Updating..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReturnManager({ details, onUpdated }: { details: OrderDetails; onUpdated: () => void }) {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  const pendingReturns = details.return_requests.filter((r) => r.status === "requested");

  async function handleProcess(returnId: string) {
    if (!action) return;
    try {
      const status = action === "approve" ? "approved" : "rejected";
      const result = await processReturn(returnId, status);
      if (result.success) onUpdated();
    } catch {
      /* ignored */
    } finally {
      setProcessingId(null);
      setAction(null);
    }
  }

  if (details.return_requests.length === 0 && pendingReturns.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">Returns</p>
      {details.return_requests.map((r) => (
        <div key={r.id} className="border border-border/60 p-3 mb-2 text-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <Badge
              value={r.status}
              map={{
                requested: "bg-amber-100 text-amber-800",
                approved: "bg-emerald-100 text-emerald-800",
                rejected: "bg-red-100 text-red-800",
                refunded: "bg-stone-100 text-stone-800",
              }}
            />
            <span className="text-xs text-muted-foreground">{formatDate(r.requested_at)}</span>
          </div>
          <p className="text-muted-foreground text-xs mt-1">Reason: {r.reason}</p>
          {r.admin_notes && (
            <p className="text-muted-foreground text-xs mt-1">Notes: {r.admin_notes}</p>
          )}
          {r.status === "requested" && (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProcessingId(r.id);
                  setAction("approve");
                  handleProcess(r.id);
                }}
              >
                <Check className="h-3 w-3 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProcessingId(r.id);
                  setAction("reject");
                  handleProcess(r.id);
                }}
              >
                <X className="h-3 w-3 mr-1" /> Reject
              </Button>
            </div>
          )}
        </div>
      ))}
      {pendingReturns.length === 0 && details.return_requests.length > 0 && (
        <p className="text-xs text-muted-foreground">All returns processed.</p>
      )}
    </div>
  );
}

function RefundManager({ details, onUpdated }: { details: OrderDetails; onUpdated: () => void }) {
  const [processing, setProcessing] = useState(false);

  const pendingRefunds = details.refunds.filter((r) => r.status === "pending");

  async function handleProcess(refundId: string, status: string) {
    setProcessing(true);
    try {
      const result = await processRefund(refundId, status);
      if (result.success) onUpdated();
    } catch {
      /* ignored */
    } finally {
      setProcessing(false);
    }
  }

  if (details.refunds.length === 0 && pendingRefunds.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">Refunds</p>
      {details.refunds.map((r) => (
        <div key={r.id} className="border border-border/60 p-3 mb-2 text-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <Badge
              value={r.status}
              map={{
                pending: "bg-amber-100 text-amber-800",
                approved: "bg-emerald-100 text-emerald-800",
                rejected: "bg-red-100 text-red-800",
                completed: "bg-stone-100 text-stone-800",
              }}
            />
            <span className="font-medium">{formatCurrency(r.amount)}</span>
          </div>
          {r.reason && <p className="text-muted-foreground text-xs mt-1">Reason: {r.reason}</p>}
          {r.processed_at && (
            <p className="text-muted-foreground text-xs mt-1">
              Processed: {formatDate(r.processed_at)}
            </p>
          )}
          {r.status === "pending" && (
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={processing}
                onClick={() => handleProcess(r.id, "approved")}
              >
                <Check className="h-3 w-3 mr-1" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={processing}
                onClick={() => handleProcess(r.id, "rejected")}
              >
                <X className="h-3 w-3 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={processing}
                onClick={() => handleProcess(r.id, "completed")}
              >
                <Check className="h-3 w-3 mr-1" /> Complete Refund
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OrderDetailsContent({
  details,
  onUpdated,
}: {
  details: OrderDetails;
  onUpdated: () => void;
}) {
  return (
    <div className="space-y-8 pb-8">
      <StatusManager currentStatus={details.status} orderId={details.id} onUpdated={onUpdated} />

      <div>
        <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
          Order Information
        </p>
        <div className="border border-border/60 p-4 space-y-1 text-sm">
          <DetailRow label="Order ID" value={details.id} />
          <DetailRow label="Order Number" value={details.order_number ?? "—"} />
          <DetailRow label="Created" value={formatDate(details.created_at)} />
          <DetailRow label="Updated" value={formatDate(details.updated_at)} />
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge value={details.status} map={STATUS_BADGES} />
          </div>
          <div className="flex justify-between py-1.5 text-sm">
            <span className="text-muted-foreground">Payment</span>
            <Badge value={details.payment_status} map={PAYMENT_BADGES} />
          </div>
          <DetailRow label="Payment Method" value={details.payment_method ?? "—"} />
          {details.notes && <DetailRow label="Notes" value={details.notes} />}
        </div>
      </div>

      <div>
        <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
          Customer
        </p>
        <div className="border border-border/60 p-4 space-y-1 text-sm">
          <DetailRow
            label="Name"
            value={
              [details.customer.first_name, details.customer.last_name].filter(Boolean).join(" ") ||
              "—"
            }
          />
          <DetailRow label="Email" value={details.customer.email} />
          <DetailRow label="Phone" value={details.customer.phone ?? "—"} />
        </div>
      </div>

      {details.shipping_address && (
        <div>
          <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
            Shipping
          </p>
          <div className="border border-border/60 p-4 space-y-1 text-sm">
            <DetailRow
              label="Address"
              value={
                [details.shipping_address.line1, details.shipping_address.line2]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <DetailRow label="City" value={details.shipping_address.city ?? "—"} />
            <DetailRow label="State" value={details.shipping_address.state ?? "—"} />
            <DetailRow
              label="Postal Code"
              value={
                details.shipping_address.postalCode ?? details.shipping_address.postal_code ?? "—"
              }
            />
            <DetailRow label="Country" value={details.shipping_address.country ?? "—"} />
          </div>
        </div>
      )}

      {details.items.length > 0 && (
        <div>
          <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
            Items ({details.items.length})
          </p>
          <div className="border border-border/60 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left p-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                    Product
                  </th>
                  <th className="text-left p-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                    SKU
                  </th>
                  <th className="text-right p-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                    Qty
                  </th>
                  <th className="text-right p-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                    Price
                  </th>
                  <th className="text-right p-3 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {details.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/20 last:border-0">
                    <td className="p-3 font-medium">{item.name}</td>
                    <td className="p-3 text-muted-foreground text-xs">{item.sku ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="p-3 text-right tabular-nums">{formatCurrency(item.price)}</td>
                    <td className="p-3 text-right tabular-nums font-medium">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] tracking-[0.32em] uppercase text-muted-foreground mb-3">
          Financial Summary
        </p>
        <div className="border border-border/60 p-4 space-y-1 text-sm">
          <DetailRow label="Subtotal" value={formatCurrency(details.subtotal)} />
          <DetailRow label="Shipping" value={formatCurrency(details.shipping_cost)} />
          <DetailRow
            label="Discount"
            value={details.discount > 0 ? `-${formatCurrency(details.discount)}` : "—"}
          />
          {details.coupon_code && <DetailRow label="Coupon" value={details.coupon_code} />}
          <div className="border-t border-border/40 pt-2 mt-2 flex justify-between text-sm">
            <span className="font-medium">Grand Total</span>
            <span className="font-serif font-bold">{formatCurrency(details.total)}</span>
          </div>
        </div>
      </div>

      <ReturnManager details={details} onUpdated={onUpdated} />
      <RefundManager details={details} onUpdated={onUpdated} />
    </div>
  );
}

export function OrderDetailsDrawer({ orderId, open, onClose, onUpdated }: Props) {
  const { details, loading, error, refetch } = useOrderDetails(orderId);

  useEffect(() => {
    if (open && orderId) refetch();
  }, [open, orderId, refetch]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle>
            {details ? (
              <>Order {details.order_number ?? details.id.slice(0, 8)}</>
            ) : (
              "Order Details"
            )}
          </SheetTitle>
          <SheetDescription>
            {details && <Badge value={details.status} map={STATUS_BADGES} />}
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="border border-red/20 bg-red/5 p-6 text-center">
            <p className="text-sm text-red/80">{error}</p>
            <Button variant="outline" size="sm" onClick={refetch} className="mt-3">
              Retry
            </Button>
          </div>
        )}

        {loading && !error && (
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-52 w-full" />
          </div>
        )}

        {!loading && !error && details && (
          <OrderDetailsContent details={details} onUpdated={refetch} />
        )}
      </SheetContent>
    </Sheet>
  );
}
