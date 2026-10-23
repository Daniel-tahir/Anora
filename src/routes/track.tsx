import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getOrderByTracking, getOrderByTrackingId } from "@/lib/admin-orders";
import { formatAddress } from "@/lib/payments";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import Lottie from "lottie-react";
import {
  Package,
  CheckCircle,
  Truck,
  ArrowLeft,
  AlertTriangle,
  Search,
  Mail,
  ClipboardList,
} from "lucide-react";

// ESM/CJS interop helper for lottie-react
const LottieComponent = (Lottie as any).default || Lottie;


// ─── LOTTIE MINIMAL ANIMATIONS ──────────────────────────────────────────────
// Golden ratio minimal animations crafted as JSON configurations.

const processingAnimation = {
  v: "5.5.7",
  fr: 60,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "Processing",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Ring",
      sr: 1,
      ks: {
        o: { a: 0, k: 100, ix: 11 },
        r: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [360] },
            { t: 60 }
          ],
          ix: 10
        },
        p: { a: 0, k: [50, 50, 0], ix: 2 },
        a: { a: 0, k: [0, 0, 0], ix: 1 },
        s: { a: 0, k: [100, 100, 100], ix: 6 }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              d: 1,
              ty: "el",
              s: { a: 0, k: [40, 40], ix: 2 },
              p: { a: 0, k: [0, 0], ix: 3 },
              nm: "Circle Path",
              mn: "ADBE Vector Shape - Ellipse"
            },
            {
              ty: "st",
              c: { a: 0, k: [0.76, 0.60, 0.42, 1], ix: 3 },
              o: { a: 0, k: 100, ix: 4 },
              w: { a: 0, k: 2, ix: 5 },
              lc: 2,
              lj: 2,
              nm: "Stroke",
              mn: "ADBE Vector Graphic - Stroke"
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0], ix: 2 },
              a: { a: 0, k: [0, 0], ix: 1 },
              s: { a: 0, k: [100, 100], ix: 3 },
              r: { a: 0, k: 0, ix: 6 },
              o: { a: 0, k: 100, ix: 7 },
              sk: { a: 0, k: 0, ix: 8 },
              sa: { a: 0, k: 0, ix: 9 },
              nm: "Transform"
            }
          ],
          nm: "Ellipse Group",
          np: 3,
          cix: 2,
          bm: 0,
          sr: 1,
          mn: "ADBE Vector Group"
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ]
};

const packedAnimation = {
  v: "5.5.7",
  fr: 60,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "Packed",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Box",
      sr: 1,
      ks: {
        o: { a: 0, k: 100, ix: 11 },
        r: { a: 0, k: 0, ix: 10 },
        p: { a: 0, k: [50, 50, 0], ix: 2 },
        a: { a: 0, k: [0, 0, 0], ix: 1 },
        s: {
          a: 1,
          k: [
            { t: 0, s: [90, 90, 100], e: [105, 105, 100] },
            { t: 30, s: [105, 105, 100], e: [90, 90, 100] },
            { t: 60 }
          ],
          ix: 6
        }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              ty: "rc",
              s: { a: 0, k: [40, 40], ix: 2 },
              p: { a: 0, k: [0, 0], ix: 3 },
              r: { a: 0, k: 4, ix: 4 },
              nm: "Rectangle Path",
              mn: "ADBE Vector Shape - Rect"
            },
            {
              ty: "st",
              c: { a: 0, k: [0.76, 0.60, 0.42, 1], ix: 3 },
              o: { a: 0, k: 100, ix: 4 },
              w: { a: 0, k: 2, ix: 5 },
              lc: 2,
              lj: 2,
              nm: "Stroke",
              mn: "ADBE Vector Graphic - Stroke"
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0], ix: 2 },
              a: { a: 0, k: [0, 0], ix: 1 },
              s: { a: 0, k: [100, 100], ix: 3 },
              r: { a: 0, k: 0, ix: 6 },
              o: { a: 0, k: 100, ix: 7 },
              sk: { a: 0, k: 0, ix: 8 },
              sa: { a: 0, k: 0, ix: 9 },
              nm: "Transform"
            }
          ],
          nm: "Rect Group",
          np: 3,
          cix: 2,
          bm: 0,
          sr: 1,
          mn: "ADBE Vector Group"
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ]
};

const shippingAnimation = {
  v: "5.5.7",
  fr: 60,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "Shipping",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Truck",
      sr: 1,
      ks: {
        o: { a: 0, k: 100, ix: 11 },
        r: { a: 0, k: 0, ix: 10 },
        p: {
          a: 1,
          k: [
            { t: 0, s: [10, 50, 0], e: [90, 50, 0] },
            { t: 60 }
          ],
          ix: 2
        },
        a: { a: 0, k: [0, 0, 0], ix: 1 },
        s: { a: 0, k: [100, 100, 100], ix: 6 }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              ty: "rc",
              s: { a: 0, k: [30, 15], ix: 2 },
              p: { a: 0, k: [-5, 0], ix: 3 },
              r: { a: 0, k: 2, ix: 4 },
              nm: "Body",
              mn: "ADBE Vector Shape - Rect"
            },
            {
              ty: "rc",
              s: { a: 0, k: [10, 10], ix: 2 },
              p: { a: 0, k: [15, 2.5], ix: 3 },
              r: { a: 0, k: 1, ix: 4 },
              nm: "Cab",
              mn: "ADBE Vector Shape - Rect"
            },
            {
              ty: "st",
              c: { a: 0, k: [0.76, 0.60, 0.42, 1], ix: 3 },
              o: { a: 0, k: 100, ix: 4 },
              w: { a: 0, k: 2, ix: 5 },
              lc: 2,
              lj: 2,
              nm: "Stroke",
              mn: "ADBE Vector Graphic - Stroke"
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0], ix: 2 },
              a: { a: 0, k: [0, 0], ix: 1 },
              s: { a: 0, k: [100, 100], ix: 3 },
              r: { a: 0, k: 0, ix: 6 },
              o: { a: 0, k: 100, ix: 7 },
              sk: { a: 0, k: 0, ix: 8 },
              sa: { a: 0, k: 0, ix: 9 },
              nm: "Transform"
            }
          ],
          nm: "Truck Group",
          np: 4,
          cix: 2,
          bm: 0,
          sr: 1,
          mn: "ADBE Vector Group"
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ]
};

const deliveredAnimation = {
  v: "5.5.7",
  fr: 60,
  ip: 0,
  op: 60,
  w: 100,
  h: 100,
  nm: "Delivered",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Check",
      sr: 1,
      ks: {
        o: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [100] },
            { t: 20 },
            { t: 60 }
          ],
          ix: 11
        },
        r: { a: 0, k: 0, ix: 10 },
        p: { a: 0, k: [50, 50, 0], ix: 2 },
        a: { a: 0, k: [0, 0, 0], ix: 1 },
        s: {
          a: 1,
          k: [
            { t: 0, s: [80, 80, 100], e: [100, 100, 100] },
            { t: 20 },
            { t: 60 }
          ],
          ix: 6
        }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              ty: "sh",
              ks: {
                a: 0,
                k: {
                  i: [[0, 0], [0, 0], [0, 0]],
                  o: [[0, 0], [0, 0], [0, 0]],
                  v: [[-15, 0], [-5, 10], [15, -10]],
                  c: false
                },
                ix: 2
              },
              nm: "Path",
              mn: "ADBE Vector Shape - Group"
            },
            {
              ty: "st",
              c: { a: 0, k: [0.76, 0.60, 0.42, 1], ix: 3 },
              o: { a: 0, k: 100, ix: 4 },
              w: { a: 0, k: 2, ix: 5 },
              lc: 2,
              lj: 2,
              nm: "Stroke",
              mn: "ADBE Vector Graphic - Stroke"
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0], ix: 2 },
              a: { a: 0, k: [0, 0], ix: 1 },
              s: { a: 0, k: [100, 100], ix: 3 },
              r: { a: 0, k: 0, ix: 6 },
              o: { a: 0, k: 100, ix: 7 },
              sk: { a: 0, k: 0, ix: 8 },
              sa: { a: 0, k: 0, ix: 9 },
              nm: "Transform"
            }
          ],
          nm: "Check Group",
          np: 3,
          cix: 2,
          bm: 0,
          sr: 1,
          mn: "ADBE Vector Group"
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ]
};

// ─── ROUTE DEFINITION ───────────────────────────────────────────────────────

export const Route = createFileRoute("/track")({
  validateSearch: (search: Record<string, string | undefined>): {
    orderNumber?: string;
    tracking?: string;
  } => ({
    orderNumber: search.orderNumber,
    tracking: search.tracking,
  }),
  head: () => ({
    meta: [
      { title: "Track Order — ANORA" },
      {
        name: "description",
        content: "Track your ANORA premium order status and timeline in real-time.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrackPage,
});

const TIMELINE_STEPS = [
  {
    key: "confirmed",
    title: "Confirmed",
    description: "Your order has been confirmed.",
    statuses: ["pending", "confirmed"],
  },
  {
    key: "processing",
    title: "Processing",
    description: "Your items are currently being prepared.",
    statuses: ["processing"],
  },
  {
    key: "packed",
    title: "Packed",
    description: "Your order has been packed and is ready for shipment.",
    statuses: ["packed"],
  },
  {
    key: "shipped",
    title: "Shipped",
    description: "Your package has left our warehouse.",
    statuses: ["shipped", "out_for_delivery"],
  },
  {
    key: "delivered",
    title: "Delivered",
    description: "Your order has been successfully delivered.",
    statuses: ["delivered"],
  },
];

const CopyTrackingButton = ({ trackingId }: { trackingId: string }) => {
  const [copied, setCopied] = useState(false);

  const fallbackCopy = () => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = trackingId;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (successful) {
        setCopied(true);
        toast.success("Tracking ID copied to clipboard");
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.error("Could not copy tracking ID");
      }
    } catch {
      toast.error("Could not copy tracking ID");
    }
  };

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(trackingId)
        .then(() => {
          setCopied(true);
          toast.success("Tracking ID copied to clipboard");
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          fallbackCopy();
        });
    } else {
      fallbackCopy();
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-[11px] font-sans font-semibold tracking-[0.08em] uppercase"
      title="Copy Tracking ID"
    >
      <span>{copied ? "Copied ✓" : "Copy"}</span>
    </button>
  );
};

function TrackPage() {
  const { orderNumber: searchOrderNumber, tracking: searchTracking } = Route.useSearch();
  const { user } = useAuth();
  
  const [orderNumberInput, setOrderNumberInput] = useState(searchOrderNumber ?? "");
  const [emailInput, setEmailInput] = useState("");
  const [trackingInput, setTrackingInput] = useState(searchTracking ?? "");
  
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [submittedOrderNumber, setSubmittedOrderNumber] = useState(searchOrderNumber ?? "");
  const [submittedTrackingId, setSubmittedTrackingId] = useState(searchTracking ?? "");
  
  const [isSearching, setIsSearching] = useState(false);

  // TanStack Query to fetch order data
  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ["order-tracking", submittedOrderNumber, submittedEmail, submittedTrackingId, !!user],
    queryFn: async () => {
      // 1. Try secure tracking by Tracking ID (guest/email-free)
      if (submittedTrackingId) {
        const data = await getOrderByTrackingId(submittedTrackingId);
        if (!data) {
          throw new Error("No order found with the provided Tracking ID.");
        }
        return data;
      }

      // 2. Try order number if submitted
      if (submittedOrderNumber) {
        // 2a. Try logged-in fetch if authenticated
        if (user) {
          const { data, error: fetchErr } = await supabase
            .from("orders")
            .select(`
              id, order_number, status, subtotal, total, payment_status, payment_method,
              shipping_address, billing_address, created_at, updated_at, user_id,
              order_items ( id, name, price, quantity, image_url, attributes ),
              order_status_history ( id, previous_status, new_status, note, created_at )
            `)
            .eq("order_number", submittedOrderNumber)
            .maybeSingle();

          if (fetchErr) throw fetchErr;
          if (data) return data;
        }

        // 2b. Fallback to RPC tracking (email verification lookup)
        if (submittedEmail) {
          const data = await getOrderByTracking(submittedOrderNumber, submittedEmail);
          if (!data) {
            throw new Error("No order found with the provided details. Please verify your order number and email.");
          }
          return data;
        }

        throw new Error("Please enter your billing email address to trace this order.");
      }

      return null;
    },
    enabled: !!submittedTrackingId || (!!submittedOrderNumber && (!!user || !!submittedEmail)),
    retry: false,
  });

  // Realtime updates subscription
  useEffect(() => {
    if (!order || !(order as any).id) return;
    const orderId = (order as any).id;

    const channel = supabase
      .channel(`order-updates-tracking-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => {
          refetch();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_status_history", filter: `order_id=eq.${orderId}` },
        () => {
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [order, refetch]);

  // Sync state if search parameter changes
  useEffect(() => {
    if (searchOrderNumber) {
      setOrderNumberInput(searchOrderNumber);
      setSubmittedOrderNumber(searchOrderNumber);
    }
    if (searchTracking) {
      setTrackingInput(searchTracking);
      setSubmittedTrackingId(searchTracking);
    }
  }, [searchOrderNumber, searchTracking]);

  const handleTrackingLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingInput.trim()) {
      toast.error("Please enter a valid Tracking ID");
      return;
    }
    setIsSearching(true);
    setSubmittedTrackingId(trackingInput.trim().toUpperCase());
  };

  const handleResetSearch = () => {
    setOrderNumberInput("");
    setEmailInput("");
    setTrackingInput("");
    setSubmittedEmail("");
    setSubmittedOrderNumber("");
    setSubmittedTrackingId("");
    setIsSearching(false);
  };

  // Determine active status step index in the timeline
  const getActiveStepIndex = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === "pending" || s === "confirmed") return 0;
    if (s === "processing") return 1;
    if (s === "packed") return 2;
    if (s === "shipped" || s === "out_for_delivery") return 3;
    if (s === "delivered") return 4;
    return 0;
  };

  const getStepState = (stepIndex: number, status: string) => {
    const activeIdx = getActiveStepIndex(status);
    if (stepIndex < activeIdx) return "completed";
    if (stepIndex === activeIdx) return "active";
    return "upcoming";
  };

  const activeIndex = order ? getActiveStepIndex(order.status) : 0;


  // Compute progress value for progress bar
  const getProgressValue = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === "pending") return 10;
    if (s === "confirmed") return 20;
    if (s === "processing") return 40;
    if (s === "packed") return 60;
    if (s === "shipped") return 80;
    if (s === "out_for_delivery") return 90;
    if (s === "delivered") return 100;
    return 0;
  };

  const progressPercent = order ? getProgressValue(order.status) : 0;

  // Retrieve timestamp for each timeline step from history
  const getStepTimestamp = (stepKey: string, history: any[] = []) => {
    const stepObj = TIMELINE_STEPS.find((t) => t.key === stepKey);
    if (!stepObj) return null;

    // Search history for matching state
    const match = history
      .filter((h) => stepObj.statuses.includes(h.new_status?.toLowerCase()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (match) {
      return new Date(match.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // Fallback for first step
    if (stepKey === "confirmed" && order?.created_at) {
      return new Date(order.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    return null;
  };

  // Determine current active animation
  const getLottieAnimation = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === "pending" || s === "confirmed" || s === "processing") return processingAnimation;
    if (s === "packed") return packedAnimation;
    if (s === "shipped" || s === "out_for_delivery") return shippingAnimation;
    if (s === "delivered") return deliveredAnimation;
    return processingAnimation;
  };

  const isTerminalState = order && ["cancelled", "returned", "refunded"].includes(order.status);

  return (
    <div className="px-5 lg:px-10 py-16 max-w-4xl mx-auto min-h-[75vh] flex flex-col justify-center">
      <div className="text-center mb-12">
        <span className="eyebrow">Logistics</span>
        <h1 className="font-serif text-4xl md:text-5xl mt-3">Track Order</h1>
      </div>

      {/* SEARCH FORM VIEW */}
      {((!submittedOrderNumber && !submittedTrackingId) || (error && !isLoading)) && (
        <div className="max-w-md w-full mx-auto bg-background border border-border/60 p-8 shadow-sm">
          <form onSubmit={handleTrackingLookup} className="space-y-6">
            <div>
              <label className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-2 font-medium">
                Tracking ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Enter your Tracking ID"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  className="w-full bg-background border border-border px-4 py-3 pl-10 text-sm uppercase outline-none focus:border-foreground transition-colors"
                />
                <ClipboardList className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground/60" />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/10 p-3 text-[11px] text-red-500 tracking-wider">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error instanceof Error ? error.message : "Error searching for order"}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-foreground text-background py-3 text-[11px] tracking-[0.32em] uppercase hover:bg-gold hover:text-ink transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Search className="h-3.5 w-3.5" />
              {isLoading ? "Searching..." : "Track Order"}
            </button>
          </form>
        </div>
      )}

      {/* LOADING STATE */}
      {isLoading && (submittedOrderNumber || submittedTrackingId) && !error && (
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gold mb-4" />
          <p className="text-sm text-muted-foreground tracking-widest uppercase">Fetching Order Status...</p>
        </div>
      )}

      {/* DETAILS VIEW */}
      {order && !isLoading && !error && (
        <div className="space-y-10 animate-fade">
          <div className="flex justify-between items-center">
            <button
              onClick={handleResetSearch}
              className="inline-flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Track Another Order
            </button>

            {user && (
              <Link
                to="/account"
                className="text-[10px] tracking-[0.2em] uppercase text-gold hover:text-gold/70 transition-colors"
              >
                Back to My Account
              </Link>
            )}
          </div>

          {/* TRACKING ID HEADER CARD */}
          {order.tracking_id && (
            <div className="border border-border/60 p-6 bg-background shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade">
              <div className="flex flex-col sm:items-start items-center space-y-1">
                <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Tracking ID</span>
                <span className="font-sans font-semibold text-base tracking-[0.08em] text-foreground bg-zinc-100 dark:bg-zinc-800/80 px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-700/60 uppercase">{order.tracking_id}</span>
              </div>
              <CopyTrackingButton trackingId={order.tracking_id} />
            </div>
          )}

          {/* TERMINAL STATE BANNER */}
          {isTerminalState && (
            <div className="bg-stone-500/5 border border-stone-500/10 p-6 flex items-start gap-4">
              <AlertTriangle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-serif text-lg capitalize">Order {order.status}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This order was marked as {order.status}. If you have questions about returns or refunds, please reach out to our concierge.
                </p>
              </div>
            </div>
          )}

          {/* SUMMARY CARD */}
          <div className="border border-border/60 p-6 md:p-8 bg-background shadow-sm">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
              <div>
                <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
                  Order Number
                </p>
                <p className="font-medium text-foreground">{order.order_number}</p>
              </div>

              <div>
                <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
                  Order Date
                </p>
                <p className="font-medium text-foreground">
                  {new Date(order.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>

              <div>
                <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
                  Status
                </p>
                <span className="inline-block px-2.5 py-0.5 text-[9px] tracking-[0.2em] uppercase bg-gold/10 text-gold border border-gold/20 font-medium">
                  {order.status}
                </span>
              </div>

              {order.payment_status ? (
                <div>
                  <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
                    Payment Status
                  </p>
                  <p className="font-medium capitalize text-foreground">{order.payment_status}</p>
                </div>
              ) : order.shipping_method ? (
                <div>
                  <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-1">
                    Shipping Method
                  </p>
                  <p className="font-medium capitalize text-foreground">{order.shipping_method}</p>
                </div>
              ) : null}
            </div>

            {order.shipping_address && (
              <>
                <div className="h-px bg-border/40 my-6" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
                      Shipping Address
                    </p>
                    <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                      {formatAddress(order.shipping_address)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
                      Billing Address
                    </p>
                    <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                      {formatAddress(order.billing_address || order.shipping_address)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {order.estimated_delivery && !order.shipping_address && (
              <>
                <div className="h-px bg-border/40 my-6" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
                      Estimated Delivery
                    </p>
                    <p className="text-foreground font-medium">
                      {new Date(order.estimated_delivery).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  {order.courier && (
                    <div>
                      <p className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
                        Courier Partner
                      </p>
                      <p className="text-foreground font-medium capitalize">
                        {order.courier}
                        {order.courier_tracking_number ? ` (Tracking: ${order.courier_tracking_number})` : ""}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ORDERED PRODUCTS CARD */}
          {order.order_items && order.order_items.length > 0 && (
            <div className="border border-border/60 p-6 md:p-8 bg-background shadow-sm space-y-4">
              <h3 className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Ordered Items</h3>
              <div className="divide-y divide-border/40">
                {order.order_items.map((item: any, idx: number) => (
                  <div key={item.id || idx} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-12 h-16 object-cover border border-border/40 shrink-0"
                      />
                    )}
                    <div>
                      <h4 className="font-serif text-base text-foreground font-medium">{item.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Qty {item.quantity}
                        {item.attributes && typeof item.attributes === "object" && (
                          <>
                            {(item.attributes.size || item.attributes.Size) && ` · Size ${String(item.attributes.size || item.attributes.Size)}`}
                            {(item.attributes.color || item.attributes.Color) && ` · Color ${String(item.attributes.color || item.attributes.Color)}`}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOTTIE STATE VISUAL */}
          {!isTerminalState && (
            <div className="text-center py-6">
              <div className="w-24 h-24 mx-auto mb-2 select-none pointer-events-none">
                <LottieComponent
                  animationData={getLottieAnimation(order.status)}
                  loop={true}
                  style={{ width: "96px", height: "96px" }}
                />
              </div>
              <p className="text-[11px] tracking-[0.3em] uppercase text-gold font-medium animate-pulse">
                Order status: {order.status}
              </p>
            </div>
          )}

          {/* PROGRESS BAR */}
          {!isTerminalState && (
            <div className="space-y-2 bg-background p-6 border border-border/40">
              <div className="flex justify-between text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                <span>Journey Status</span>
                <span>{progressPercent}% Complete</span>
              </div>
              <Progress value={progressPercent} className="h-1 bg-neutral/10" />
            </div>
          )}

          {/* PREMIUM TIMELINE */}
          <div className="border border-border/60 p-6 md:p-10 bg-background shadow-sm space-y-8">
            <h3 className="font-serif text-2xl border-b border-border/40 pb-4">Activity Timeline</h3>

            <div className="relative pl-8 md:pl-10 space-y-12 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-border/60">
              {TIMELINE_STEPS.map((step, idx) => {
                const stepState = getStepState(idx, order.status);
                const stepTime = getStepTimestamp(step.key, order.order_status_history);
                const isActive = stepState === "active";
                const isCompleted = stepState === "completed";

                return (
                  <div key={step.key} className="relative group">
                    {/* Circle icon */}
                    <div
                      className={`absolute -left-[37px] md:-left-[39px] top-1.5 w-6 h-6 rounded-full border bg-background flex items-center justify-center transition-all duration-300 ${
                        isCompleted
                          ? "border-gold bg-gold text-background shadow-sm"
                          : isActive
                            ? "border-gold ring-4 ring-gold/10 text-gold shadow-md"
                            : "border-border text-muted-foreground/40"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 stroke-[2.5]" />
                      ) : isActive ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-gold animate-ping" />
                      ) : (
                        <div className="w-1 h-1 rounded-full bg-border" />
                      )}
                    </div>

                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-2">
                      <div className="space-y-1.5 max-w-xl">
                        <h4
                          className={`font-serif text-lg tracking-wide transition-colors ${
                            isCompleted || isActive ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {step.title}
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      </div>

                      {stepTime && (
                        <div className="text-[10px] tracking-wider text-muted-foreground/70 uppercase pt-1 md:text-right shrink-0">
                          {stepTime}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
