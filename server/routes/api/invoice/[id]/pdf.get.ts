import { createError, defineEventHandler, getHeader, getRouterParam, redirect } from "h3";
import { initContainer } from "../../../../container";

export default defineEventHandler(async (event) => {
  const invoiceId = getRouterParam(event, "id");
  if (!invoiceId) {
    throw createError({ statusCode: 400, statusMessage: "Invoice ID is required" });
  }

  const authorization = getHeader(event, "authorization") ?? "";
  // Header only: tokens in query strings leak through logs, browser history and Referer headers.
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  const container = await initContainer();
  const { supabase, invoice: invoiceService } = container;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: "Invalid authentication" });
  }

  const { data: invoice } = await (supabase
    .from("invoices") as any)
    .select("customer_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice) {
    throw createError({ statusCode: 404, statusMessage: "Invoice not found" });
  }

  // profiles.is_staff does not exist; staff are rows in admin_roles (same as RLS is_staff()).
  const { data: staffRow } = await (supabase
    .from("admin_roles") as any)
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const isStaff = !!staffRow;
  if (invoice.customer_id !== user.id && !isStaff) {
    throw createError({ statusCode: 403, statusMessage: "Access denied" });
  }

  // Get signed URL for the PDF and redirect
  const signedUrl = await invoiceService.getPdfUrl(invoiceId);
  return redirect(signedUrl, 302);
});
