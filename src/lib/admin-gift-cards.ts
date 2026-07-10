import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface GiftCardRow {
  id: string;
  code: string;
  initial_balance: number;
  current_balance: number;
  status: "active" | "inactive" | "expired" | "depleted";
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  usage_count: number;
}

export interface GiftCardsResponse {
  gift_cards: GiftCardRow[];
  total: number;
}

export interface GiftCardAnalytics {
  total_gift_cards: number;
  active_gift_cards: number;
  inactive_gift_cards: number;
  expired_gift_cards: number;
  depleted_gift_cards: number;
  outstanding_balance: number;
  total_issued: number;
  total_redeemed: number;
  total_transactions: number;
}

export interface GiftCardTransaction {
  id: string;
  gift_card_id: string;
  order_id: string | null;
  transaction_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

export interface GiftCardDetails {
  id: string;
  code: string;
  initial_balance: number;
  current_balance: number;
  status: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  transactions: GiftCardTransaction[];
  usage_count: number;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
  code?: string;
  status?: string;
  amount_redeemed?: number;
  balance_before?: number;
  balance_after?: number;
}

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

export function useGiftCardsManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  statusFilter = "",
) {
  const [result, setResult] = useState<GiftCardsResponse | null>(null);
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
      const data = await rpc<GiftCardsResponse>("get_gift_cards_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useGiftCardDetails(giftCardId: string | null) {
  const [details, setDetails] = useState<GiftCardDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!giftCardId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<GiftCardDetails>("get_gift_card_details", {
        p_gift_card_id: giftCardId,
      });
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [giftCardId]);

  useEffect(() => {
    load();
  }, [load]);
  return { details, loading, error, refetch: load };
}

export function useGiftCardAnalytics() {
  const [data, setData] = useState<GiftCardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<GiftCardAnalytics>("get_gift_card_analytics");
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

export async function createGiftCard(params: {
  p_initial_balance: number;
  p_expires_at?: string;
  p_notes?: string;
}): Promise<RpcResult> {
  return rpc<RpcResult>("create_gift_card", params);
}

export async function toggleGiftCardStatus(giftCardId: string): Promise<RpcResult> {
  return rpc<RpcResult>("toggle_gift_card_status", { p_gift_card_id: giftCardId });
}

export async function redeemGiftCard(params: {
  p_gift_card_id: string;
  p_amount: number;
  p_order_id?: string;
}): Promise<RpcResult> {
  return rpc<RpcResult>("redeem_gift_card", params);
}
