import { useState, useEffect, useCallback } from "react";
import { rpc } from "./admin-client";

export interface SalesReportRow {
  date: string;
  grossRevenue: number;
  netRevenue: number;
  discounts: number;
  taxes: number;
  orders: number;
}

export interface RevenueReport {
  totalGrossRevenue: number;
  totalNetRevenue: number;
  totalTaxes: number;
  totalDiscounts: number;
  totalOrders: number;
  daily: SalesReportRow[];
}

export interface FinancialReportRow {
  date: string;
  taxes: number;
  discounts: number;
  refunds: number;
}

export interface FinancialReport {
  totalTaxes: number;
  totalDiscounts: number;
  totalRefunds: number;
  daily: FinancialReportRow[];
}

export interface CustomerReport {
  newCustomers: number;
  returningCustomers: number;
  vipCustomers: number;
  totalCustomers: number;
  averageLifetimeValue: number;
}

export interface InventoryReport {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalStockValue: number;
  recentMovements: number;
}

export function useRevenueReport(startDate?: string, endDate?: string) {
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = {};
      if (startDate) params.p_start_date = startDate;
      if (endDate) params.p_end_date = endDate;
      const result = await rpc<RevenueReport>("get_revenue_report", params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, refetch: load };
}

export function useFinancialReport(startDate?: string, endDate?: string) {
  const [data, setData] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = {};
      if (startDate) params.p_start_date = startDate;
      if (endDate) params.p_end_date = endDate;
      const result = await rpc<FinancialReport>("get_financial_report", params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, refetch: load };
}

export function useCustomerReport(startDate?: string, endDate?: string) {
  const [data, setData] = useState<CustomerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = {};
      if (startDate) params.p_start_date = startDate;
      if (endDate) params.p_end_date = endDate;
      const result = await rpc<CustomerReport>("get_customer_report", params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, refetch: load };
}

export function useInventoryReport() {
  const [data, setData] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<InventoryReport>("get_inventory_report");
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

export async function fetchExportData(
  dataType: string,
  startDate?: string,
  endDate?: string,
): Promise<any[]> {
  const params: Record<string, unknown> = { p_data_type: dataType };
  if (startDate) params.p_start_date = startDate;
  if (endDate) params.p_end_date = endDate;
  return rpc<any[]>("get_export_data", params);
}
