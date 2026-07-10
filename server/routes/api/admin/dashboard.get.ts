import { getHeader, createError, defineEventHandler } from "h3";
import { verifyAdminAccess, getDashboardStats } from "../../../lib/admin";

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, "authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken)
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });

  await verifyAdminAccess(accessToken);
  const stats = await getDashboardStats();
  return stats;
});
