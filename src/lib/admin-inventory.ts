import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface InventoryProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  is_active: boolean;
  updated_at: string;
  category_name: string;
}

export interface InventoryProductsResponse {
  products: InventoryProductRow[];
  total: number;
}

export interface InventorySummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  overstock: number;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  product_name: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_at: string;
}

export interface InventoryAlert {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  alert_type: string;
  threshold: number;
  current_stock: number;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  previous_stock?: number;
  new_stock?: number;
}

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

export function useInventoryManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "name",
  sortDir: "asc" | "desc" = "asc",
  stockStatus = "",
  categoryId = "",
) {
  const [result, setResult] = useState<InventoryProductsResponse | null>(null);
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
      if (stockStatus) params.p_stock_status = stockStatus;
      if (categoryId) params.p_category_id = categoryId;
      const data = await rpc<InventoryProductsResponse>("get_inventory_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, stockStatus, categoryId]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useInventorySummary() {
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<InventorySummary>("get_inventory_summary");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  return { summary, loading, error, refetch: load };
}

export function useInventoryHistory(productId: string | null) {
  const [movements, setMovements] = useState<InventoryMovement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<InventoryMovement[]>("get_inventory_history", {
        p_product_id: productId,
        p_limit: 50,
      });
      setMovements(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    load();
  }, [load]);
  return { movements, loading, error, refetch: load };
}

export function useInventoryAlerts(unresolvedOnly = true) {
  const [alerts, setAlerts] = useState<InventoryAlert[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<InventoryAlert[]>("get_inventory_alerts", {
        p_unresolved_only: unresolvedOnly,
      });
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [unresolvedOnly]);

  useEffect(() => {
    load();
  }, [load]);
  return { alerts, loading, error, refetch: load };
}

export async function adjustStock(
  productId: string,
  newStock: number,
  reason?: string,
): Promise<RpcResult> {
  return rpc<RpcResult>("adjust_stock", {
    p_product_id: productId,
    p_new_stock: newStock,
    p_reason: reason || null,
  });
}

export async function addStock(
  productId: string,
  quantity: number,
  reason?: string,
): Promise<RpcResult> {
  return rpc<RpcResult>("add_stock", {
    p_product_id: productId,
    p_quantity: quantity,
    p_reason: reason || null,
  });
}

export async function removeStock(
  productId: string,
  quantity: number,
  reason?: string,
): Promise<RpcResult> {
  return rpc<RpcResult>("remove_stock", {
    p_product_id: productId,
    p_quantity: quantity,
    p_reason: reason || null,
  });
}

export async function resolveAlert(alertId: string): Promise<RpcResult> {
  return rpc<RpcResult>("resolve_alert", { p_alert_id: alertId });
}
