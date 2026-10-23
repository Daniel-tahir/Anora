import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth, ProtectedRoute } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { cancelOrder } from "@/lib/admin-orders";
import { submitRefundRequest } from "@/lib/refund-actions";
import { formatAddress, getInvoicePdfUrl } from "@/lib/payments";
import { toast } from "sonner";
import {
  Camera, Heart, LogOut, Package, LayoutDashboard, FileDown, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Orders | ANORA New York" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountPage,
});

type Tab = "profile" | "addresses" | "orders" | "order-detail";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  shipping_address: Record<string, any> | null;
  billing_address: Record<string, any> | null;
}

interface Order {
  id: string;
  order_number: string | null;
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

function AccountPage() {
  return (
    <ProtectedRoute>
      <AccountInner />
    </ProtectedRoute>
  );
}

function AccountInner() {
  const { user, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("orders");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Record<string, unknown> | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);

  useEffect(() => {
    if (tab === "orders" || tab === "order-detail") {
      document.title = "My Orders | ANORA New York";
    } else {
      document.title = "My Account | ANORA New York";
    }
  }, [tab]);

  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) {
          setProfile(data);
          setEditFirst(data.first_name ?? "");
          setEditLast(data.last_name ?? "");
          setEditPhone(data.phone ?? "");
          setEditAddress(
            data.shipping_address
              ? formatAddress(data.shipping_address).replace(/\n/g, ", ")
              : "",
          );
        }
      });

    const query = supabase
      .from("orders")
      .select("id, order_number, total, status, payment_status, created_at");

    const ordersQuery = user.email
      ? query.or(`user_id.eq.${user.id},and(user_id.is.null,email.eq.${user.email})`)
      : query.eq("user_id", user.id);

    Promise.resolve(
      ordersQuery
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          if (data) setOrders(data);
        }),
    ).finally(() => setLoading(false));
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      first_name: editFirst,
      last_name: editLast,
      phone: editPhone,
      shipping_address: editAddress ? { line1: editAddress, city: "", postal_code: "" } : null,
    });

    setSaving(false);

    if (error) {
      toast.error("Could not save", { description: "Please try again." });
      return;
    }

    toast.success("Profile saved");
  };

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const handleViewOrder = async (orderId: string) => {
    setOrderLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id, order_number, status, subtotal, total, payment_status, payment_method,
          shipping_address, billing_address, created_at, updated_at,
          cancelled_by, cancelled_at, cancellation_reason,
          order_items (
            id, product_id, name, price, quantity, image_url, attributes
          ),
          invoices (
            id, invoice_number, status, total_amount, issued_at
          ),
          order_timeline (
            id, event_type, description, created_at
          ),
          order_status_history (
            id, previous_status, new_status, note, created_at
          ),
          refunds (
            id, amount, reason, description, status, requested_at, processed_at
          )
        `,
        )
        .eq("id", orderId)
        .single();

      if (error) throw error;
      setSelectedOrder(data);
      setTab("order-detail");
    } catch (err) {
      toast.error("Could not load order details");
    } finally {
      setOrderLoading(false);
    }
  };

  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Customer";
  const avatarLetter = (profile?.first_name?.[0] ?? user?.email?.[0] ?? "A").toUpperCase();

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "orders", label: "My Orders", icon: <Package className="h-4 w-4" /> },
    { id: "addresses", label: "Addresses", icon: null },
    { id: "profile", label: "Profile", icon: null },
  ];

  return (
    <div className="px-5 lg:px-10 py-16 max-w-6xl mx-auto">
      <div className="text-center mb-12">
        <span className="eyebrow">Your Account</span>
        <h1 className="font-serif text-5xl mt-3">My ANORA</h1>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-10">
        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Avatar card */}
          <div className="text-center border border-border/60 p-6">
            <div className="relative mx-auto h-20 w-20 rounded-full overflow-hidden bg-neutral group cursor-pointer">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full grid place-items-center font-serif text-3xl text-muted-foreground">
                  {avatarLetter}
                </div>
              )}
              <div className="absolute inset-0 bg-ink/40 grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-5 w-5 text-background" />
              </div>
            </div>
            <p className="font-serif text-lg mt-3">{displayName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>

          {/* Nav */}
          <div className="space-y-1 border border-border/60 p-6">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setSelectedOrder(null);
                }}
                className={`flex items-center gap-3 w-full text-left text-sm py-2.5 transition-colors duration-300 ${
                  tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
            <Link
              to="/wishlist"
              className="flex items-center gap-3 w-full text-left text-sm py-2.5 text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              <Heart className="h-4 w-4" />
              Wishlist
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-3 w-full text-left text-sm py-2.5 text-muted-foreground hover:text-foreground transition-colors duration-300"
              >
                <LayoutDashboard className="h-4 w-4" />
                Admin Dashboard
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full text-left text-sm py-2.5 text-muted-foreground hover:text-red/80 transition-colors duration-300"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Content */}
        <div>
          {tab === "orders" && (
            <div>
              <h2 className="font-serif text-2xl mb-6">Order History</h2>
              {orderLoading && (
                <div className="mb-4 text-sm text-muted-foreground animate-pulse">
                  Loading order details...
                </div>
              )}
              {loading ? (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 bg-neutral animate-pulse" />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="border border-border/60 p-10 text-center">
                  <Package className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-3">No orders yet</p>
                  <Link
                    to="/shop"
                    className="inline-block mt-4 text-[11px] tracking-[0.32em] uppercase hover-underline"
                  >
                    Start shopping
                  </Link>
                </div>
              ) : (
                <div className="border border-border/60 divide-y divide-border/60">
                  {orders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => handleViewOrder(o.id)}
                      className="w-full text-left p-5 grid grid-cols-[1fr_auto_auto] gap-4 text-sm items-center hover:bg-neutral/50 transition-colors"
                    >
                      <div>
                        <p className="font-serif">{o.order_number ?? o.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(o.created_at).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <span className="font-serif">${Number(o.total).toLocaleString()}</span>
                      <span
                        className={`text-[11px] tracking-[0.28em] uppercase ${
                          o.status === "delivered"
                            ? "text-emerald-600"
                            : o.status === "shipped"
                              ? "text-gold"
                              : "text-muted-foreground"
                        }`}
                      >
                        {o.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "order-detail" && selectedOrder && (
            <OrderDetailView
              order={selectedOrder}
              onBack={() => {
                setTab("orders");
                setSelectedOrder(null);
              }}
            />
          )}

          {tab === "addresses" && (
            <div>
              <h2 className="font-serif text-2xl mb-6">Saved Addresses</h2>
              {profile?.shipping_address ? (
                <div className="border border-border/60 p-6 max-w-md">
                  <p className="eyebrow mb-2 text-gold">Default</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">
                    {formatAddress(profile.shipping_address)}
                  </p>
                </div>
              ) : (
                <div className="border border-border/60 p-10 text-center">
                  <p className="text-sm text-muted-foreground">No addresses saved</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Add a shipping address when you place your first order.
                  </p>
                </div>
              )}
              <button
                onClick={() => setTab("profile")}
                className="mt-4 text-[11px] tracking-[0.28em] uppercase text-muted-foreground hover:text-foreground transition-colors"
              >
                Edit address in profile
              </button>
            </div>
          )}

          {tab === "profile" && (
            <div>
              <h2 className="font-serif text-2xl mb-6">Profile Settings</h2>
              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-md">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name">
                    <input
                      value={editFirst}
                      onChange={(e) => setEditFirst(e.target.value)}
                      className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
                    />
                  </Field>
                  <Field label="Last name">
                    <input
                      value={editLast}
                      onChange={(e) => setEditLast(e.target.value)}
                      className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
                    />
                  </Field>
                </div>
                <Field label="Email">
                  <input
                    value={profile?.email ?? ""}
                    disabled
                    className="w-full bg-neutral/50 border border-border px-4 py-3 text-sm text-muted-foreground outline-none cursor-not-allowed"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors"
                  />
                </Field>
                <Field label="Shipping address">
                  <textarea
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    rows={2}
                    className="w-full bg-background border border-border px-4 py-3 text-sm outline-none focus:border-foreground transition-colors resize-none"
                    placeholder="Street, City, Postal code"
                  />
                </Field>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-foreground text-background py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const CUSTOMER_CANCEL_REASONS = [
  "Changed my mind",
  "Ordered by mistake",
  "Found another product",
  "Other",
];

const REFUND_REASONS = [
  "Damaged Product",
  "Wrong Product",
  "Quality Issue",
  "Late Delivery",
  "Other",
];

async function downloadInvoicePdf(invoiceId: string) {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      toast.error("Please sign in to download your invoice.");
      return;
    }

    const result = await getInvoicePdfUrl({
      data: {
        invoiceId,
        accessToken: token,
      },
    });

    const response = await fetch(result.signedUrl);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to download invoice PDF.");
  }
}

function CancelOrderDialog({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    const finalReason = reason === "Other" ? customReason : reason;
    if (!finalReason) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await cancelOrder(orderId, finalReason, "customer");
      if (!result.success) {
        setError(result.error ?? "Could not cancel order");
        return;
      }
      toast.success("Order cancelled successfully");
      setOpen(false);
      onDone();
    } catch {
      setError("Could not cancel order");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] tracking-[0.28em] uppercase text-red/70 hover:text-red transition-colors"
      >
        Cancel Order
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
          <div className="bg-background max-w-md w-full p-8">
            <p className="font-serif text-xl">Cancel this order?</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Are you sure you want to cancel this order? This action cannot be undone.
            </p>

            <div className="mt-5 space-y-3">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select a reason…</option>
                {CUSTOMER_CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {reason === "Other" && (
                <textarea
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Describe the reason…"
                  rows={2}
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors resize-none"
                />
              )}
              {error && (
                <p className="text-[11px] tracking-wider uppercase text-red/80 bg-red/5 border border-red/20 px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setOpen(false);
                  setReason("");
                  setCustomReason("");
                  setError("");
                }}
                disabled={submitting}
                className="flex-1 border border-border/60 py-3 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Keep Order
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || !reason || (reason === "Other" && !customReason)}
                className="flex-1 bg-red/80 text-background py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-red transition-all disabled:opacity-50"
              >
                {submitting ? "Cancelling…" : "Cancel Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function RequestRefundDialog({
  orderId,
  onDone,
}: {
  orderId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const invalidFiles = selectedFiles.filter(file => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        return !["jpg", "jpeg", "png", "webp", "mp4", "mov"].includes(ext || "");
      });

      if (invalidFiles.length > 0) {
        setError(`Unsupported format: ${invalidFiles.map(f => f.name).join(", ")}. Allowed: JPG, JPEG, PNG, WEBP, MP4, MOV.`);
        return;
      }

      const oversizedFiles = selectedFiles.filter(file => file.size > 50 * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        setError(`Files exceed 50MB limit: ${oversizedFiles.map(f => f.name).join(", ")}.`);
        return;
      }

      setError("");
      setFiles(selectedFiles);
    }
  };

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError("");
    setUploadProgress("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Please sign in to submit a refund request");
        setSubmitting(false);
        return;
      }

      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading proof ${i + 1} of ${files.length}...`);

        const fileUuid = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const fileExt = file.name.split(".").pop()?.toLowerCase();
        const filePath = `${orderId}/${fileUuid}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("refund-attachments")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from("refund-attachments")
          .getPublicUrl(filePath);

        uploadedUrls.push(urlData.publicUrl);
      }

      setUploadProgress("Submitting request details...");
      const result = await submitRefundRequest({
        data: {
          orderId,
          reason,
          description: description || undefined,
          attachments: uploadedUrls,
          accessToken: token,
        }
      });

      if (!result.success) {
        setError("Could not submit refund request");
        return;
      }

      toast.success("Refund request submitted successfully");
      setOpen(false);
      setReason("");
      setDescription("");
      setFiles([]);
      onDone();
    } catch (err: any) {
      setError(err?.message || "Could not submit refund request");
    } finally {
      setSubmitting(false);
      setUploadProgress("");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground hover:text-foreground transition-colors"
      >
        Request Refund
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 px-4">
          <div className="bg-background max-w-md w-full p-8 border border-border/80 shadow-2xl">
            <p className="font-serif text-xl">Request a Refund</p>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Tell us why you'd like a refund for this order. Please upload parcel opening video and images as proof.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[10px] tracking-wider uppercase text-muted-foreground mb-1 block">Reason (Required)</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full h-9 rounded-none border border-border bg-background px-3 text-sm focus:border-foreground outline-none transition-colors"
                >
                  <option value="">Select a reason…</option>
                  {REFUND_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] tracking-wider uppercase text-muted-foreground mb-1 block">Details</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us more about the issues..."
                  rows={3}
                  className="w-full bg-background border border-border px-3 py-2 text-sm outline-none focus:border-foreground transition-colors resize-none"
                />
              </div>

              <div>
                <label className="text-[10px] tracking-wider uppercase text-muted-foreground mb-1 block">Upload Proof (Images/Video - Max 50MB total)</label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                  onChange={handleFileChange}
                  className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:border file:border-border/60 file:bg-background file:text-xs file:tracking-wider file:uppercase file:text-muted-foreground file:cursor-pointer hover:file:text-foreground hover:file:border-foreground"
                />
                {files.length > 0 && (
                  <p className="text-xs text-emerald-600 mt-1">
                    {files.length} file(s) selected: {files.map(f => f.name).join(", ")}
                  </p>
                )}
              </div>

              {uploadProgress && (
                <p className="text-xs text-gold animate-pulse">
                  {uploadProgress}
                </p>
              )}

              {error && (
                <p className="text-[11px] tracking-wider uppercase text-red/80 bg-red/5 border border-red/20 px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setOpen(false);
                  setReason("");
                  setDescription("");
                  setFiles([]);
                  setError("");
                }}
                disabled={submitting}
                className="flex-1 border border-border/60 py-3 text-[11px] tracking-[0.32em] uppercase text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !reason}
                className="flex-1 bg-foreground text-background py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OrderDetailView({
  order,
  onBack,
}: {
  order: Record<string, unknown>;
  onBack: () => void;
}) {
  const items = (order.order_items as Array<Record<string, unknown>>) ?? [];
  const invoice = (order.invoices as Array<Record<string, unknown>>)?.[0] ?? null;
  const timeline = (order.order_timeline as Array<Record<string, unknown>>) ?? [];
  const statusHistory = (order.order_status_history as Array<Record<string, unknown>>) ?? [];
  const refunds = (order.refunds as Array<Record<string, unknown>>) ?? [];
  const shippingAddr = order.shipping_address as Record<string, string> | null;
  const billingAddr = order.billing_address as Record<string, string> | null;
  const [refreshKey, setRefreshKey] = useState(0);

  const status = String(order.status ?? "");
  const cancelledBy = String(order.cancelled_by ?? "");
  const cancelledAt = String(order.cancelled_at ?? "");
  const cancellationReason = String(order.cancellation_reason ?? "");

  const cancellable = ["pending", "confirmed", "processing"].includes(status);
  const isPaid = order.payment_status === "completed" || order.payment_status === "paid";
  const isDeliveredOrCompleted = status === "delivered" || status === "completed";
  const hasActiveRefund = refunds.some((r) => 
    ["pending", "approved", "awaiting_return", "received", "inspection_passed", "processing"].includes(String(r.status))
  );
  const canRequestRefund = isPaid && isDeliveredOrCompleted && !hasActiveRefund;

  return (
    <div>
      <button
        onClick={onBack}
        className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        &larr; Back to Orders
      </button>

      <div className="border border-border/60 divide-y divide-border/60">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-serif text-2xl">Order {String(order.order_number ?? "")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {order.created_at
                  ? new Date(String(order.created_at)).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })
                  : ""}
              </p>
            </div>
            <span
              className={`text-[11px] tracking-[0.28em] uppercase px-3 py-1 border ${
                status === "confirmed"
                  ? "text-emerald-600 border-emerald-600/30"
                  : status === "delivered"
                    ? "text-emerald-600 border-emerald-600/30"
                    : status === "shipped"
                      ? "text-gold border-gold/30"
                      : status === "cancelled" || status === "refunded"
                      ? "text-red/70 border-red/30"
                      : "text-muted-foreground border-border"
              }`}
            >
              {status || "pending"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Payment: {String(order.payment_status ?? "")}
              {order.payment_method ? ` via ${order.payment_method}` : ""}
            </p>
            <div className="flex items-center gap-4">
              <Link
                to="/track"
                search={{ orderNumber: String(order.order_number) }}
                className="text-[11px] tracking-[0.28em] uppercase text-gold hover:text-gold/70 transition-colors"
              >
                Track Order
              </Link>
              {cancellable && (
                <CancelOrderDialog orderId={String(order.id)} onDone={() => setRefreshKey((k) => k + 1)} />
              )}
              {canRequestRefund && (
                <RequestRefundDialog orderId={String(order.id)} onDone={() => setRefreshKey((k) => k + 1)} />
              )}
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <h3 className="eyebrow">Items</h3>
          {items.map((item: Record<string, unknown>) => (
            <div key={item.id as string} className="flex justify-between text-sm">
              <div className="flex items-center gap-3">
                {!!item.image_url && (
                  <img
                    src={item.image_url as string}
                    alt={item.name as string}
                    className="w-10 h-12 object-cover"
                  />
                )}
                <div>
                  <p className="font-serif">{String(item.name ?? "")}</p>
                  <p className="text-xs text-muted-foreground">
                    Qty {String(item.quantity ?? "")}
                    {item.attributes && typeof item.attributes === "object"
                      ? ` · Size ${String((item.attributes as Record<string, string>).size ?? "")}`
                      : ""}
                  </p>
                </div>
              </div>
              <span>${(Number(item.price ?? 0) * Number(item.quantity ?? 0)).toFixed(2)}</span>
            </div>
          ))}
          <div className="h-px bg-border my-3" />
          <div className="flex justify-between font-serif text-lg">
            <span>Total</span>
            <span>${Number(order.total ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {shippingAddr && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Shipping Address</h3>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {formatAddress(shippingAddr)}
            </div>
          </div>
        )}

        {billingAddr && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Billing Address</h3>
            <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
              {formatAddress(billingAddr)}
            </div>
          </div>
        )}

        {invoice && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Invoice</h3>
            <div className="text-sm space-y-1">
              <p className="text-muted-foreground">{String(invoice.invoice_number ?? "")}</p>
              <p className="text-muted-foreground">Status: {String(invoice.status ?? "")}</p>
              <p className="text-muted-foreground">
                Amount: ${Number(invoice.total_amount ?? 0).toFixed(2)}
              </p>
              <button
                type="button"
                onClick={() => downloadInvoicePdf(String(invoice.id ?? ""))}
                className="mt-3 inline-flex items-center gap-1.5 text-xs tracking-[0.2em] uppercase text-gold hover:text-gold/70 transition-colors"
              >
                <FileDown className="h-3 w-3" />
                Download PDF
              </button>
            </div>
          </div>
        )}

        {cancelledBy && (
          <div className="p-6 bg-red/5">
            <h3 className="eyebrow mb-3 text-red/70">Order Cancelled</h3>
            <div className="text-sm text-red/80 space-y-1">
              <p>By: {cancelledBy === "customer" ? "You" : "Admin"}</p>
              {cancelledAt && <p>At: {new Date(cancelledAt).toLocaleString()}</p>}
              {cancellationReason && <p>Reason: {cancellationReason}</p>}
            </div>
          </div>
        )}

        {refunds.length > 0 && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Refund</h3>
            {refunds.map((r) => (
              <div key={r.id as string} className="text-sm space-y-1">
                <p>
                  Status:{" "}
                  <span
                    className={
                      r.status === "completed"
                        ? "text-emerald-600"
                        : r.status === "rejected"
                          ? "text-red/70"
                          : "text-gold"
                    }
                  >
                    {r.status === "completed"
                      ? "Refunded"
                      : r.status === "rejected"
                        ? "Rejected"
                        : r.status === "pending"
                          ? "Requested"
                          : r.status === "approved" || r.status === "awaiting_return"
                            ? "Return Approved — Awaiting Shipment"
                            : r.status === "received"
                              ? "Items Received — Under Quality Inspection"
                              : r.status === "inspection_passed"
                                ? "Inspection Passed — Refund Processing"
                                : r.status === "processing"
                                  ? "Refund Processing"
                                  : String(r.status ?? "")}
                  </span>
                </p>
                <p className="text-muted-foreground">Amount: ${Number(r.amount ?? 0).toFixed(2)}</p>
                {!!r.reason && <p className="text-muted-foreground">Reason: {String(r.reason)}</p>}
                {!!r.rejection_reason && <p className="text-red-500 font-medium text-xs mt-1">Rejection Reason: {String(r.rejection_reason)}</p>}
                {!!r.more_info_notes && (
                  <p className="text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs border border-amber-200 mt-2 font-medium">
                    Concierge Clarification Requested: "{String(r.more_info_notes)}"
                  </p>
                )}
                {!!r.processed_at && (
                  <p className="text-muted-foreground">
                    Processed: {new Date(String(r.processed_at)).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {(timeline.length > 0 || statusHistory.length > 0) && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Timeline</h3>
            <div className="space-y-3">
              {timeline
                .sort(
                  (a, b) =>
                    new Date(String(b.created_at ?? "")).getTime() -
                    new Date(String(a.created_at ?? "")).getTime(),
                )
                .map((entry: Record<string, unknown>) => (
                  <div key={entry.id as string} className="flex gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-gold mt-1.5 shrink-0" />
                    <div>
                      <p>{String(entry.description ?? "")}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.created_at
                          ? new Date(String(entry.created_at)).toLocaleString()
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              {statusHistory.length > 0 && (
                <div className="pt-3 border-t border-border/40">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
                    Status Changes
                  </p>
                  {statusHistory
                    .sort(
                      (a, b) =>
                        new Date(String(a.created_at ?? "")).getTime() -
                        new Date(String(b.created_at ?? "")).getTime(),
                    )
                    .map((entry) => (
                      <div key={entry.id as string} className="flex gap-3 text-sm py-1.5">
                        <div className="w-2 h-2 rounded-full bg-ink/30 mt-1.5 shrink-0" />
                        <div>
                          <p className="text-muted-foreground">
                            {String(entry.previous_status ?? "")}
                            {" → "}
                            {String(entry.new_status ?? "")}
                            {entry.note ? ` — ${String(entry.note)}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground/60">
                            {entry.created_at
                              ? new Date(String(entry.created_at)).toLocaleString()
                              : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}
