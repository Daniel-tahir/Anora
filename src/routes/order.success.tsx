import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProtectedRoute, useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { CheckCircle, FileDown, Loader } from "lucide-react";

export const Route = createFileRoute("/order/success")({
  validateSearch: (search: Record<string, string | undefined>) => ({
    session_id: search.session_id,
    orderNumber: search.orderNumber,
    invoiceNumber: search.invoiceNumber,
    orderId: search.orderId,
  }),
  head: () => ({ meta: [{ title: "Order Confirmed — ANORA" }] }),
  component: OrderSuccessPage,
});

function OrderSuccessPage() {
  return (
    <ProtectedRoute>
      <OrderSuccess />
    </ProtectedRoute>
  );
}

async function downloadInvoice(invoiceId: string) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${origin}/api/invoice/${invoiceId}/pdf?token=${encodeURIComponent(token)}`;
  window.open(apiUrl, "_blank");
}

function DownloadInvoice({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setLoading(true);
        downloadInvoice(invoiceId);
        setTimeout(() => setLoading(false), 3000);
      }}
      disabled={loading}
      className="mt-3 inline-flex items-center gap-2 text-sm text-gold hover:underline disabled:opacity-50"
    >
      {loading ? <Loader className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {loading ? "Opening..." : "Download Invoice PDF"}
    </button>
  );
}

function OrderSuccess() {
  const { user } = useAuth();
  const { orderNumber, invoiceNumber, orderId } = Route.useSearch();
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchParams =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!user) return;

    async function fetchByOrderId() {
      if (!orderId) return null;

      const { data } = await supabase
        .from("orders")
        .select(
          `id, order_number, status, subtotal, total, payment_status, payment_method,
           shipping_address, billing_address, created_at,
           order_items (id, product_id, name, price, quantity, image_url, attributes),
           invoices (id, invoice_number, status, total_amount),
           order_timeline (id, event_type, description, created_at)`,
        )
        .eq("id", orderId)
        .eq("user_id", user.id)
        .maybeSingle();

      return data;
    }

    async function fetchBySessionId() {
      if (!sessionId) return null;

      const { data } = await supabase
        .from("orders")
        .select(
          `id, order_number, status, subtotal, total, payment_status, payment_method,
           shipping_address, billing_address, created_at,
           order_items (id, product_id, name, price, quantity, image_url, attributes),
           invoices (id, invoice_number, status, total_amount),
           order_timeline (id, event_type, description, created_at)`,
        )
        .eq("stripe_session_id", sessionId)
        .maybeSingle();

      return data;
    }

    async function load() {
      let data = await fetchByOrderId();
      if (data) {
        setOrder(data);
        setLoading(false);
        return;
      }

      data = await fetchBySessionId();
      if (data) {
        setOrder(data);
        setLoading(false);
        return;
      }

      // If we have order details from URL params but DB lookup failed (async race),
      // still show success with the info we have
      if (orderNumber) {
        setLoading(false);
        return;
      }

      // If no session_id or orderId, try to find most recent order
      if (!sessionId && !orderId) {
        const { data: recentOrder } = await supabase
          .from("orders")
          .select(
            `id, order_number, status, subtotal, total, payment_status, payment_method,
             shipping_address, billing_address, created_at,
             order_items (id, product_id, name, price, quantity, image_url, attributes),
             invoices (id, invoice_number, status, total_amount),
             order_timeline (id, event_type, description, created_at)`,
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentOrder) {
          setOrder(recentOrder);
          setLoading(false);
          return;
        }

        if (!orderNumber) {
          setError("No order information found.");
          setLoading(false);
          return;
        }
      }

      // Poll for session-based order if not found immediately
      if (sessionId) {
        let retries = 0;
        const maxRetries = 15;

        async function poll() {
          const found = await fetchBySessionId();
          if (found) {
            setOrder(found);
            setLoading(false);
            return;
          }
          retries++;
          if (retries < maxRetries) {
            setTimeout(poll, 1500);
          } else {
            setError("Order is being processed. Please check your account shortly.");
            setLoading(false);
          }
        }

        setTimeout(poll, 2000);
      } else {
        setLoading(false);
      }
    }

    load();
  }, [user, sessionId, orderId, orderNumber]);

  if (loading) {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-12 w-12 rounded-full bg-neutral mx-auto" />
          <div className="h-6 w-48 bg-neutral mx-auto rounded" />
          <div className="h-4 w-64 bg-neutral mx-auto rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-24 text-center max-w-md mx-auto">
        <p className="text-muted-foreground">{error}</p>
        <Link
          to="/account"
          className="mt-6 inline-block text-[11px] tracking-[0.32em] uppercase hover-underline"
        >
          View My Orders
        </Link>
      </div>
    );
  }

  const displayOrderNumber = (order?.order_number as string) ?? orderNumber ?? "";
  const displayInvoiceNumber = invoiceNumber ?? "";
  const items = (order?.order_items as Array<Record<string, unknown>>) ?? [];
  const invoice = (order?.invoices as Array<Record<string, unknown>>)?.[0] ?? null;
  const shippingAddr = order?.shipping_address as Record<string, string> | null;

  return (
    <div className="px-5 lg:px-10 py-16 max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <CheckCircle className="h-12 w-12 mx-auto text-emerald-600 mb-4" />
        <span className="eyebrow">Payment Successful</span>
        <h1 className="font-serif text-4xl mt-2">Thank You</h1>
        {displayOrderNumber && (
          <p className="text-muted-foreground mt-2">Order {displayOrderNumber}</p>
        )}
      </div>

      <div className="border border-border/60 divide-y divide-border/60">
        {items.length > 0 && (
          <div className="p-6 space-y-3">
            <h2 className="eyebrow">Order Summary</h2>
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
                  <span>
                    {String(item.name ?? "")} × {String(item.quantity ?? "")}
                  </span>
                </div>
                <span>${(Number(item.price ?? 0) * Number(item.quantity ?? 0)).toFixed(2)}</span>
              </div>
            ))}
            <div className="h-px bg-border my-3" />
            <div className="flex justify-between font-serif text-lg">
              <span>Total Paid</span>
              <span>${Number(order?.total ?? 0).toFixed(2)}</span>
            </div>
          </div>
        )}

        {(invoice || displayInvoiceNumber) && (
          <div className="p-6">
            <h2 className="eyebrow mb-3">Invoice</h2>
            <p className="text-sm text-muted-foreground">
              {String(invoice?.invoice_number ?? displayInvoiceNumber ?? "")}
            </p>
            {invoice && (
              <>
                <p className="text-sm text-muted-foreground">
                  Status: {String(invoice.status ?? "")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Amount: ${Number(invoice.total_amount ?? 0).toFixed(2)}
                </p>
                <DownloadInvoice invoiceId={String(invoice.id ?? "")} />
              </>
            )}
          </div>
        )}

        {shippingAddr && (
          <div className="p-6">
            <h2 className="eyebrow mb-3">Shipping Address</h2>
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
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          to="/account"
          className="bg-foreground text-background py-3 px-8 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-colors text-center"
        >
          View My Orders
        </Link>
        <Link
          to="/shop"
          className="border border-border py-3 px-8 text-[11px] tracking-[0.32em] uppercase hover:border-foreground transition-colors text-center"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
