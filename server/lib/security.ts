import { getContainer } from "../container";
import { logger } from "./logger";

/** Escape a value before interpolating it into HTML (emails, admin alerts). */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class RateLimitError extends Error {
  readonly statusCode = 429;
  constructor(message = "Too many requests. Please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

/** Best-effort client identifier for rate limiting (Vercel sets x-forwarded-for / x-real-ip). */
export async function getClientKey(): Promise<string> {
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const fwd = getRequestHeader("x-forwarded-for");
    const ip = (fwd ? fwd.split(",")[0] : getRequestHeader("x-real-ip")) ?? "unknown";
    return ip.trim().slice(0, 64) || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Fixed-window rate limit backed by Postgres (works across serverless instances).
 * Fails OPEN on infrastructure errors so a limiter outage can never block checkout.
 */
export async function enforceRateLimit(
  scope: string,
  limit: number,
  windowSeconds: number,
  extraKey?: string,
): Promise<void> {
  try {
    const client = await getClientKey();
    const bucket = `${scope}:${client}${extraKey ? `:${extraKey.toLowerCase().slice(0, 120)}` : ""}`;
    const { supabase } = getContainer();
    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          fn: string,
          args: object,
        ) => Promise<{ data: unknown; error: { message: string } | null }>;
      }
    ).rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      logger.warn("rate limiter unavailable (failing open)", { scope, error: error.message });
      return;
    }
    if (data === false) {
      throw new RateLimitError();
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    logger.warn("rate limiter error (failing open)", { scope, error: String(err) });
  }
}
