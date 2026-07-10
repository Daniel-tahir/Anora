-- ============================================================================
-- ANORA — Phase 2C: Complete Production Payment Architecture
-- Migration 040: Payment state machine, analytics, DLQ, cleanup, audit
-- ============================================================================

-- ─── 1. PAYMENT SESSION ENHANCEMENTS ──────────────────────────────────────
-- Add lifecycle timestamp columns and analytics fields.

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS processing_at TIMESTAMPTZ;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS browser TEXT;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS ip_address TEXT;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS device_type TEXT;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS checkout_duration_seconds INTEGER;

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- ─── 2. PAYMENT STATE MACHINE TRIGGER ─────────────────────────────────────
-- Enforces strict status transitions. Invalid transitions RAISE EXCEPTION.

CREATE OR REPLACE FUNCTION public.check_payment_session_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_transition BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'created' THEN
      RAISE EXCEPTION 'Payment session must start with status "created", got "%"', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM (VALUES
        ('created', 'pending'),
        ('created', 'expired'),
        ('pending', 'processing'),
        ('pending', 'failed'),
        ('pending', 'cancelled'),
        ('pending', 'expired'),
        ('processing', 'succeeded'),
        ('processing', 'failed'),
        ('succeeded', 'completed')
      ) AS t(from_status, to_status)
      WHERE from_status = OLD.status AND to_status = NEW.status
    ) INTO valid_transition;

    IF NOT valid_transition THEN
      RAISE EXCEPTION 'Invalid payment session status transition: "%" -> "%"', OLD.status, NEW.status;
    END IF;

    -- Auto-set lifecycle timestamps on transitions
    IF NEW.status = 'pending' AND OLD.status = 'created' THEN
      NEW.processing_at := NULL;
    END IF;
    IF NEW.status = 'processing' THEN
      NEW.processing_at := COALESCE(NEW.processing_at, now());
    END IF;
    IF NEW.status = 'succeeded' THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.status = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
    IF NEW.status = 'failed' THEN
      NEW.failed_at := now();
    END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := now();
    END IF;
    IF NEW.status = 'expired' THEN
      NEW.cancelled_at := now();
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_sessions_status ON public.payment_sessions;

CREATE TRIGGER trg_payment_sessions_status
  BEFORE INSERT OR UPDATE OF status
  ON public.payment_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_session_status();

-- ─── 3. DEAD LETTER JOBS TABLE ────────────────────────────────────────────
-- Separate table for jobs that exhausted retries.
-- Stores full error details, stack trace, and original payload.

CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID,
  job_type        TEXT          NOT NULL,
  order_id        UUID,
  payload         JSONB         NOT NULL DEFAULT '{}'::jsonb,
  error_message   TEXT,
  stack_trace     TEXT,
  retry_count     INTEGER       NOT NULL DEFAULT 0,
  failed_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  recovered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_job_type   ON dead_letter_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_dlq_order_id   ON dead_letter_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_dlq_failed_at  ON dead_letter_jobs(failed_at DESC);

ALTER TABLE dead_letter_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage dead_letter_jobs"
  ON dead_letter_jobs FOR ALL
  USING (is_staff());

-- ─── 4. MOVE TO DEAD LETTER FUNCTION ──────────────────────────────────────
-- Inserts into dead_letter_jobs and marks original job as dlq in one call.

CREATE OR REPLACE FUNCTION public.move_to_dead_letter(
  p_job_id           UUID,
  p_job_type         TEXT,
  p_order_id         UUID,
  p_payload          JSONB,
  p_error_message    TEXT,
  p_stack_trace      TEXT DEFAULT NULL,
  p_retry_count      INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.dead_letter_jobs (
    original_job_id, job_type, order_id, payload,
    error_message, stack_trace, retry_count
  ) VALUES (
    p_job_id, p_job_type, p_order_id, p_payload,
    p_error_message, p_stack_trace, p_retry_count
  )
  RETURNING id INTO v_dlq_id;

  UPDATE public.background_jobs
  SET status = 'dlq', completed_at = now()
  WHERE id = p_job_id;

  RETURN v_dlq_id;
END;
$$;

-- ─── 5. RECOVER FROM DEAD LETTER FUNCTION ─────────────────────────────────
-- Re-queues a DLQ job with reset retry count.

CREATE OR REPLACE FUNCTION public.recover_from_dead_letter(
  p_dlq_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dlq RECORD;
BEGIN
  SELECT * INTO v_dlq FROM public.dead_letter_jobs WHERE id = p_dlq_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_dlq.recovered_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.background_jobs (
    job_type, order_id, status, payload, retry_count, max_retries
  ) VALUES (
    v_dlq.job_type, v_dlq.order_id, 'pending', v_dlq.payload, 0, 3
  );

  UPDATE public.dead_letter_jobs
  SET recovered_at = now()
  WHERE id = p_dlq_id;

  RETURN TRUE;
END;
$$;

-- ─── 6. CLEANUP EXPIRED SESSIONS FUNCTION ─────────────────────────────────
-- Marks expired sessions and optionally purges old ones.

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS TABLE(
  expired_count INTEGER,
  deleted_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  -- Mark sessions as expired where expires_at is past and status is not terminal
  UPDATE public.payment_sessions
  SET status = 'expired',
      cancelled_at = now()
  WHERE status IN ('created', 'pending')
    AND expires_at < now();

  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- Delete expired sessions older than retention period
  DELETE FROM public.payment_sessions
  WHERE status IN ('expired', 'failed', 'cancelled')
    AND (completed_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL
         OR GREATEST(
           COALESCE(completed_at, '1970-01-01'::timestamptz),
           COALESCE(cancelled_at, '1970-01-01'::timestamptz),
           COALESCE(failed_at, '1970-01-01'::timestamptz)
         ) < now() - (p_retention_days || ' days')::interval);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_expired, v_deleted;
END;
$$;

-- ─── 7. PAYMENT AUDIT LOG FUNCTION ────────────────────────────────────────
-- Structured audit logging for all payment events.

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT          NOT NULL,
  session_id      UUID,
  user_id         UUID,
  payment_intent_id TEXT,
  order_id        UUID,
  status          TEXT,
  message         TEXT,
  metadata        JSONB         DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pal_event_type  ON payment_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_pal_session     ON payment_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_pal_user        ON payment_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pal_order       ON payment_audit_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_pal_created     ON payment_audit_logs(created_at DESC);

ALTER TABLE payment_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage payment_audit_logs"
  ON payment_audit_logs FOR ALL
  USING (is_staff());

CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_event_type        TEXT,
  p_session_id        UUID DEFAULT NULL,
  p_user_id           UUID DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_order_id          UUID DEFAULT NULL,
  p_status            TEXT DEFAULT NULL,
  p_message           TEXT DEFAULT NULL,
  p_metadata          JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.payment_audit_logs (
    event_type, session_id, user_id, payment_intent_id,
    order_id, status, message, metadata
  ) VALUES (
    p_event_type, p_session_id, p_user_id, p_payment_intent_id,
    p_order_id, p_status, p_message, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 8. ENHANCE create_order_from_payment WITH AUDIT LOGGING ──────────────
-- Updated RPC calls log_payment_event at key milestones.
-- Double stock verification: after FOR UPDATE lock, immediately before decrement.
-- Checkout duration calculation on payment_sessions.

CREATE OR REPLACE FUNCTION public.create_order_from_payment(
  p_user_id               UUID,
  p_order_number          TEXT,
  p_subtotal              NUMERIC,
  p_total                 NUMERIC,
  p_shipping_address      TEXT,
  p_billing_address       TEXT,
  p_stripe_session_id     TEXT,
  p_stripe_payment_intent_id TEXT,
  p_payment_method        TEXT,
  p_currency              TEXT,
  p_amount                NUMERIC,
  p_invoice_number        TEXT,
  p_items                 TEXT,
  p_checkout_request_id   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id       UUID;
  v_order_number   TEXT;
  v_invoice_id     UUID;
  v_item           RECORD;
  v_parsed_items   JSONB;
  v_item_obj       JSONB;
  v_prod_id        UUID;
  v_var_id         UUID;
  v_size           TEXT;
  v_qty            INT;
  v_price          NUMERIC;
  v_name           TEXT;
  v_image_url      TEXT;
  v_stripe_amount  NUMERIC;
  v_session_id     UUID;
  v_now            TIMESTAMPTZ := now();
BEGIN
  -- Idempotency: skip if order already exists for this payment_intent
  IF p_stripe_payment_intent_id IS NOT NULL AND p_stripe_payment_intent_id != '' THEN
    SELECT id, order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id
    LIMIT 1;
    IF FOUND THEN
      PERFORM public.log_payment_event('order_already_exists',
        p_payment_intent_id := p_stripe_payment_intent_id,
        p_order_id := v_order_id,
        p_status := 'duplicate',
        p_message := 'Order already exists for PI'
      );
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number
      );
    END IF;
  END IF;

  -- Idempotency: skip if order already exists for this session
  IF p_stripe_session_id IS NOT NULL AND p_stripe_session_id != '' THEN
    SELECT id, order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE stripe_session_id = p_stripe_session_id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number
      );
    END IF;
  END IF;

  -- Lookup payment session for audit
  IF p_checkout_request_id IS NOT NULL AND p_checkout_request_id != '' THEN
    SELECT id INTO v_session_id
    FROM public.payment_sessions
    WHERE checkout_request_id = p_checkout_request_id;
  END IF;

  v_parsed_items := p_items::JSONB;

  -- === VALIDATION PASS 1: Lock and verify stock (inside transaction) ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Lock product row with FOR UPDATE
    PERFORM 1 FROM public.products
    WHERE id = v_prod_id AND stock >= v_qty
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM public.log_payment_event('insufficient_stock',
        p_session_id := v_session_id,
        p_user_id := p_user_id,
        p_status := 'failed',
        p_message := 'Insufficient product stock: ' || v_prod_id,
        p_metadata := jsonb_build_object('product_id', v_prod_id, 'requested', v_qty)
      );
      RAISE EXCEPTION 'Insufficient stock for product %', v_prod_id;
    END IF;

    -- Lock variant row if specified
    IF v_var_id IS NOT NULL THEN
      PERFORM 1 FROM public.product_variants
      WHERE id = v_var_id AND stock >= v_qty
      FOR UPDATE;

      IF NOT FOUND THEN
        PERFORM public.log_payment_event('insufficient_variant_stock',
          p_session_id := v_session_id,
          p_user_id := p_user_id,
          p_status := 'failed',
          p_message := 'Insufficient variant stock: ' || v_var_id
        );
        RAISE EXCEPTION 'Insufficient variant stock for variant %', v_var_id;
      END IF;
    END IF;

    -- Lock and verify size stock
    IF v_size != '' THEN
      IF COALESCE((SELECT (size_stock ->> v_size)::INT FROM public.products WHERE id = v_prod_id), 0) < v_qty THEN
        PERFORM public.log_payment_event('insufficient_size_stock',
          p_session_id := v_session_id,
          p_user_id := p_user_id,
          p_status := 'failed',
          p_message := 'Insufficient size stock: ' || v_size || ' for ' || v_prod_id
        );
        RAISE EXCEPTION 'Insufficient stock for size % of product %', v_size, v_prod_id;
      END IF;
    END IF;
  END LOOP;

  -- === VALIDATION PASS 2: Double-check stock after locks (inside transaction) ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Product stock (row already locked above, this is a double-check)
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_prod_id AND stock >= v_qty) THEN
      RAISE EXCEPTION 'Double-check failed: insufficient stock for product %', v_prod_id;
    END IF;

    IF v_var_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_var_id AND stock >= v_qty) THEN
        RAISE EXCEPTION 'Double-check failed: insufficient variant stock for variant %', v_var_id;
      END IF;
    END IF;

    IF v_size != '' THEN
      IF COALESCE((SELECT (size_stock ->> v_size)::INT FROM public.products WHERE id = v_prod_id), 0) < v_qty THEN
        RAISE EXCEPTION 'Double-check failed: insufficient size stock for % of %', v_size, v_prod_id;
      END IF;
    END IF;
  END LOOP;

  -- Re-check unique constraint (defense-in-depth)
  IF p_stripe_payment_intent_id IS NOT NULL AND p_stripe_payment_intent_id != '' THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id) THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', (SELECT id FROM public.orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id LIMIT 1),
        'order_number', (SELECT order_number FROM public.orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id LIMIT 1)
      );
    END IF;
  END IF;

  -- Create the order
  INSERT INTO public.orders (
    user_id, status, subtotal, total, payment_status, payment_method,
    shipping_address, billing_address, order_number,
    stripe_session_id, stripe_payment_intent_id, paid_at,
    checkout_request_id
  ) VALUES (
    p_user_id, 'confirmed', p_subtotal, p_total, 'completed', p_payment_method,
    p_shipping_address::JSONB, p_billing_address::JSONB, p_order_number,
    NULLIF(p_stripe_session_id, ''), p_stripe_payment_intent_id, v_now,
    NULLIF(p_checkout_request_id, '')
  )
  RETURNING id INTO v_order_id;

  PERFORM public.log_payment_event('order_created',
    p_session_id := v_session_id,
    p_user_id := p_user_id,
    p_payment_intent_id := p_stripe_payment_intent_id,
    p_order_id := v_order_id,
    p_status := 'confirmed',
    p_message := 'Order created: ' || p_order_number
  );

  -- Create order items and decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;
    v_size := COALESCE(v_item.value->>'size', '');
    v_qty := (v_item.value->>'quantity')::INT;
    v_price := (v_item.value->>'price')::NUMERIC;
    v_name := v_item.value->>'name';
    v_image_url := NULLIF(v_item.value->>'image_url', '');

    INSERT INTO public.order_items (order_id, product_id, variant_id, name, price, quantity, image_url, attributes)
    VALUES (v_order_id, v_prod_id, v_var_id, v_name, v_price, v_qty, v_image_url,
            jsonb_build_object('size', v_size));

    PERFORM public.decrement_checkout_stock(
      v_prod_id, v_qty, v_size, v_var_id,
      v_order_id::TEXT, 'order_creation'
    );
  END LOOP;

  -- Create timeline entries
  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES
    (v_order_id, 'payment_received', 'Payment received: $' || round(p_amount, 2) || ' ' || upper(p_currency),
     jsonb_build_object('amount', p_amount, 'currency', p_currency)),
     (v_order_id, 'status_change', 'Order placed successfully',
     jsonb_build_object('from_status', null, 'to_status', 'confirmed'));

  -- Create payment record
  INSERT INTO public.payment_records (
    order_id, stripe_session_id, stripe_payment_intent_id,
    payment_method, currency, amount, status, paid_at
  ) VALUES (
    v_order_id, NULLIF(p_stripe_session_id, ''), p_stripe_payment_intent_id,
    p_payment_method, p_currency, p_amount, 'completed', v_now
  );

  PERFORM public.log_payment_event('payment_record_created',
    p_session_id := v_session_id,
    p_order_id := v_order_id,
    p_payment_intent_id := p_stripe_payment_intent_id,
    p_status := 'completed',
    p_message := 'Payment record created: ' || p_currency || ' ' || p_amount
  );

  -- Generate invoice (non-critical — wrapped in EXCEPTION)
  v_invoice_id := NULL;
  BEGIN
    INSERT INTO public.invoices (
      invoice_number, order_id, customer_id, customer_name, customer_email,
      subtotal, total_amount, status, issued_at
    ) VALUES (
      p_invoice_number, v_order_id, p_user_id,
      COALESCE((SELECT first_name || ' ' || last_name FROM public.profiles WHERE id = p_user_id), 'Customer'),
      (SELECT email FROM public.profiles WHERE id = p_user_id),
      p_subtotal, p_total, 'paid', v_now
    )
    RETURNING id INTO v_invoice_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
      INSERT INTO public.invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
      VALUES (
        v_invoice_id,
        (v_item.value->>'product_id')::UUID,
        v_item.value->>'name',
        (v_item.value->>'quantity')::INT,
        (v_item.value->>'price')::NUMERIC,
        ((v_item.value->>'quantity')::INT * (v_item.value->>'price')::NUMERIC)
      );
    END LOOP;

    INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'invoice_generated', 'Invoice ' || p_invoice_number || ' generated',
            jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', p_invoice_number));

    PERFORM public.log_payment_event('invoice_created',
      p_order_id := v_order_id,
      p_status := 'paid',
      p_message := 'Invoice generated: ' || p_invoice_number,
      p_metadata := jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', p_invoice_number)
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'admin_action', 'Invoice generation failed: ' || SQLERRM,
            jsonb_build_object('error', SQLERRM));
  END;

  -- Update payment session with checkout duration
  IF v_session_id IS NOT NULL THEN
    UPDATE public.payment_sessions
    SET status = 'succeeded',
        completed_at = v_now,
        checkout_duration_seconds = EXTRACT(EPOCH FROM (v_now - created_at))::INTEGER
    WHERE id = v_session_id AND status = 'processing';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', p_order_number,
    'invoice_id', v_invoice_id,
    'invoice_number', p_invoice_number
  );
END;
$$;

-- ============================================================================
-- End of migration 040
-- ============================================================================
