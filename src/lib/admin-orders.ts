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
  coupon_code: string | null;
  created_at: string;
  updated_at: string;
  customer: OrderCustomer;
  shipping_address: Record<string, string> | null;
  billing_address: Record<string, string> | null;
  items: OrderItem[];
  return_requests: ReturnRequest[];
  refunds: Refund[];
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
      const params: Record<string, unknown> = {
        p_page: page,
        p_page_size: pageSize,
        p_sort_by: sortBy,
        p_sort_dir: sortDir,
      };
      if (search) params.p_search = search;
      if (status) params.p_status = status;
      if (paymentStatus) params.p_payment_status = paymentStatus;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;

      const data = await rpc<OrdersManagementResponse>("get_orders_management", params);
      setResult(data);
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
