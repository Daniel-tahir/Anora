import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  registration_date: string;
  last_activity: string | null;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
  segment: "new" | "returning" | "vip";
}

export interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
}

export interface CustomerDetails {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  registration_date: string;
  last_activity: string | null;
  orders_count: number;
  total_spent: number;
  avg_order_value: number;
  last_order_at: string | null;
  segment: string;
  recent_orders: CustomerOrder[];
  addresses: CustomerAddress[];
}

export interface CustomerOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  status: string;
  total: number;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface CustomersAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  vipCustomers: number;
}

export interface RpcResult {
  success: boolean;
  error?: string;
}

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

export function useCustomersManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  segment = "",
  activity = "",
) {
  const [result, setResult] = useState<CustomersResponse | null>(null);
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
      if (segment) params.p_segment = segment;
      if (activity) params.p_activity = activity;
      const data = await rpc<CustomersResponse>("get_customers_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, segment, activity]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useCustomerDetails(userId: string | null) {
  const [details, setDetails] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<CustomerDetails>("get_customer_details", {
        p_user_id: userId,
      });
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);
  return { details, loading, error, refetch: load };
}

export function useCustomersAnalytics() {
  const [analytics, setAnalytics] = useState<CustomersAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<CustomersAnalytics>("get_customers_analytics");
      setAnalytics(data);
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
