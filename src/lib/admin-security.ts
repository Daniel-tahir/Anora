import { useState, useEffect, useCallback } from "react";
import { rpc, type RpcResult } from "./admin-client";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: any;
  new_data: any;
  metadata: any;
  created_at: string;
  actor_name: string | null;
  actor_avatar: string | null;
}

export interface ActivityResponse {
  activities: ActivityEntry[];
  total: number;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_data: any;
  new_data: any;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor_name: string | null;
}

export interface AuditLogsResponse {
  logs: AuditLogEntry[];
  total: number;
}

export interface AdminActivityEntry {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
  admin_name: string | null;
  avatar_url: string | null;
}

export interface AdminActivityResponse {
  activities: AdminActivityEntry[];
  total: number;
}

export interface FailedLoginEntry {
  id: string;
  user_id: string | null;
  email: string;
  ip_address: string | null;
  user_agent: string | null;
  attempt_count: number;
  last_attempt_at: string;
  created_at: string;
  user_name: string | null;
}

export interface FailedLoginResponse {
  attempts: FailedLoginEntry[];
  total: number;
}

export interface DeviceSession {
  id: string;
  user_id: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  last_activity_at: string;
  started_at: string;
  session_id: string | null;
  user_name: string | null;
  avatar_url: string | null;
}

export interface SessionResponse {
  sessions: DeviceSession[];
  total: number;
}

export interface SecurityOverview {
  failed_logins_24h: number;
  active_sessions: number;
  locked_accounts: number;
  total_admins: number;
}

export interface AbandonedCartAnalytics {
  total_abandoned_carts: number;
  lost_revenue: number;
  recovered_revenue: number;
  recovered_carts: number;
  converted_carts: number;
  recovery_rate: number;
  average_cart_value: number;
  trend: {
    period: string;
    total_carts: number;
    total_value: number;
    recovered: number;
    recovered_value: number;
  }[];
}

export interface AbandonedCartRow {
  id: string;
  user_id: string | null;
  session_id: string | null;
  subtotal: number;
  item_count: number;
  status: string;
  recovered_at: string | null;
  converted_at: string | null;
  converted_order_id: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  items: any[];
}

export interface AbandonedCartsResponse {
  carts: AbandonedCartRow[];
  total: number;
}

export interface LockoutResult {
  is_locked: boolean;
  attempts: number;
  lockout_expires_at?: string;
  remaining_seconds?: number;
}

// ─── Activity Timeline ─────────────────────────────────────────────────────

export function useActivityTimeline(
  page: number,
  pageSize: number,
  entityType = "",
  action = "",
  search = "",
  dateFrom = "",
  dateTo = "",
  actorId = "",
) {
  const [result, setResult] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { p_page: page, p_page_size: pageSize };
      if (entityType) params.p_entity_type = entityType;
      if (action) params.p_action = action;
      if (search) params.p_search = search;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      if (actorId) params.p_actor_id = actorId;
      const data = await rpc<ActivityResponse>("get_activity_timeline", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityType, action, search, dateFrom, dateTo, actorId]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

// ─── Audit Logs ────────────────────────────────────────────────────────────

export function useAuditLogs(
  page: number,
  pageSize: number,
  entityType = "",
  action = "",
  search = "",
  dateFrom = "",
  dateTo = "",
  actorId = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
) {
  const [result, setResult] = useState<AuditLogsResponse | null>(null);
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
      if (entityType) params.p_entity_type = entityType;
      if (action) params.p_action = action;
      if (search) params.p_search = search;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      if (actorId) params.p_actor_id = actorId;
      const data = await rpc<AuditLogsResponse>("get_audit_logs", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, entityType, action, search, dateFrom, dateTo, actorId, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

// ─── Admin Activity ────────────────────────────────────────────────────────

export function useAdminActivity(
  page: number,
  pageSize: number,
  action = "",
  entityType = "",
  search = "",
  dateFrom = "",
  dateTo = "",
) {
  const [result, setResult] = useState<AdminActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { p_page: page, p_page_size: pageSize };
      if (action) params.p_action = action;
      if (entityType) params.p_entity_type = entityType;
      if (search) params.p_search = search;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      const data = await rpc<AdminActivityResponse>("get_admin_activity", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, action, entityType, search, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

// ─── Failed Logins ─────────────────────────────────────────────────────────

export function useFailedLogins(
  page: number,
  pageSize: number,
  search = "",
  dateFrom = "",
  dateTo = "",
) {
  const [result, setResult] = useState<FailedLoginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { p_page: page, p_page_size: pageSize };
      if (search) params.p_search = search;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      const data = await rpc<FailedLoginResponse>("get_failed_login_summary", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

// ─── Active Sessions ───────────────────────────────────────────────────────

export function useActiveSessions(page: number, pageSize: number, search = "") {
  const [result, setResult] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { p_page: page, p_page_size: pageSize };
      if (search) params.p_search = search;
      const data = await rpc<SessionResponse>("get_active_sessions", params);
      setResult(data);
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

// ─── Security Overview ─────────────────────────────────────────────────────

export function useSecurityOverview() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await rpc<SecurityOverview>("get_security_overview");
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

// ─── Abandoned Carts ───────────────────────────────────────────────────────

export function useAbandonedCarts(
  page: number,
  pageSize: number,
  status = "",
  search = "",
  dateFrom = "",
  dateTo = "",
  sortBy = "created_at",
  sortDir: "asc" | "desc" = "desc",
) {
  const [result, setResult] = useState<AbandonedCartsResponse | null>(null);
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
      if (status) params.p_status = status;
      if (search) params.p_search = search;
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      const data = await rpc<AbandonedCartsResponse>("get_abandoned_carts", params);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, search, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);
  return { result, loading, error, refetch: load };
}

// ─── Abandoned Cart Analytics ──────────────────────────────────────────────

export function useAbandonedCartAnalytics(dateFrom = "", dateTo = "", groupBy = "day") {
  const [data, setData] = useState<AbandonedCartAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, unknown> = { p_group_by: groupBy };
      if (dateFrom) params.p_date_from = dateFrom;
      if (dateTo) params.p_date_to = dateTo;
      const result = await rpc<AbandonedCartAnalytics>("get_abandoned_cart_analytics", params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy]);

  useEffect(() => {
    load();
  }, [load]);
  return { data, loading, error, refetch: load };
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function endUserSession(sessionId: string): Promise<RpcResult> {
  return rpc<RpcResult>("end_user_session", { p_session_id: sessionId });
}

export async function markCartRecovered(cartId: string): Promise<RpcResult> {
  return rpc<RpcResult>("mark_cart_recovered", { p_cart_id: cartId });
}

export async function markCartConverted(cartId: string, orderId: string): Promise<RpcResult> {
  return rpc<RpcResult>("mark_cart_converted", { p_cart_id: cartId, p_order_id: orderId });
}

export async function recordAdminActivity(
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>,
  ipAddress?: string,
): Promise<RpcResult> {
  const params: Record<string, unknown> = { p_action: action };
  if (entityType) params.p_entity_type = entityType;
  if (entityId) params.p_entity_id = entityId;
  if (details) params.p_details = details;
  if (ipAddress) params.p_ip_address = ipAddress;
  return rpc<RpcResult>("record_admin_activity", params);
}

export async function checkLoginLockout(email: string, userId?: string): Promise<LockoutResult> {
  const params: Record<string, unknown> = { p_email: email };
  if (userId) params.p_user_id = userId;
  return rpc<LockoutResult>("check_login_lockout", params);
}

export async function recordFailedLogin(
  email: string,
  userId?: string,
  ipAddress?: string,
): Promise<RpcResult & { attempt_count?: number; is_locked?: boolean }> {
  const params: Record<string, unknown> = { p_email: email };
  if (userId) params.p_user_id = userId;
  if (ipAddress) params.p_ip_address = ipAddress;
  return rpc<any>("record_failed_login", params);
}
