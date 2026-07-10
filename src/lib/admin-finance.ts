import { useState, useEffect, useCallback } from "react";
import { rpc } from "./admin-client";

export interface FinanceDashboard {
  grossRevenue: number;
  netRevenue: number;
  revenueToday: number;
  revenueThisWeek: number;
  revenueThisMonth: number;
  revenueThisYear: number;
  taxesCollected: number;
  discountsApplied: number;
  refundAmounts: number;
  averageOrderValue: number;
  totalPaidOrders: number;
  outstandingAmounts: number;
  totalInvoices: number;
  draftInvoices: number;
  issuedInvoices: number;
  paidInvoices: number;
}

export interface TrendPoint {
  date: string;
  revenue?: number;
  tax?: number;
  refund?: number;
  discount?: number;
  sales?: number;
  orders?: number;
}

export interface MonthlyComparison {
  month: number;
  revenue: number;
  previousRevenue: number;
}

export function useFinanceDashboard() {
  const [data, setData] = useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<FinanceDashboard>("get_finance_dashboard");
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

function useTrendQuery(rpcName: string, startDate?: string, endDate?: string) {
  const [data, setData] = useState<TrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {};
      if (startDate) params.p_start_date = startDate;
      if (endDate) params.p_end_date = endDate;
      const result = await rpc<TrendPoint[]>(rpcName, params);
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [rpcName, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading };
}

export function useRevenueTrend(startDate?: string, endDate?: string) {
  return useTrendQuery("get_revenue_trend", startDate, endDate);
}

export function useTaxTrend(startDate?: string, endDate?: string) {
  return useTrendQuery("get_tax_trend", startDate, endDate);
}

export function useRefundTrend(startDate?: string, endDate?: string) {
  return useTrendQuery("get_refund_trend", startDate, endDate);
}

export function useDiscountTrend(startDate?: string, endDate?: string) {
  return useTrendQuery("get_discount_trend", startDate, endDate);
}

export function useMonthlyComparison(year?: number) {
  const [data, setData] = useState<MonthlyComparison[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, unknown> = {};
      if (year) params.p_year = year;
      const result = await rpc<MonthlyComparison[]>("get_monthly_comparison", params);
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading };
}

export function useYearlyComparison() {
  const [data, setData] = useState<TrendPoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await rpc<TrendPoint[]>("get_yearly_comparison");
      setData(result);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading };
}
