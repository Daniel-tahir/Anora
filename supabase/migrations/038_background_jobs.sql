-- 038_background_jobs.sql
-- Background job queue for post-payment processing (Phase 3)
-- All jobs execute asynchronously — customer never waits.

-- ─── background_jobs table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dlq')),
  sequence INT NOT NULL DEFAULT 0,
  payload JSONB DEFAULT '{}',
  result JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bg_jobs_status
  ON background_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_next_retry
  ON background_jobs(next_retry_at)
  WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_bg_jobs_order
  ON background_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_bg_jobs_type_order
  ON background_jobs(job_type, order_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

-- Only staff can read background jobs
CREATE POLICY "Staff can read background jobs"
  ON background_jobs FOR SELECT
  USING (is_staff());

-- Server-side functions insert jobs (service role bypasses RLS)
CREATE POLICY "Server inserts background jobs"
  ON background_jobs FOR INSERT
  WITH CHECK (true);

-- Server-side functions update job status
CREATE POLICY "Server updates background jobs"
  ON background_jobs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- No DELETE policy — jobs are immutable after creation (except admin cleanup)

-- ─── RPC: get_pending_jobs ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_pending_jobs(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
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

-- ─── RPC: get_retryable_jobs ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_retryable_jobs(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
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
