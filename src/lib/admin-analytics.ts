import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  totalRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  totalCategories: number;
}

export interface SalesDataPoint {
  date: string;
  sales: number;
  orders: number;
}

export interface RevenueAnalytics {
  current: number;
  previous: number;
  change: number;
  trend: { date: string; sales: number }[];
}

export interface OrdersByStatusItem {
  status: string;
  count: number;
}

export interface OrdersByCategoryItem {
  category: string;
  count: number;
}

export interface CustomerAnalytics {
  newCustomers: number;
  returningCustomers: number;
}

export interface ProductSalesItem {
  name: string;
  orders: number;
  revenue: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useAnalyticsSummary() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<AnalyticsSummary>("get_analytics_summary");
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

export function useSalesAnalytics(period: "daily" | "weekly" | "monthly" | "yearly" = "daily") {
  const [data, setData] = useState<SalesDataPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<SalesDataPoint[]>("get_sales_analytics", {
        p_period: period,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export function useRevenueAnalytics() {
  const [analytics, setAnalytics] = useState<RevenueAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<RevenueAnalytics>("get_revenue_analytics");
      setAnalytics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { analytics, loading, error, refetch: load };
}

export function useOrdersByStatus() {
  const [data, setData] = useState<OrdersByStatusItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<OrdersByStatusItem[]>("get_orders_by_status_distribution");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export function useOrdersByCategory() {
  const [data, setData] = useState<OrdersByCategoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<OrdersByCategoryItem[]>("get_orders_by_category_distribution");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export function useCustomerAnalytics() {
  const [analytics, setAnalytics] = useState<CustomerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<CustomerAnalytics>("get_customer_analytics");
      setAnalytics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { analytics, loading, error, refetch: load };
}

export function useTopSellingProducts() {
  const [data, setData] = useState<ProductSalesItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<ProductSalesItem[]>("get_top_selling_products", {
        p_limit: 10,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}

export function useBottomSellingProducts() {
  const [data, setData] = useState<ProductSalesItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<ProductSalesItem[]>("get_bottom_selling_products", {
        p_limit: 10,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refetch: load };
}
