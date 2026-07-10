-- Migration 041: Inventory Engine Parity
--
-- Ensures the RPC uses the SAME inventory logic as the TS inventory engine.
-- Key fix: when size_stock is empty (no per-size tracking), fall back to
-- product-level stock instead of treating every size as out of stock.
--
-- This is the SQL-side counterpart of src/lib/inventory-engine.ts:
--   isSizeTracked()  →  size_stock IS NOT NULL AND size_stock != '{}'::jsonb
--   getAvailableStock() → product.stock when !isSizeTracked, else size_stock[size]

-- ─── 1. FIX decrement_checkout_stock ────────────────────────────────────────
-- The old version always checked size_stock when a size was provided, even if
-- size_stock was empty {}. This caused "Insufficient stock" for any product
-- that uses product-level (not per-size) stock tracking.

CREATE OR REPLACE FUNCTION public.decrement_checkout_stock(
  p_product_id UUID,
  p_quantity   INT,
  p_size       TEXT DEFAULT NULL,
  p_variant_id UUID DEFAULT NULL,
  p_reference  TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_stock INT;
  v_variant_stock  INT;
  v_size_stock     INT;
  v_size_stock_map JSONB;
  v_is_size_tracked BOOLEAN;
  v_updated_sizes  JSONB;
  v_change_type    inventory_change_type := 'order';
BEGIN
  SELECT stock, size_stock INTO v_product_stock, v_size_stock_map
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product_stock IS NULL OR v_product_stock < p_quantity THEN
    RETURN FALSE;
  END IF;

  v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
  v_updated_sizes := v_size_stock_map;

  -- Only check/update size stock if the product actually has per-size tracking
  IF p_size IS NOT NULL AND p_size <> '' AND v_is_size_tracked THEN
    v_size_stock := COALESCE((v_updated_sizes ->> p_size)::INT, 0);
    IF v_size_stock < p_quantity THEN
      RETURN FALSE;
    END IF;
    v_updated_sizes := jsonb_set(
      COALESCE(v_updated_sizes, '{}'::jsonb),
      ARRAY[p_size],
      to_jsonb(GREATEST(v_size_stock - p_quantity, 0)),
      true
    );
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT stock INTO v_variant_stock
    FROM public.product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

    IF v_variant_stock IS NULL OR v_variant_stock < p_quantity THEN
      RETURN FALSE;
    END IF;

    UPDATE public.product_variants
    SET stock = stock - p_quantity
    WHERE id = p_variant_id;
  END IF;

  UPDATE public.products
  SET stock = stock - p_quantity,
      size_stock = COALESCE(v_updated_sizes, size_stock)
  WHERE id = p_product_id;

  INSERT INTO public.inventory_logs (
    product_id, variant_id, change_type, quantity_change,
    quantity_after, reference_id, notes
  ) VALUES (
    p_product_id, p_variant_id, v_change_type, -p_quantity,
    GREATEST(v_product_stock - p_quantity, 0),
    p_reference, p_notes
  );

  RETURN TRUE;
END;
$$;

-- ─── 2. FIX create_order_from_payment ───────────────────────────────────────
-- Both VALIDATION PASS 1 and PASS 2 now check isSizeTracked() before
-- validating against size_stock. When size_stock is empty {}, stock is
-- validated against product.stock instead — matching the TS engine exactly.

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
  v_order_id        UUID;
  v_order_number    TEXT;
  v_invoice_id      UUID;
  v_item            RECORD;
  v_parsed_items    JSONB;
  v_item_obj        JSONB;
  v_prod_id         UUID;
  v_var_id          UUID;
  v_size            TEXT;
  v_qty             INT;
  v_price           NUMERIC;
  v_name            TEXT;
  v_image_url       TEXT;
  v_stripe_amount   NUMERIC;
  v_session_id      UUID;
  v_now             TIMESTAMPTZ := now();
  v_size_stock_map  JSONB;
  v_is_size_tracked BOOLEAN;
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

    -- Lock and verify size stock (only if size_stock has entries — matches isSizeTracked())
    IF v_size != '' THEN
      SELECT size_stock INTO v_size_stock_map
      FROM public.products
      WHERE id = v_prod_id;

      v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

      IF v_is_size_tracked THEN
        IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
          PERFORM public.log_payment_event('insufficient_size_stock',
            p_session_id := v_session_id,
            p_user_id := p_user_id,
            p_status := 'failed',
            p_message := 'Insufficient size stock: ' || v_size || ' for ' || v_prod_id
          );
          RAISE EXCEPTION 'Insufficient stock for size % of product %', v_size, v_prod_id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- === VALIDATION PASS 2: Double-check stock after locks ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_prod_id AND stock >= v_qty) THEN
      RAISE EXCEPTION 'Double-check failed: insufficient stock for product %', v_prod_id;
    END IF;

    IF v_var_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.product_variants WHERE id = v_var_id AND stock >= v_qty) THEN
        RAISE EXCEPTION 'Double-check failed: insufficient variant stock for variant %', v_var_id;
      END IF;
    END IF;

    IF v_size != '' THEN
      SELECT size_stock INTO v_size_stock_map
      FROM public.products
      WHERE id = v_prod_id;

      v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

      IF v_is_size_tracked THEN
        IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
          RAISE EXCEPTION 'Double-check failed: insufficient size stock for % of %', v_size, v_prod_id;
        END IF;
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

-- ─── 3. INVENTORY RESERVATIONS TABLE ───────────────────────────────────────
-- Enables temporary stock reservation during checkout so stock is held
-- for the paying customer even before the order is created.

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id TEXT NOT NULL,
  payment_intent_id   TEXT,
  product_id          UUID NOT NULL REFERENCES public.products(id),
  variant_id          UUID REFERENCES public.product_variants(id),
  size                TEXT,
  quantity            INT NOT NULL CHECK (quantity > 0),
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  completed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_checkout
  ON public.inventory_reservations(checkout_request_id);

CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expires
  ON public.inventory_reservations(expires_at)
  WHERE status = 'active';

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

-- ─── 4. RESERVATION MANAGEMENT RPCs ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_inventory(
  p_checkout_request_id TEXT,
  p_items               JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item      RECORD;
  v_prod_id   UUID;
  v_var_id    UUID;
  v_size      TEXT;
  v_qty       INT;
  v_size_map  JSONB;
  v_is_sized  BOOLEAN;
  v_available INT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_var_id  := NULLIF(v_item.value->>'variant_id', '')::UUID;
    v_size    := COALESCE(v_item.value->>'size', '');
    v_qty     := (v_item.value->>'quantity')::INT;

    SELECT stock, size_stock INTO v_available, v_size_map
    FROM public.products WHERE id = v_prod_id FOR UPDATE;

    IF v_available IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Product not found: ' || v_prod_id);
    END IF;

    v_is_sized := v_size_map IS NOT NULL AND v_size_map != '{}'::jsonb;

    IF v_is_sized AND v_size != '' THEN
      v_available := COALESCE((v_size_map ->> v_size)::INT, 0);
    END IF;

    IF v_available < v_qty THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Insufficient stock for product ' || v_prod_id);
    END IF;

    IF v_var_id IS NOT NULL THEN
      SELECT stock INTO v_available
      FROM public.product_variants WHERE id = v_var_id FOR UPDATE;

      IF v_available IS NULL OR v_available < v_qty THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Insufficient variant stock for variant ' || v_var_id);
      END IF;
    END IF;

    INSERT INTO public.inventory_reservations
      (checkout_request_id, product_id, variant_id, size, quantity, status)
    VALUES
      (p_checkout_request_id, v_prod_id, v_var_id, NULLIF(v_size, ''), v_qty, 'active');
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released INT;
BEGIN
  UPDATE public.inventory_reservations
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;
