import { supabaseAdmin } from "./supabase-admin";
import { createError } from "h3";

const DEFAULT_STOCK_THRESHOLD = 5;

// ─── Auth guard ─────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

export async function verifyAdminAccess(accessToken: string): Promise<AdminUser> {
  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userResult.user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid session" });
  }

  const { data: roleRow } = await supabaseAdmin
    .from("admin_roles")
    .select("role")
    .eq("user_id", userResult.user.id)
    .single();

  if (!roleRow) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  return {
    id: userResult.user.id,
    email: userResult.user.email ?? "",
    role: roleRow.role,
  };
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

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

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabaseAdmin.rpc("get_admin_dashboard_stats");
  if (error || !data) {
    const fallback = await getDashboardStatsFallback();
    return fallback;
  }
  return data as DashboardStats;
}

async function getDashboardStatsFallback(): Promise<DashboardStats> {
  const [
    { count: totalOrders },
    { count: pendingOrders },
    { count: deliveredOrders },
    { count: cancelledOrders },
    { count: refundRequests },
    { count: totalProducts },
    { count: totalCustomers },
    revenueResult,
  ] = await Promise.all([
    supabaseAdmin.from("orders").select("*", { count: "exact", head: true }),
    supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "delivered"),
    supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "cancelled"),
    supabaseAdmin
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "refunded"),
    supabaseAdmin
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer"),
    supabaseAdmin.from("orders").select("total").eq("payment_status", "completed"),
  ]);

  const totalRevenue =
    revenueResult.data?.reduce(
      (sum: number, row: { total: number }) => sum + Number(row.total),
      0,
    ) ?? 0;

  return {
    totalOrders: totalOrders ?? 0,
    totalRevenue,
    pendingOrders: pendingOrders ?? 0,
    deliveredOrders: deliveredOrders ?? 0,
    cancelledOrders: cancelledOrders ?? 0,
    refundRequests: refundRequests ?? 0,
    totalProducts: totalProducts ?? 0,
    totalCustomers: totalCustomers ?? 0,
  };
}

// ─── Recent orders ───────────────────────────────────────────────────────────

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

export async function getRecentOrders(params: {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}): Promise<OrdersResponse> {
  const { page, pageSize, search, sortBy = "created_at", sortDir = "desc" } = params;
  const offset = (page - 1) * pageSize;

  const allowedSortColumns = new Set(["created_at", "total", "status", "order_number"]);
  const safeSortBy = allowedSortColumns.has(sortBy) ? sortBy : "created_at";
  const safeSortDir = sortDir === "asc" ? "asc" : "desc";

  let query = supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, total, status, payment_status, created_at, shipping_address, user_id",
      {
        count: "exact",
      },
    );

  if (search) {
    const sanitized = search.replace(/[^a-zA-Z0-9 @._-]/g, "");
    if (sanitized) {
      query = query.or(
        `order_number.ilike.%${sanitized}%,shipping_address->>firstName.ilike.%${sanitized}%,shipping_address->>lastName.ilike.%${sanitized}%`,
      );
    }
  }

  const { data, error, count } = await query
    .order(safeSortBy, { ascending: safeSortDir === "asc" })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const orders: OrderRow[] = (data ?? []).map((row) => {
    const addr =
      typeof row.shipping_address === "object" && row.shipping_address !== null
        ? (row.shipping_address as Record<string, string>)
        : {};
    return {
      id: row.id,
      order_number: row.order_number,
      customer_name: [addr.firstName, addr.lastName].filter(Boolean).join(" ") || "—",
      customer_email: addr.email ?? "—",
      total: Number(row.total),
      status: row.status,
      created_at: row.created_at,
    };
  });

  return { orders, total: count ?? 0 };
}

// ─── Recent customers ────────────────────────────────────────────────────────

export interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  created_at: string;
  total_orders: number;
  total_spend: number;
}

export interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
}

export async function getRecentCustomers(params: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<CustomersResponse> {
  const { page, pageSize, search } = params;
  const offset = (page - 1) * pageSize;

  let query = supabaseAdmin
    .from("profiles")
    .select("id, email, first_name, last_name, created_at", {
      count: "exact",
    })
    .eq("role", "customer");

  if (search) {
    const sanitized = search.replace(/[^a-zA-Z0-9 @._-]/g, "");
    if (sanitized) {
      query = query.or(
        `email.ilike.%${sanitized}%,first_name.ilike.%${sanitized}%,last_name.ilike.%${sanitized}%`,
      );
    }
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message });
  }

  const userIds = (data ?? []).map((row) => row.id);

  const aggMap = new Map<string, { totalOrders: number; totalSpend: number }>();
  if (userIds.length > 0) {
    const [orderCounts, completedOrders] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("user_id", { count: "exact", head: false })
        .in("user_id", userIds),
      supabaseAdmin
        .from("orders")
        .select("user_id, total")
        .in("user_id", userIds)
        .eq("payment_status", "completed"),
    ]);

    const countMap = new Map<string, number>();
    for (const row of orderCounts.data ?? []) {
      countMap.set(row.user_id, (countMap.get(row.user_id) ?? 0) + 1);
    }

    const spendMap = new Map<string, number>();
    for (const row of completedOrders.data ?? []) {
      const current = spendMap.get(row.user_id) ?? 0;
      spendMap.set(row.user_id, current + Number(row.total));
    }

    for (const uid of userIds) {
      aggMap.set(uid, {
        totalOrders: countMap.get(uid) ?? 0,
        totalSpend: spendMap.get(uid) ?? 0,
      });
    }
  }

  const customers: CustomerRow[] = (data ?? []).map((row) => {
    const agg = aggMap.get(row.id);
    return {
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      created_at: row.created_at,
      total_orders: agg?.totalOrders ?? 0,
      total_spend: agg?.totalSpend ?? 0,
    };
  });

  return { customers, total: count ?? 0 };
}

// ─── Low stock products ─────────────────────────────────────────────────────

export interface LowStockProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  is_active: boolean;
  variant_id: string | null;
  variant_name: string | null;
  variant_stock: number | null;
  variant_attributes: Record<string, unknown> | null;
}

export interface LowStockResponse {
  products: LowStockProductRow[];
  outOfStock: LowStockProductRow[];
  threshold: number;
}

export async function getLowStockProducts(
  threshold: number = DEFAULT_STOCK_THRESHOLD,
): Promise<LowStockResponse> {
  const safeThreshold = Math.max(1, Math.floor(Number(threshold) || DEFAULT_STOCK_THRESHOLD));

  const { data: productRows, error: productError } = await supabaseAdmin
    .from("products")
    .select("id, name, sku, stock, is_active")
    .eq("is_active", true)
    .lte("stock", safeThreshold);

  if (productError) {
    throw createError({ statusCode: 500, statusMessage: productError.message });
  }

  const productIds = (productRows ?? []).map((p) => p.id);

  const { data: variantRows } =
    productIds.length > 0
      ? await supabaseAdmin
          .from("product_variants")
          .select("id, product_id, name, stock, attributes")
          .eq("is_active", true)
          .in("product_id", productIds)
      : { data: [] };

  const variantsByProduct = new Map<string, typeof variantRows>();
  for (const v of variantRows ?? []) {
    const list = variantsByProduct.get(v.product_id) ?? [];
    list.push(v);
    variantsByProduct.set(v.product_id, list);
  }

  const allRows: LowStockProductRow[] = [];

  for (const product of productRows ?? []) {
    const variants = variantsByProduct.get(product.id) ?? [];

    if (variants.length === 0) {
      allRows.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        is_active: product.is_active,
        variant_id: null,
        variant_name: null,
        variant_stock: null,
        variant_attributes: null,
      });
    }

    for (const variant of variants) {
      allRows.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        stock: product.stock,
        is_active: product.is_active,
        variant_id: variant.id,
        variant_name: variant.name,
        variant_stock: variant.stock,
        variant_attributes: variant.attributes as Record<string, unknown> | null,
      });
    }
  }

  const outOfStock = allRows.filter((r) =>
    r.variant_id !== null ? (r.variant_stock ?? 0) === 0 : r.stock === 0,
  );
  const lowStock = allRows.filter((r) =>
    r.variant_id !== null
      ? (r.variant_stock ?? 0) > 0 && (r.variant_stock ?? 0) <= safeThreshold
      : r.stock > 0 && r.stock <= safeThreshold,
  );

  return { products: lowStock, outOfStock, threshold: safeThreshold };
}

// ─── Admin check utility ────────────────────────────────────────────────────

export async function hasAdminRole(accessToken: string): Promise<boolean> {
  try {
    await verifyAdminAccess(accessToken);
    return true;
  } catch {
    return false;
  }
}
