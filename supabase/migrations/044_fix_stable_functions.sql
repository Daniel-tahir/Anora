-- Migration 044: Fix Function Volatility & Missing Schema Dependencies
--
-- ERROR 1: "type inventory_change_type does not exist"
--   The enum was never created in the production database (migration 001 was
--   partially applied). Already fixed in 043, but we include it here with a
--   DO block as a safety net so this migration is self-contained.
--
-- ERROR 2: "SELECT FOR UPDATE is not allowed in a non-volatile function"
--   PostgreSQL 17 rejects SELECT ... FOR UPDATE in functions declared STABLE.
--   Two functions in migration 038 had this bug:
--     - get_pending_jobs()    — STABLE, uses FOR UPDATE SKIP LOCKED
--     - get_retryable_jobs() — STABLE, uses FOR UPDATE SKIP LOCKED
--   They must be VOLATILE because FOR UPDATE acquires row-level locks.
--
-- This migration ONLY fixes database objects.
-- It does NOT modify business logic or application code.
-- ============================================================================

-- ─── FIX 1: Create missing inventory_change_type (idempotent) ───────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'inventory_change_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.inventory_change_type AS ENUM (
      'order',
      'restock',
      'adjustment',
      'return',
      'cancellation'
    );
  END IF;
END;
$$;

-- ─── FIX 2: Ensure 'returned' exists in order_status ───────────────────────

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'returned' AFTER 'delivered';

-- ─── FIX 3: Fix get_pending_jobs — STABLE → VOLATILE ───────────────────────

CREATE OR REPLACE FUNCTION public.get_pending_jobs(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_jobs
  FROM (
    SELECT id, job_type, order_id, payload, retry_count, max_retries, created_at, sequence
    FROM background_jobs
    WHERE status = 'pending'
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;

-- ─── FIX 4: Fix get_retryable_jobs — STABLE → VOLATILE ─────────────────────

CREATE OR REPLACE FUNCTION public.get_retryable_jobs(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_jobs
  FROM (
    SELECT id, job_type, order_id, payload, retry_count, max_retries, created_at, sequence
    FROM background_jobs
    WHERE status = 'failed'
      AND next_retry_at IS NOT NULL
      AND next_retry_at <= now()
      AND retry_count < max_retries
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;
