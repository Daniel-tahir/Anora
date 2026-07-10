import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  review_text: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image: string | null;
  user_id: string;
  customer_name: string;
  customer_email: string;
}

export interface ReviewsResponse {
  reviews: ReviewRow[];
  total: number;
}

export interface ReviewDetails extends ReviewRow {
  customer_avatar: string | null;
}

export interface ReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  average_rating: number | null;
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

export function useReviewsManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
  statusFilter = "",
  ratingFilter = 0,
) {
  const [result, setResult] = useState<ReviewsResponse | null>(null);
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
      if (ratingFilter) params.p_rating_filter = ratingFilter;
      const data = await rpc<ReviewsResponse>("get_reviews_management", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortBy, sortDir, statusFilter, ratingFilter]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

export function useReviewDetails(reviewId: string | null) {
  const [details, setDetails] = useState<ReviewDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!reviewId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<ReviewDetails>("get_review_details", {
        p_review_id: reviewId,
      });
      setDetails(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    load();
  }, [load]);
  return { details, loading, error, refetch: load };
}

export function useAdminReviewStats() {
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await rpc<ReviewStats>("get_review_stats");
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  return { stats, loading, error, refetch: load };
}

export async function approveReview(reviewId: string): Promise<RpcResult> {
  return rpc<RpcResult>("approve_review", { p_review_id: reviewId });
}

export async function rejectReview(reviewId: string, adminNote?: string): Promise<RpcResult> {
  return rpc<RpcResult>("reject_review", {
    p_review_id: reviewId,
    p_admin_note: adminNote ?? null,
  });
}

export async function deleteReview(reviewId: string): Promise<RpcResult> {
  return rpc<RpcResult>("delete_review", { p_review_id: reviewId });
}
