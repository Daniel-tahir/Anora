-- ============================================================================
-- ANORA — Order Lifecycle Phase 2
-- Migration 035: Order number sequence, order timeline, payment records,
--               and the core order-from-payment function.
-- ============================================================================

-- ─── ORDER NUMBER SEQUENCE ──────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ─── ORDER TIMELINE TABLE ───────────────────────────────────────────────────
-- Tracks status changes, payment events, and admin notes for every order.

CREATE TABLE IF NOT EXISTS order_timeline (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type      TEXT         NOT NULL CHECK (event_type IN (
    'payment_received', 'status_change', 'note_added', 'payment_refunded',
    'admin_action', 'invoice_generated', 'cancellation', 'item_returned'
  )),
  description     TEXT         NOT NULL,
  metadata        JSONB        DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_timeline_order   ON order_timeline(order_id);
CREATE INDEX IF NOT EXISTS idx_order_timeline_created  ON order_timeline(order_id, created_at DESC);

ALTER TABLE order_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage order_timeline"
  ON order_timeline FOR ALL
  USING (is_staff());

CREATE POLICY "Customers can view own order_timeline"
  ON order_timeline FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_timeline.order_id
    AND (orders.user_id = auth.uid() OR is_staff())
  ));

-- ─── PAYMENT RECORDS TABLE ──────────────────────────────────────────────────
-- Stores payment transaction details separate from orders for better audit.

CREATE TABLE IF NOT EXISTS payment_records (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stripe_session_id     TEXT,
  stripe_payment_intent_id TEXT,
  payment_method        TEXT,
  currency              TEXT         NOT NULL DEFAULT 'usd',
  amount                NUMERIC(10,2) NOT NULL,
  status                TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'completed', 'failed', 'refunded', 'partially_refunded'
  )),
  transaction_id        TEXT,
  metadata              JSONB        DEFAULT '{}'::jsonb,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_session
  ON payment_records(stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_payment_intent
  ON payment_records(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_records_order   ON payment_records(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status   ON payment_records(status);

CREATE TRIGGER set_payment_records_updated_at
  BEFORE UPDATE ON payment_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage payment_records"
  ON payment_records FOR ALL
  USING (is_staff());

CREATE POLICY "Customers can view own payment_records"
  ON payment_records FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = payment_records.order_id
    AND (orders.user_id = auth.uid() OR is_staff())
  ));

-- ─── WEBHOOK IDEMPOTENCY ───────────────────────────────────────────────────
-- Tracks processed webhook event IDs to guarantee exactly-once processing.

CREATE TABLE IF NOT EXISTS webhook_events (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT         NOT NULL UNIQUE,
  event_type      TEXT         NOT NULL,
  order_id        UUID         REFERENCES orders(id) ON DELETE SET NULL,
  processed_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_order_id ON webhook_events(order_id);

ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage webhook_events"
  ON webhook_events FOR ALL
  USING (is_staff());

-- ─── ADD TAX COLUMNS (if missing) ───────────────────────────────────────────
-- These may already exist from migration 018; this is idempotent.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ─── SEQUENCE ACCESS FUNCTIONS ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION next_order_number()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NEXTVAL('public.order_number_seq')::INT;
$$;

CREATE OR REPLACE FUNCTION next_invoice_number()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NEXTVAL('public.invoice_number_seq')::INT;
$$;

-- ─── CORE: CREATE ORDER FROM PAYMENT ────────────────────────────────────────
-- All order creation logic in one atomic transaction.
-- Parameters are passed as JSON to keep the function signature manageable.

CREATE OR REPLACE FUNCTION create_order_from_payment(
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
  p_items                 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id       UUID;
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
  -- Idempotency check: skip if order already exists for this session
  IF EXISTS (SELECT 1 FROM public.orders WHERE stripe_session_id = p_stripe_session_id) THEN
    SELECT id INTO v_order_id FROM public.orders WHERE stripe_session_id = p_stripe_session_id;
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order_id,
      'order_number', (SELECT order_number FROM public.orders WHERE id = v_order_id)
    );
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

  -- Create the order
  INSERT INTO public.orders (
    user_id, status, subtotal, total, payment_status, payment_method,
    shipping_address, billing_address, order_number,
    stripe_session_id, stripe_payment_intent_id, paid_at
  ) VALUES (
    p_user_id, 'confirmed', p_subtotal, p_total, 'completed', p_payment_method,
    p_shipping_address::JSONB, p_billing_address::JSONB, p_order_number,
    p_stripe_session_id, p_stripe_payment_intent_id, now()
  )
  RETURNING id INTO v_order_id;

  -- Create order items
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

    -- Decrement stock using existing function
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
    v_order_id, p_stripe_session_id, p_stripe_payment_intent_id,
    p_payment_method, p_currency, p_amount, 'completed', now()
  );

  -- Generate invoice
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
    -- Invoice generation is non-critical; log but don't fail
    INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'admin_action', 'Invoice generation failed: ' || SQLERRM,
            jsonb_build_object('error', SQLERRM));
  END;

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
-- End of migration 035
-- ============================================================================
