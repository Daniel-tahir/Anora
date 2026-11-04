import { createError, defineEventHandler, getQuery, setHeader } from "h3";
import { supabaseAdmin } from "../../../lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const page = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title></head><body style="font-family:Helvetica,Arial,sans-serif;background:#fafafa;color:#27272a;margin:0">
<div style="max-width:440px;margin:15vh auto;padding:0 24px;text-align:center">
<h1 style="font-size:22px;font-weight:500;margin:0 0 12px">${title}</h1><p style="font-size:14px;line-height:1.6;margin:0 0 24px">${text}</p>
<a href="/" style="color:#27272a;font-size:13px">Back to the store</a></div></body></html>`;

/** One-click unsubscribe. The token is a random UUID that is only ever sent to the subscriber. */
export default defineEventHandler(async (event) => {
  const token = String((getQuery(event).token as string | undefined) ?? "");
  setHeader(event, "content-type", "text/html; charset=utf-8");
  setHeader(event, "cache-control", "no-store");

  if (!UUID.test(token)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid link" });
  }

  const { error } = await (supabaseAdmin.from("newsletters") as any)
    .update({ is_active: false, unsubscribed_at: new Date().toISOString() })
    .eq("unsubscribe_token", token);

  if (error) {
    throw createError({ statusCode: 500, statusMessage: "Could not unsubscribe. Please try again." });
  }
  // Same answer whether or not the token matched, so the page cannot be used to probe the list.
  return page("You are unsubscribed", "You will not receive any more marketing emails from us.");
});
