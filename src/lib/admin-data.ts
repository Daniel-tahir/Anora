import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface DashboardStats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundRequests: number;
  totalProducts: number;
  totalCustomers: number;
}

export interface OrderRow {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_email: string;
  total: number;
  status: string;
  created_at: string;
}

export interface OrdersResponse {
  orders: OrderRow[];
  total: number;
}

export interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
  total_orders: number;
}

export interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
}

export interface LowStockProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
}

export interface LowStockResponse {
  products: LowStockProductRow[];
  total: number;
}

export function useAdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const load = useCallback(async (isRefetch?: boolean) => {
    try {
      if (isRefetch) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [
        { count: totalOrders },
        { count: pendingOrders },
        { count: deliveredOrders },
        { count: cancelledOrders },
        { count: refundRequests },
        { count: totalProducts },
        { count: totalCustomers },
        { data: revenueData },
      ] = await Promise.all([
        supabase.from("orders").select("*", { count: "exact" }),
        supabase.from("orders").select("*", { count: "exact" }).eq("status", "pending"),
        supabase.from("orders").select("*", { count: "exact" }).eq("status", "delivered"),
        supabase.from("orders").select("*", { count: "exact" }).eq("status", "cancelled"),
        supabase.from("orders").select("*", { count: "exact" }).eq("status", "refunded"),
        supabase.from("products").select("*", { count: "exact" }).eq("is_active", true),
        supabase.from("profiles").select("*", { count: "exact" }).eq("role", "customer"),
        supabase.from("orders").select("total").eq("payment_status", "completed"),
      ]);

      const totalRevenue = revenueData?.reduce((sum, row) => sum + Number(row.total), 0) ?? 0;

      setStats({
        totalOrders: totalOrders ?? 0,
        totalRevenue,
        pendingOrders: pendingOrders ?? 0,
        deliveredOrders: deliveredOrders ?? 0,
        cancelledOrders: cancelledOrders ?? 0,
        refundRequests: refundRequests ?? 0,
        totalProducts: totalProducts ?? 0,
        totalCustomers: totalCustomers ?? 0,
      });
      setLastUpdated(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { stats, loading, refreshing, error, lastUpdated, refetch: () => load(true) };
}

export function useAdminOrders(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
) {
  const [result, setResult] = useState<OrdersResponse | null>(null);
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
          "id, order_number, total, status, payment_status, created_at, shipping_address, billing_address, user_id, email",
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

      const allowedSortColumns = new Set(["created_at", "total", "status", "order_number"]);
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

      let profileMap = new Map<string, { first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email, phone")
          .in("id", userIds);

        if (profiles) {
          profileMap = new Map(profiles.map((p) => [p.id, p]));
        }
      }

      const orders: OrderRow[] = (data ?? []).map((row: any) => {
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
        const customer_email = profile?.email || row.email || shippingAddr?.email || billingAddr?.email || "—";

        return {
          id: row.id,
          order_number: row.order_number,
          customer_name,
          customer_email,
          total: Number(row.total),
          status: row.status,
          created_at: row.created_at,
        };
      });

      setResult({ orders, total: count ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export function useAdminCustomers(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
) {
  const [result, setResult] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("profiles")
        .select("id, email, first_name, last_name, role, created_at, updated_at", {
          count: "exact",
        });

      if (search) {
        const sanitized = search.replace(/[^a-zA-Z0-9 @._-]/g, "");
        if (sanitized) {
          query = query.or(
            `email.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`,
          );
        }
      }

      const allowedSortColumns = new Set(["first_name", "created_at"]);
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

      const profileIds = (data ?? []).map((r) => r.id);
      const orderCountMap = new Map<string, number>();

      if (profileIds.length > 0) {
        const { data: orderRows } = await supabase
          .from("orders")
          .select("user_id")
          .in("user_id", profileIds);

        if (orderRows) {
          for (const o of orderRows) {
            orderCountMap.set(o.user_id, (orderCountMap.get(o.user_id) ?? 0) + 1);
          }
        }
      }

      const customers: CustomerRow[] = (data ?? []).map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        role: row.role,
        created_at: row.created_at,
        updated_at: row.updated_at,
        total_orders: orderCountMap.get(row.id) ?? 0,
      }));

      if (sortBy === "total_orders") {
        customers.sort((a, b) =>
          safeSortDir === "asc" ? a.total_orders - b.total_orders : b.total_orders - a.total_orders,
        );
      }

      setResult({ customers, total: count ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export function useAdminLowStock(page: number, pageSize: number, search = "") {
  const [result, setResult] = useState<LowStockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("products")
        .select("id, name, sku, stock", { count: "exact" })
        .eq("is_active", true)
        .lte("stock", 10);

      if (search) {
        const sanitized = search.replace(/[^a-zA-Z0-9 @._/-]/g, "");
        if (sanitized) {
          query = query.or(`name.ilike.%${sanitized}%,sku.ilike.%${sanitized}%`);
        }
      }

      const {
        data,
        error: err,
        count,
      } = await query.order("stock", { ascending: true }).range(offset, offset + pageSize - 1);

      if (err) throw err;

      const products: LowStockProductRow[] = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        stock: row.stock,
      }));

      setResult({ products, total: count ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export interface AdminProductRow {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  stock: number;
  is_active: boolean;
  created_at: string;
}

export interface AdminProductsResponse {
  products: AdminProductRow[];
  total: number;
}

export function useAdminProducts(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
) {
  const [result, setResult] = useState<AdminProductsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      let query = supabase
        .from("products")
        .select("id, name, sku, price, stock, is_active, created_at", {
          count: "exact",
        });

      if (search) {
        const sanitized = search.replace(/[^a-zA-Z0-9 @._/-]/g, "");
        if (sanitized) {
          query = query.or(`name.ilike.%${sanitized}%,sku.ilike.%${sanitized}%`);
        }
      }

      const allowedSortColumns = new Set(["name", "price", "stock", "is_active", "created_at"]);
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

      const products: AdminProductRow[] = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        sku: row.sku,
        price: Number(row.price),
        stock: row.stock,
        is_active: row.is_active,
        created_at: row.created_at,
      }));

      setResult({ products, total: count ?? 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  return { result, loading, error, refetch: load };
}

export async function createProduct(data: {
  name: string;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  category_id: string;
  is_active?: boolean;
  sizes?: string[];
  size_stock?: Record<string, number>;
}) {
  const { error } = await supabase.from("products").insert({
    name: data.name,
    slug: data.slug,
    sku: data.sku,
    price: data.price,
    stock: data.stock,
    category_id: data.category_id,
    is_active: data.is_active ?? true,
    sizes: data.sizes ?? [],
    size_stock: data.size_stock ?? {},
  });
  if (error) throw error;
}

export async function updateProduct(
  id: string,
  data: {
    name: string;
    sku: string;
    price: number;
    stock: number;
    is_active: boolean;
    sizes?: string[];
    size_stock?: Record<string, number>;
  },
) {
  const updateData: Record<string, unknown> = {
    name: data.name,
    sku: data.sku,
    price: data.price,
    stock: data.stock,
    is_active: data.is_active,
    sizes: data.sizes ?? [],
    size_stock: data.size_stock ?? {},
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("products").update(updateData).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}
