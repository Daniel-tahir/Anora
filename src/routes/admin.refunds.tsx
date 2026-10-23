import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  RotateCcw,
  Check,
  X,
  Clock,
  ArrowRightLeft,
  Mail,
  FileText,
  AlertCircle,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import {
  approveRefund,
  rejectRefund,
  requestMoreInfo,
  markProductReceived,
  passRefundInspection,
  initiateRefundExecution,
} from "@/lib/refund-actions";

export const Route = createFileRoute("/admin/refunds")({
  head: () => ({
    meta: [{ title: "Refund Requests Management — ANORA" }],
  }),
  component: RefundsPage,
});

interface RefundItem {
  id: string;
  amount: number;
  reason: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "completed" | "awaiting_return" | "received" | "inspection_passed" | "processing";
  requested_at: string;
  processed_at: string | null;
  attachments: string[];
  rejection_reason: string | null;
  more_info_notes: string | null;
  stripe_refund_id?: string | null;
  metadata: {
    items?: Array<{
      product_id: string;
      variant_id?: string;
      size: string;
      quantity: number;
      unit_price: number;
      name?: string;
    }>;
    requested_by?: string;
    products_received_at?: string;
    products_received_by?: string;
  } | null;
  orders: {
    id: string;
    order_number: string;
    total: number;
    payment_status: string;
    status: string;
    email: string;
    shipping_address: any;
    customer_name?: string;
  } | null;
}

function RefundsPage() {
  const [refunds, setRefunds] = useState<RefundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedRefund, setSelectedRefund] = useState<RefundItem | null>(null);
  
  // Dialog States
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRefunds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("refunds")
        .select(`
          id, amount, reason, description, status, requested_at, processed_at, attachments, rejection_reason, more_info_notes, stripe_refund_id, metadata,
          orders (
            id, order_number, total, payment_status, status, email, user_id, shipping_address
          )
        `)
        .order("requested_at", { ascending: false });

      if (error) throw error;
      
      const mappedRefunds = (data || []).map((item: any) => {
        const order = item.orders;
        const addr = order?.shipping_address && typeof order.shipping_address === "object"
          ? (order.shipping_address as Record<string, any>)
          : null;
        const customerName = addr ? [addr.firstName, addr.lastName].filter(Boolean).join(" ") : null;

        return {
          ...item,
          orders: order ? {
            ...order,
            customer_name: customerName || order.email || "Guest Customer"
          } : null
        };
      });

      setRefunds(mappedRefunds as RefundItem[]);
      if (mappedRefunds.length > 0) {
        // Keep selection if possible, otherwise default to first
        const currentSelected = selectedRefund
          ? mappedRefunds.find((r: any) => r.id === selectedRefund.id)
          : null;
        setSelectedRefund(currentSelected || mappedRefunds[0]);
      } else {
        setSelectedRefund(null);
      }
    } catch (err: any) {
      toast.error(`Failed to fetch refund requests: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRefunds();
  }, []);

  const getFilteredRefunds = () => {
    if (activeTab === "all") return refunds;
    if (activeTab === "pending") return refunds.filter((r) => r.status === "pending");
    if (activeTab === "approved") {
      return refunds.filter(
        (r) =>
          r.status === "approved" ||
          r.status === "awaiting_return" ||
          r.status === "received" ||
          r.status === "inspection_passed" ||
          r.status === "processing"
      );
    }
    if (activeTab === "completed") return refunds.filter((r) => r.status === "completed");
    if (activeTab === "rejected") return refunds.filter((r) => r.status === "rejected");
    return refunds.filter((r) => r.status === activeTab);
  };

  const filteredList = getFilteredRefunds();

  const getAccessToken = async (): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Session expired. Please log in again.");
    }
    return session.access_token;
  };

  const handleApprove = async () => {
    if (!selectedRefund) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await approveRefund({
        data: {
          refundId: selectedRefund.id,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Refund approved successfully.");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Approval failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedRefund || !rejectionReason.trim()) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await rejectRefund({
        data: {
          refundId: selectedRefund.id,
          reason: rejectionReason,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Refund request rejected.");
        setRejectOpen(false);
        setRejectionReason("");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Rejection failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInfoSubmit = async () => {
    if (!selectedRefund || !infoMessage.trim()) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await requestMoreInfo({
        data: {
          refundId: selectedRefund.id,
          message: infoMessage,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Clarification request sent to customer.");
        setInfoOpen(false);
        setInfoMessage("");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Request failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceived = async () => {
    if (!selectedRefund) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await markProductReceived({
        data: {
          refundId: selectedRefund.id,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Returned products received.");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Failed to mark received: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePassInspection = async () => {
    if (!selectedRefund) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await passRefundInspection({
        data: {
          refundId: selectedRefund.id,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Quality inspection passed successfully.");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Failed to pass inspection: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitiateRefund = async () => {
    if (!selectedRefund) return;
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await initiateRefundExecution({
        data: {
          refundId: selectedRefund.id,
          accessToken: token,
        },
      });
      if (res.success) {
        toast.success("Refund process initiated.");
        await fetchRefunds();
      }
    } catch (err: any) {
      toast.error(`Failed to process refund: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-3xl tracking-tight">Refund Requests</h1>
          <p className="text-sm text-muted-foreground">
            Manage incoming client return & refund applications.
          </p>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-border/60 gap-4 text-xs font-medium uppercase tracking-wider font-semibold">
          {["all", "pending", "approved", "rejected", "completed"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                const list = tab === "all" ? refunds : refunds.filter((r) => r.status === tab);
                if (list.length > 0) setSelectedRefund(list[0]);
                else setSelectedRefund(null);
              }}
              className={`pb-3 border-b-2 transition-all ${
                activeTab === tab
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "approved" ? "Return Processing" : tab === "completed" ? "Refunded" : tab === "pending" ? "Requested" : tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96 items-center justify-center text-center">
            <p className="col-span-3 text-sm text-muted-foreground animate-pulse">Loading refund requests...</p>
          </div>
        ) : refunds.length === 0 ? (
          <div className="border border-dashed border-border/80 p-16 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium">No refund requests found</p>
            <p className="text-xs text-muted-foreground mt-1">There are no refund requests registered under the selected status filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar list */}
            <div className="border border-border/60 bg-background/50 divide-y divide-border/60 max-h-[600px] overflow-y-auto">
              {filteredList.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">No matches for this filter.</div>
              ) : (
                filteredList.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => setSelectedRefund(ref)}
                    className={`w-full text-left p-4 hover:bg-muted/30 transition-colors flex justify-between items-center ${
                      selectedRefund?.id === ref.id ? "bg-muted/50 border-l-4 border-foreground" : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="font-serif text-sm">Order #{ref.orders?.order_number || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {ref.orders?.customer_name || ref.orders?.email || "Guest User"}
                      </p>
                      <p className="text-[11px] tracking-wider uppercase text-muted-foreground/80">
                        {new Date(ref.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right space-y-1.5">
                      <p className="font-semibold text-sm">${Number(ref.amount).toFixed(2)}</p>
                      <span
                        className={`inline-block text-[9px] tracking-wider uppercase px-2 py-0.5 border ${
                          ref.status === "completed"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : ref.status === "rejected"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : ref.status === "approved" || ref.status === "awaiting_return"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}
                      >
                        {ref.status === "approved" || ref.status === "awaiting_return"
                          ? "Return Approved"
                          : ref.status === "completed"
                            ? "Refunded"
                            : ref.status === "pending"
                              ? "Requested"
                              : ref.status === "received"
                                ? "Received"
                                : ref.status === "inspection_passed"
                                  ? "Inspection Passed"
                                  : ref.status === "processing"
                                    ? "Refund Processing"
                                    : ref.status}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Details panel */}
            <div className="lg:col-span-2 border border-border/60 p-6 bg-background">
              {selectedRefund ? (
                <div className="space-y-6">
                  {/* Header info */}
                  <div className="flex justify-between items-start border-b border-border/60 pb-4">
                    <div>
                      <h2 className="font-serif text-xl">Order #{selectedRefund.orders?.order_number || "—"}</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        Request ID: {selectedRefund.id}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Requested Amount</p>
                      <p className="font-serif text-2xl font-bold">${Number(selectedRefund.amount).toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Customer and metadata */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <p className="tracking-wider uppercase text-muted-foreground font-medium mb-1">Customer Details</p>
                      <p className="font-medium text-sm">
                        {selectedRefund.orders?.customer_name || "Guest Customer"}
                      </p>
                      <p className="text-muted-foreground">{selectedRefund.orders?.email}</p>
                    </div>
                    <div>
                      <p className="tracking-wider uppercase text-muted-foreground font-medium mb-1">Request Date</p>
                      <p className="font-medium text-sm">
                        {new Date(selectedRefund.requested_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Reason & description */}
                  <div className="bg-muted/20 p-4 border border-border/40 text-sm space-y-2">
                    <p>
                      <strong className="text-xs tracking-wider uppercase text-muted-foreground block mb-0.5">Reason</strong>
                      {selectedRefund.reason}
                    </p>
                    {selectedRefund.description && (
                      <p>
                        <strong className="text-xs tracking-wider uppercase text-muted-foreground block mb-0.5">Description</strong>
                        {selectedRefund.description}
                      </p>
                    )}
                    {selectedRefund.rejection_reason && (
                      <p className="text-red-700 bg-red-50 p-2 border border-red-200">
                        <strong className="text-xs tracking-wider uppercase text-red-800 block mb-0.5">Rejection Reason</strong>
                        {selectedRefund.rejection_reason}
                      </p>
                    )}
                    {selectedRefund.more_info_notes && (
                      <p className="text-amber-700 bg-amber-50 p-2 border border-amber-200">
                        <strong className="text-xs tracking-wider uppercase text-amber-800 block mb-0.5">Clarification Note Requested</strong>
                        {selectedRefund.more_info_notes}
                      </p>
                    )}
                  </div>

                  {/* Uploaded media proof */}
                  <div>
                    <h3 className="text-xs tracking-wider uppercase text-muted-foreground font-medium mb-3">Proofs & Attachments</h3>
                    {selectedRefund.attachments && selectedRefund.attachments.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {selectedRefund.attachments.map((url, idx) => {
                          const isVideo = url.endsWith(".mp4") || url.endsWith(".mov") || url.includes("video");
                          return (
                            <div key={idx} className="relative group border border-border/60 aspect-video md:aspect-square bg-muted flex items-center justify-center overflow-hidden">
                              {isVideo ? (
                                <video src={url} controls className="w-full h-full object-cover" />
                              ) : (
                                <img
                                  src={url}
                                  alt={`Proof ${idx + 1}`}
                                  className="w-full h-full object-cover cursor-zoom-in"
                                  onClick={() => window.open(url, "_blank")}
                                />
                              )}
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="absolute top-2 right-2 bg-background/80 hover:bg-background text-foreground p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No media files uploaded as proof.</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="border-t border-border/60 pt-6">
                    {selectedRefund.status === "pending" && (
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={handleApprove}
                          disabled={submitting}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => setRejectOpen(true)}
                          disabled={submitting}
                          className="px-4 py-2 border border-red/60 hover:bg-red/5 text-red/80 text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => setInfoOpen(true)}
                          disabled={submitting}
                          className="px-4 py-2 border border-border/80 hover:bg-muted text-muted-foreground text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          <Mail className="h-3.5 w-3.5" /> Need More Info
                        </button>
                      </div>
                    )}

                    {(selectedRefund.status === "approved" || selectedRefund.status === "awaiting_return") && (
                      <div className="space-y-4">
                        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 text-xs space-y-1">
                          <p className="font-semibold">Return Approved</p>
                          <p>Return request has been approved. Waiting for the returned products from the customer.</p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Once customer return parcel has been delivered to your warehouse, mark it as received:</p>
                          <button
                            onClick={handleReceived}
                            disabled={submitting}
                            className="px-4 py-2 bg-foreground hover:bg-gold hover:text-ink text-background text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Product Received
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRefund.status === "received" && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 text-xs space-y-1">
                          <p className="font-semibold">Items Received</p>
                          <p>Returned items have been marked as received. Please perform quality inspection.</p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Verify items are undamaged and match return conditions:</p>
                          <button
                            onClick={handlePassInspection}
                            disabled={submitting}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <Check className="h-3.5 w-3.5" /> Pass Inspection
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRefund.status === "inspection_passed" && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 text-xs space-y-1">
                          <p className="font-semibold">Inspection Passed</p>
                          <p>Items passed quality validation. You can now execute the payment refund.</p>
                        </div>
                        
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Execute Stripe/PayPal refund and restore stock levels:</p>
                          <button
                            onClick={handleInitiateRefund}
                            disabled={submitting}
                            className="px-4 py-2 bg-foreground hover:bg-gold hover:text-ink text-background text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50 flex items-center gap-1.5"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" /> Process Refund
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedRefund.status === "processing" && (
                      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 text-xs space-y-1">
                        <p className="font-semibold">Refund Processing</p>
                        <p>Stripe/PayPal refund has been initiated. Waiting for processor callback confirmation to complete the transaction.</p>
                      </div>
                    )}

                    {selectedRefund.status === "completed" && (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 text-xs space-y-1">
                        <p className="font-semibold">Refund completed successfully</p>
                        <p>Payment processor has confirmed the refund and the order status is updated to refunded.</p>
                      </div>
                    )}

                    {selectedRefund.status === "rejected" && (
                      <div className="bg-red-50 border border-red-200 text-red-800 p-4 text-xs">
                        This refund request has been rejected. Customer has been notified.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-96 flex items-center justify-center text-muted-foreground text-xs italic">
                  Select a refund request to view details.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
          <div className="bg-background max-w-md w-full p-8 border border-border shadow-2xl space-y-4">
            <h3 className="font-serif text-lg">Reject Refund Request</h3>
            <p className="text-xs text-muted-foreground">Please provide a reason why this refund request is being rejected. This will be visible to the customer.</p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors resize-none"
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setRejectOpen(false);
                  setRejectionReason("");
                }}
                disabled={submitting}
                className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={submitting || !rejectionReason.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Need Info Modal */}
      {infoOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
          <div className="bg-background max-w-md w-full p-8 border border-border shadow-2xl space-y-4">
            <h3 className="font-serif text-lg">Request Clarification</h3>
            <p className="text-xs text-muted-foreground">Specify what details or proofs are missing from this request. The customer will receive an email prompting them to respond.</p>
            <textarea
              value={infoMessage}
              onChange={(e) => setInfoMessage(e.target.value)}
              placeholder="Specify missing details..."
              rows={3}
              className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors resize-none"
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => {
                  setInfoOpen(false);
                  setInfoMessage("");
                }}
                disabled={submitting}
                className="px-4 py-2 border border-border text-muted-foreground hover:text-foreground text-xs uppercase tracking-wider transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleInfoSubmit}
                disabled={submitting || !infoMessage.trim()}
                className="px-4 py-2 bg-foreground text-background hover:bg-gold hover:text-ink text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-50"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
