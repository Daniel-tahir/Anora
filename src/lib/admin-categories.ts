import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  product_count: number;
  parent_id: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  parent_name: string | null;
}

export interface CategoriesResponse {
  categories: CategoryRow[];
  total: number;
}

export interface RpcResult {
  success: boolean;
  error?: string;
  id?: string;
}

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data as T;
}

export function useCategoriesManagement(
  page: number,
  pageSize: number,
  search = "",
  sortBy = "name",
  sortDir: "asc" | "desc" = "asc",
) {
  const [result, setResult] = useState<CategoriesResponse | null>(null);
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
      const data = await rpc<CategoriesResponse>("get_categories_management", params);
      setResult(data);
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

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCategory(
  name: string,
  slug: string,
  parentId?: string | null,
  description?: string | null,
  imageUrl?: string | null,
  sortOrder?: number,
  isActive?: boolean,
): Promise<RpcResult> {
  return rpc<RpcResult>("create_category", {
    p_name: name,
    p_slug: slug,
    p_parent_id: parentId ?? null,
    p_description: description ?? null,
    p_image_url: imageUrl ?? null,
    p_sort_order: sortOrder ?? 0,
    p_is_active: isActive ?? true,
  });
}

export async function updateCategory(
  id: string,
  name: string,
  slug: string,
  parentId?: string | null,
  description?: string | null,
  imageUrl?: string | null,
  sortOrder?: number,
  isActive?: boolean,
): Promise<RpcResult> {
  return rpc<RpcResult>("update_category", {
    p_id: id,
    p_name: name,
    p_slug: slug,
    p_parent_id: parentId ?? null,
    p_description: description ?? null,
    p_image_url: imageUrl ?? null,
    p_sort_order: sortOrder ?? 0,
    p_is_active: isActive ?? true,
  });
}

export async function deleteCategory(id: string): Promise<RpcResult> {
  return rpc<RpcResult>("delete_category", { p_id: id });
}

export interface ParentCategoryOption {
  id: string;
  name: string;
  slug: string;
}

export async function getParentCategories(): Promise<ParentCategoryOption[]> {
  return rpc<ParentCategoryOption[]>("get_parent_categories");
}
