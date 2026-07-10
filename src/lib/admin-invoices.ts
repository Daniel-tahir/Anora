import { useState, useEffect, useCallback } from "react";
import { rpc, type RpcResult } from "./admin-client";

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: string;
  issued_at: string | null;
  created_at: string;
  order_number: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  shipping_amount: number;
}

export interface InvoicesResponse {
  invoices: InvoiceRow[];
  total: number;
}

export interface InvoiceItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface InvoiceDetails {
  invoice: InvoiceRow;
  items: InvoiceItem[];
  order: any;
  customer: any;
}

export function useInvoicesManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  statusFilter = "",
  dateFrom = "",
  dateTo = "",
) {
  const [result, setResult] = useState<InvoicesResponse | null>(null);
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
      if (statusFilter) params.p_status_filter = statusFilter;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      const data = await rpc<InvoicesResponse>("get_invoices_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useInvoiceDetails(invoiceId: string | null) {
  const [data, setData] = useState<InvoiceDetails | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!invoiceId) {
      setData(null);
      return;
    }
    try {
      setLoading(true);
      const result = await rpc<InvoiceDetails>("get_invoice_details", { p_invoice_id: invoiceId });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading };
}

export async function generateInvoice(orderId: string): Promise<RpcResult> {
  return rpc<RpcResult>("generate_invoice", { p_order_id: orderId });
}

export async function updateInvoiceStatus(invoiceId: string, status: string): Promise<RpcResult> {
  return rpc<RpcResult>("update_invoice_status", { p_invoice_id: invoiceId, p_status: status });
}

export async function sendInvoiceEmail(
  invoiceId: string,
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const functionUrl = `${baseUrl}/functions/v1/send-invoice`;

  const res = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });
  return res.json();
}
