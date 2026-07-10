import { createError, defineEventHandler, getHeader, getQuery, getRouterParam, redirect } from "h3";
import { getContainer } from "../../../../container";

export default defineEventHandler(async (event) => {
  const invoiceId = getRouterParam(event, "id");
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: "Invoice ID is required" });
  }

  const authorization = getHeader(event, "authorization") ?? "";
  let accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!accessToken) {
    const query = getQuery(event) as Record<string, string>;
    accessToken = query.token ?? "";
  }

  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const { supabase, invoice: invoiceService } = getContainer();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid authentication" });
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("customer_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();

  const isStaff = profile?.is_staff === true;
  if (invoice.customer_id !== user.id && !isStaff) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  // Get signed URL for the PDF and redirect
  const signedUrl = await invoiceService.getPdfUrl(invoiceId);
  return redirect(event, signedUrl, 302);
});
