-- ============================================================================
-- ANORA — Email Logging & Invoice Storage
-- Migration 036: email_logs table for tracking sent emails,
--               email templates configuration, and invoice storage bucket.
-- ============================================================================

-- ─── EMAIL LOGS TABLE ───────────────────────────────────────────────────────
-- Tracks every automated email sent for debugging and duplicate prevention.

CREATE TABLE IF NOT EXISTS public.email_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID         REFERENCES public.orders(id) ON DELETE CASCADE,
  email_type      TEXT         NOT NULL,
  recipient       TEXT         NOT NULL,
  subject         TEXT         NOT NULL,
  status          TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'failed', 'retrying', 'delivered', 'bounced', 'opened', 'clicked', 'complained'
  )),
  attempts        INT          NOT NULL DEFAULT 0,
  max_attempts    INT          NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,
  failure_reason  TEXT,
  metadata        JSONB        DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_order_type
  ON public.email_logs(order_id, email_type);

CREATE INDEX IF NOT EXISTS idx_email_logs_status
  ON public.email_logs(status);

CREATE INDEX IF NOT EXISTS idx_email_logs_retry
  ON public.email_logs(next_retry_at)
  WHERE status = 'retrying' AND next_retry_at IS NOT NULL;

CREATE TRIGGER set_email_logs_updated_at
  BEFORE UPDATE ON public.email_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage email_logs"
  ON public.email_logs FOR ALL
  USING (is_staff());

CREATE POLICY "Customers can view own email_logs"
  ON public.email_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = email_logs.order_id
    AND (orders.user_id = auth.uid() OR is_staff())
  ));

-- ─── ADD PDF PATH TO INVOICES ───────────────────────────────────────────────
-- Stores the path to the generated PDF in Supabase Storage for later download.

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- ============================================================================
-- End of migration 036
-- ============================================================================
