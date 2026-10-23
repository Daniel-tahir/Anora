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
  sizes?: string[] | null;
  size_stock?: Record<string, number> | null;
  colors?: any[] | null;
  images?: string[] | null;
  variants?: Array<{
    id: string;
    product_id: string;
    name: string;
    sku: string | null;
    price: number | null;
    stock: number;
    sizes: string[] | null;
    size_stock: Record<string, number> | null;
    color_hex: string | null;
    is_active: boolean;
    images?: string[] | null;
  }> | null;
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

import { useQuery } from "@tanstack/react-query";

export function useInventoryManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "name",
  sortDir: "asc" | "desc" = "asc",
  stockStatus = "",
  categoryId = "",
) {
  const query = useQuery({
    queryKey: ["admin-inventory", page, pageSize, search, sortBy, sortDir, stockStatus, categoryId],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(`
          id, name, sku, stock, is_active, updated_at, sizes, size_stock, colors,
          categories (name),
          product_images (image_url, sort_order, variant_id),
          product_variants (id, product_id, name, sku, price, stock, sizes, size_stock, color_hex, is_active)
        `, { count: "exact" });

      if (search) {
        q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);
      }
      if (categoryId) {
        q = q.eq("category_id", categoryId);
      }
      if (stockStatus === "low") {
        q = q.gt("stock", 0).lte("stock", 10);
      } else if (stockStatus === "out") {
        q = q.eq("stock", 0);
      } else if (stockStatus === "overstock") {
        q = q.gt("stock", 100);
      }

      if (sortBy === "stock") {
        q = q.order("stock", { ascending: sortDir === "asc" });
      } else if (sortBy === "updated_at") {
        q = q.order("updated_at", { ascending: sortDir === "asc" });
      } else {
        q = q.order("name", { ascending: sortDir === "asc" });
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      q = q.range(from, to);

      const { data, count, error } = await q;
      if (error) throw error;

      const productsMapped = (data || []).map((p: any) => {
        const category_name = (p.categories as any)?.name || "Uncategorized";
        const baseImages = (p.product_images || [])
          .filter((img: any) => !img.variant_id)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((img: any) => img.image_url);

        const variantsMapped = (p.product_variants || []).map((pv: any) => {
          const varImages = (p.product_images || [])
            .filter((img: any) => img.variant_id === pv.id)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((img: any) => img.image_url);

          return {
            ...pv,
            images: varImages.length > 0 ? varImages : baseImages,
          };
        });

        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          stock: p.stock,
          is_active: p.is_active,
          updated_at: p.updated_at,
          sizes: p.sizes,
          size_stock: p.size_stock,
          colors: p.colors,
          images: baseImages,
          category_name,
          variants: variantsMapped,
        };
      });

      return {
        products: productsMapped,
        total: count || 0,
      };
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  return {
    result: query.data || null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
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
