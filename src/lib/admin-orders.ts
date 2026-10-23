import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface OrderManagementRow {
  id: string;
  order_number: string | null;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_email: string;
  item_count: number;
}

export interface OrdersManagementResponse {
  orders: OrderManagementRow[];
  total: number;
}

export interface OrderCustomer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
}

export interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  quantity: number;
  total: number;
  image_url: string | null;
}

export interface ReturnRequest {
  id: string;
  order_item_id: string | null;
  reason: string;
  status: string;
  requested_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  admin_notes: string | null;
}

export interface Refund {
  id: string;
  amount: number;
  reason: string | null;
  status: string;
  requested_at: string;
  processed_at: string | null;
}

export interface StatusHistoryEntry {
  id: string;
  previous_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
}

export interface OrderDetails {
  id: string;
  order_number: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  shipping_cost: number;
  discount: number;
  total: number;
  notes: string | null;
  internal_notes: string | null;
  coupon_code: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  customer: OrderCustomer;
  shipping_address: Record<string, string> | null;
  billing_address: Record<string, string> | null;
  items: OrderItem[];
  return_requests: ReturnRequest[];
  refunds: Refund[];
  status_history: StatusHistoryEntry[];
}

export interface OrderDetailsResponse {
  order: OrderDetails;
}

export interface OrderMetrics {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  returnedOrders: number;
  refundedOrders: number;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useOrderMetrics() {
  const [metrics, setMetrics] = useState<OrderMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<OrderMetrics>("get_order_metrics");
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { metrics, loading, error, refetch: load };
}

export function useOrdersManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  status = "",
  paymentStatus = "",
  dateFrom = "",
  dateTo = "",
) {
  const [result, setResult] = useState<OrdersManagementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("orders")
        .select(
          "id, order_number, total, status, payment_status, payment_method, created_at, updated_at, shipping_address, billing_address, user_id, email, order_items(id)",
          {
            count: "exact",
          },
        );

      if (search) {
        const sanitized = search.replace(/[^a-zA-Z0-9 @._-]/g, "");
        if (sanitized) {
          query = query.or(
            `order_number.ilike.%${sanitized}%,email.ilike.%${sanitized}%,shipping_address->>firstName.ilike.%${sanitized}%,shipping_address->>lastName.ilike.%${sanitized}%`,
          );
        }
      }

      if (status) {
        query = query.eq("status", status);
      }

      if (paymentStatus) {
        query = query.eq("payment_status", paymentStatus);
      }

      if (dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      }

      if (dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
      }

      const allowedSortColumns = new Set([
        "created_at",
        "total",
        "status",
        "payment_status",
        "order_number",
      ]);
      const safeSortBy = allowedSortColumns.has(sortBy) ? sortBy : "created_at";
      const safeSortDir = sortDir === "asc" ? "asc" : "desc";

      const {
        data,
        error: err,
        count,
      } = await query
        .order(safeSortBy, { ascending: safeSortDir === "asc" })
        .range(offset, offset + pageSize - 1);

      if (err) throw err;

      const userIds = [
        ...new Set(
          (data ?? [])
            .map((order: any) => order.user_id)
            .filter(Boolean),
        ),
      ];

      let profileMap = new Map<
        string,
        {
          first_name?: string | null;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
        }
      >();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone")
          .in("id", userIds);

        if (profiles) {
          profileMap = new Map(profiles.map((p) => [p.id, p]));
        }
      }

      const orders: OrderManagementRow[] = (data ?? []).map((row: any) => {
        const shippingAddr =
          typeof row.shipping_address === "object" && row.shipping_address !== null
            ? (row.shipping_address as Record<string, string>)
            : {};
        const billingAddr =
          typeof row.billing_address === "object" && row.billing_address !== null
            ? (row.billing_address as Record<string, string>)
            : {};
        const profile = row.user_id ? profileMap.get(row.user_id) : null;

        const firstName =
          profile?.first_name ||
          shippingAddr?.firstName ||
          shippingAddr?.first_name ||
          billingAddr?.firstName ||
          billingAddr?.first_name ||
          "";

        const lastName =
          profile?.last_name ||
          shippingAddr?.lastName ||
          shippingAddr?.last_name ||
          billingAddr?.lastName ||
          billingAddr?.last_name ||
          "";

        const customer_name = [firstName, lastName].filter(Boolean).join(" ") || "—";
        const customer_email =
          profile?.email || row.email || shippingAddr?.email || billingAddr?.email || "—";
        const itemCount = Array.isArray(row.order_items) ? row.order_items.length : 0;

        return {
          id: row.id,
          order_number: row.order_number,
          customer_name,
          customer_email,
          total: Number(row.total ?? 0),
          status: row.status,
          payment_status: row.payment_status,
          payment_method: row.payment_method ?? null,
          created_at: row.created_at,
          updated_at: row.updated_at ?? row.created_at,
          item_count: itemCount,
        };
      });

      setResult({ orders, total: count ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, status, paymentStatus, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export function useOrderDetails(orderId: string | null) {
  const [details, setDetails] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<OrderDetailsResponse>("get_order_details", {
        p_order_id: orderId,
      });
      setDetails(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  return { details, loading, error, refetch: load };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export async function updateOrderStatus(orderId: string, status: string): Promise<RpcResult> {
  return rpc<RpcResult>("update_order_status", {
    p_order_id: orderId,
    p_status: status,
  });
}

export async function createReturnRequest(
  orderId: string,
  reason: string,
  orderItemId?: string,
): Promise<RpcResult> {
  const params: Record<string, unknown> = {
    p_order_id: orderId,
    p_reason: reason,
  };
  if (orderItemId) params.p_order_item_id = orderItemId;
  return rpc<RpcResult>("create_return_request", params);
}

export async function processReturn(
  returnId: string,
  status: string,
  adminNotes?: string,
): Promise<RpcResult> {
  const params: Record<string, unknown> = {
    p_return_id: returnId,
    p_status: status,
  };
  if (adminNotes) params.p_admin_notes = adminNotes;
  return rpc<RpcResult>("process_return", params);
}

export async function createRefund(
  orderId: string,
  amount: number,
  reason?: string,
): Promise<RpcResult> {
  const params: Record<string, unknown> = {
    p_order_id: orderId,
    p_amount: amount,
  };
  if (reason) params.p_reason = reason;
  return rpc<RpcResult>("create_refund", params);
}

export async function processRefund(refundId: string, status: string): Promise<RpcResult> {
  return rpc<RpcResult>("process_refund", {
    p_refund_id: refundId,
    p_status: status,
  });
}

export async function cancelOrder(
  orderId: string,
  reason: string,
  cancelledBy: "customer" | "admin" = "admin",
): Promise<RpcResult> {
  return rpc<RpcResult>("cancel_order", {
    p_order_id: orderId,
    p_reason: reason,
    p_cancelled_by: cancelledBy,
  });
}

export async function addInternalNote(
  orderId: string,
  note: string,
): Promise<RpcResult> {
  return rpc<RpcResult>("add_internal_note", {
    p_order_id: orderId,
    p_note: note,
  });
}

export async function requestRefund(
  orderId: string,
  reason: string,
  description?: string,
): Promise<RpcResult> {
  const params: Record<string, unknown> = {
    p_order_id: orderId,
    p_reason: reason,
  };
  if (description) params.p_description = description;
  return rpc<RpcResult>("request_refund", params);
}

export async function getOrderByTracking(
  orderNumber: string,
  email: string,
): Promise<any> {
  return rpc<any>("get_order_by_tracking", {
    p_order_number: orderNumber,
    p_email: email,
  });
}

export async function getOrderByTrackingId(
  trackingId: string,
): Promise<any> {
  return rpc<any>("get_order_by_tracking_id", {
    p_tracking_id: trackingId,
  });
}

