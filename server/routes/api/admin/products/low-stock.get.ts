import { getHeader, createError, defineEventHandler, getQuery } from "h3";
import { verifyAdminAccess, getLowStockProducts } from "../../../../lib/admin";

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, "authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken)
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });

  await verifyAdminAccess(accessToken);

  const query = getQuery(event);
  const threshold = Math.max(1, Number(query.threshold) || 5);

  return await getLowStockProducts(threshold);
});
