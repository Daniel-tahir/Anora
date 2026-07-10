import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  maximum_discount_amount: number | null;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  total_discounted: number;
}

export interface CouponsResponse {
  coupons: CouponRow[];
  total: number;
}

export interface CouponAnalytics {
  total_coupons: number;
  active_coupons: number;
  expired_coupons: number;
  inactive_coupons: number;
  exhausted_coupons: number;
  total_redemptions: number;
  total_discounted: number;
  percentage_coupons: number;
  fixed_coupons: number;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
  is_active?: boolean;
}

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

export function useCouponsManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  statusFilter = "",
  typeFilter = "",
) {
  const [result, setResult] = useState<CouponsResponse | null>(null);
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
      if (typeFilter) params.p_type_filter = typeFilter;
      const data = await rpc<CouponsResponse>("get_coupons_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, statusFilter, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useCouponAnalytics() {
  const [data, setData] = useState<CouponAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<CouponAnalytics>("get_coupon_analytics");
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

export async function createCoupon(params: {
  p_code: string;
  p_description?: string;
  p_discount_type: string;
  p_discount_value: number;
  p_min_order?: number;
  p_max_uses?: number;
  p_maximum_discount_amount?: number;
  p_starts_at?: string;
  p_expires_at?: string;
}): Promise<RpcResult> {
  return rpc<RpcResult>("create_coupon", params);
}

export async function updateCoupon(params: {
  p_id: string;
  p_code?: string;
  p_description?: string;
  p_discount_type?: string;
  p_discount_value?: number;
  p_min_order?: number;
  p_max_uses?: number;
  p_maximum_discount_amount?: number;
  p_starts_at?: string;
  p_expires_at?: string;
  p_is_active?: boolean;
}): Promise<RpcResult> {
  return rpc<RpcResult>("update_coupon", params);
}

export async function deleteCoupon(couponId: string): Promise<RpcResult> {
  return rpc<RpcResult>("delete_coupon", { p_coupon_id: couponId });
}

export async function toggleCouponStatus(couponId: string): Promise<RpcResult> {
  return rpc<RpcResult>("toggle_coupon_status", { p_coupon_id: couponId });
}
