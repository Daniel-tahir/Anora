import { getHeader, createError, defineEventHandler, getQuery } from "h3";
import { verifyAdminAccess, getRecentOrders } from "../../../lib/admin";

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, "authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken)
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });

  await verifyAdminAccess(accessToken);

  const query = getQuery(event);
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const search = typeof query.search === "string" ? query.search : undefined;
  const sortBy = typeof query.sortBy === "string" ? query.sortBy : "created_at";
  const sortDir = query.sortDir === "asc" ? ("asc" as const) : ("desc" as const);

  return await getRecentOrders({ page, pageSize, search, sortBy, sortDir });
});
