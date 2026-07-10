import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useAuth, ProtectedRoute } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Camera, Heart, LogOut, Package, LayoutDashboard, FileDown } from "lucide-react";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "My Account — ANORA" }] }),
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
              ? `${data.shipping_address.line1 ?? ""}, ${data.shipping_address.city ?? ""}, ${data.shipping_address.postal_code ?? ""}`
              : "",
          );
        }
      });

    Promise.resolve(
      supabase
        .from("orders")
        .select("id, order_number, total, status, payment_status, created_at")
        .eq("user_id", user.id)
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
      toast.error("Could not save", { description: error.message });
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
          order_items (
            id, product_id, name, price, quantity, image_url, attributes
          ),
          invoices (
            id, invoice_number, status, total_amount, issued_at
          ),
          order_timeline (
            id, event_type, description, created_at
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
                  <p className="font-serif text-lg">{displayName}</p>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                    {profile.shipping_address.line1 && (
                      <>
                        {profile.shipping_address.line1}
                        <br />
                      </>
                    )}
                    {profile.shipping_address.line2 && (
                      <>
                        {profile.shipping_address.line2}
                        <br />
                      </>
                    )}
                    {profile.shipping_address.city && profile.shipping_address.postal_code && (
                      <>
                        {profile.shipping_address.city}, {profile.shipping_address.postal_code}
                        <br />
                      </>
                    )}
                    {profile.shipping_address.country ?? "United States"}
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

async function downloadInvoicePdf(invoiceId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${origin}/api/invoice/${invoiceId}/pdf?token=${encodeURIComponent(token)}`;
  window.open(apiUrl, "_blank");
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
  const shippingAddr = order.shipping_address as Record<string, string> | null;
  const billingAddr = order.billing_address as Record<string, string> | null;

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
                order.status === "confirmed"
                  ? "text-emerald-600 border-emerald-600/30"
                  : order.status === "delivered"
                    ? "text-emerald-600 border-emerald-600/30"
                    : order.status === "shipped"
                      ? "text-gold border-gold/30"
                      : "text-muted-foreground border-border"
              }`}
            >
              {String(order.status ?? "pending")}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Payment: {String(order.payment_status ?? "")}
            {order.payment_method ? ` via ${String(order.payment_method)}` : ""}
          </p>
        </div>

        <div className="p-6 space-y-3">
          <h3 className="eyebrow">Items</h3>
          {items.map((item: Record<string, unknown>) => (
            <div key={item.id as string} className="flex justify-between text-sm">
              <div className="flex items-center gap-3">
                {item.image_url && (
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
            <div className="text-sm text-muted-foreground leading-relaxed">
              {Object.entries(shippingAddr)
                .filter(([_, v]) => v)
                .map(([k, v]) => (
                  <span key={k}>
                    {v}
                    <br />
                  </span>
                ))}
            </div>
          </div>
        )}

        {billingAddr && (
          <div className="p-6">
            <h3 className="eyebrow mb-3">Billing Address</h3>
            <div className="text-sm text-muted-foreground leading-relaxed">
              {Object.entries(billingAddr)
                .filter(([_, v]) => v)
                .map(([k, v]) => (
                  <span key={k}>
                    {v}
                    <br />
                  </span>
                ))}
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

        {timeline.length > 0 && (
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
