-- ============================================================================
-- ANORA — Database Migration 067
-- Fix get_pending_jobs Volatility
-- ============================================================================

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
      AND (scheduled_at IS NULL OR scheduled_at <= now())
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;
