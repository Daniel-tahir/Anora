-- ============================================================================
-- ANORA — Payment Transaction Safety & Concurrency Refactor (Phase 2B)
-- Migration 039: Payment sessions table, webhook event status column,
--               order PI unique constraint, checkout_request_id tracking,
--               improved create_order_from_payment RPC.
-- ============================================================================

-- ─── 1. PAYMENT SESSIONS TABLE ─────────────────────────────────────────────
-- Tracks checkout sessions from creation through payment completion.
-- Used for abandonment monitoring, analytics, and idempotency.

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id TEXT          UNIQUE NOT NULL,
  user_id             UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  email               TEXT,
  status              TEXT          NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'processing', 'succeeded', 'failed', 'cancelled', 'expired')),
  payment_intent_id   TEXT,
  payment_method      TEXT,
  currency            TEXT          DEFAULT 'usd',
  amount              INTEGER,
  metadata            JSONB         DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ   DEFAULT now(),
  expires_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_user    ON payment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_status   ON payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_pi       ON payment_sessions(payment_intent_id);

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage payment_sessions"
  ON payment_sessions FOR ALL
  USING (is_staff());

CREATE POLICY "Customers can view own payment_sessions"
  ON payment_sessions FOR SELECT
  USING (user_id = auth.uid());

-- ─── 2. WEBHOOK EVENT STATUS COLUMNS ───────────────────────────────────────
-- Add status field for tombstone pattern: insert BEFORE processing, update
-- AFTER success/failure. Existing rows get 'completed' (safe default).

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed'
  CHECK (status IN ('processing', 'completed', 'failed'));

ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- ─── 3. UNIQUE CONSTRAINT ON orders.stripe_payment_intent_id ──────────────
-- Partial unique index — only for non-empty values.
-- Defense-in-depth: prevents duplicate orders for same PI even if RPC
-- idempotency check has a concurrent gap.

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_pi_id
  ON public.orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id != '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_session_id
  ON public.orders(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL AND stripe_session_id != '';

-- ─── 4. CHECKOUT_REQUEST_ID ON ORDERS ─────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS checkout_request_id TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_checkout_request
  ON public.orders(checkout_request_id)
  WHERE checkout_request_id IS NOT NULL;

-- ─── 5. IMPROVED create_order_from_payment RPC ─────────────────────────────
-- Fixes: v_order_id/v_order_number variable bug, adds checkout_request_id
-- support, updates payment_sessions on success, includes PI UNIQUE safety.

DROP FUNCTION IF EXISTS public.create_order_from_payment;

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
BEGIN
  -- Idempotency: skip if order already exists for this payment_intent
  IF p_stripe_payment_intent_id IS NOT NULL AND p_stripe_payment_intent_id != '' THEN
    SELECT id, order_number INTO v_order_id, v_order_number
    FROM public.orders
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'order_number', v_order_number
      );
    END IF;
  END IF;

  -- Idempotency: skip if order already exists for this session (legacy Checkout Session flow)
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

  -- Parse items JSON
  v_parsed_items := p_items::JSONB;

  -- Validate all items have sufficient stock before creating anything
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Check product stock (with row lock)
    PERFORM 1 FROM public.products
    WHERE id = v_prod_id AND stock >= v_qty
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_prod_id;
    END IF;

    -- Check variant stock if specified
    IF v_var_id IS NOT NULL THEN
      PERFORM 1 FROM public.product_variants
      WHERE id = v_var_id AND stock >= v_qty
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient variant stock for variant %', v_var_id;
      END IF;
    END IF;

    -- Check size stock
    IF v_size != '' THEN
      IF COALESCE((SELECT (size_stock ->> v_size)::INT FROM public.products WHERE id = v_prod_id), 0) < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for size % of product %', v_size, v_prod_id;
      END IF;
    END IF;
  END LOOP;

  -- Validate the unique constraint won't be violated (safety check before INSERT)
  -- The UNIQUE index on stripe_payment_intent_id is the real safety net, but
  -- this explicit check provides a better error message.
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
    NULLIF(p_stripe_session_id, ''), p_stripe_payment_intent_id, now(),
    NULLIF(p_checkout_request_id, '')
  )
  RETURNING id INTO v_order_id;

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

    -- Decrement stock using existing function (FOR UPDATE already acquired above)
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
    p_payment_method, p_currency, p_amount, 'completed', now()
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
      p_subtotal, p_total, 'paid', now()
    )
    RETURNING id INTO v_invoice_id;

    -- Create invoice items
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

    -- Add timeline entry for invoice
    INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'invoice_generated', 'Invoice ' || p_invoice_number || ' generated',
            jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', p_invoice_number));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'admin_action', 'Invoice generation failed: ' || SQLERRM,
            jsonb_build_object('error', SQLERRM));
  END;

  -- Update payment session if this was a Payment Element flow
  IF p_checkout_request_id IS NOT NULL AND p_checkout_request_id != '' THEN
    UPDATE public.payment_sessions
    SET status = 'succeeded', completed_at = now()
    WHERE checkout_request_id = p_checkout_request_id;
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
-- End of migration 039
-- ============================================================================
