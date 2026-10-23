import crypto from "node:crypto";
import { createError, defineEventHandler, getHeader } from "h3";
import { initContainer } from "../../../container";
import { logger } from "../../../lib/logger";

/**
 * Runs the background job queue (invoices, PDFs, order emails, review emails) once.
 *
 * Serverless functions are frozen between requests, so the in-process timers cannot be relied on.
 * Call this endpoint on a schedule instead (Vercel Cron on a paid plan, or Supabase pg_cron + pg_net,
 * or any external cron) with:   Authorization: Bearer <CRON_SECRET>
 *
 * Safe to run concurrently with the timers: every job is claimed with an atomic conditional update.
 * Fails closed: if CRON_SECRET is not set the endpoint is disabled.
 */
export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) {
    throw createError({ statusCode: 503, statusMessage: "Cron endpoint is not configured" });
  }

  const header = getHeader(event, "authorization") ?? "";
  const provided = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  const container = await initContainer();
  try {
    const processed = await container.queue.processPending();
    const retried = await container.queue.retryFailed();
    return { ok: true, processed, retried };
  } catch (err) {
    logger.error("Cron: job processing failed", { error: String(err) });
    throw createError({ statusCode: 500, statusMessage: "Job processing failed" });
  }
});
