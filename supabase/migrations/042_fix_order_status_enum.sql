-- Migration 042: Fix order_status enum value
--
-- The create_order_from_payment RPC was inserting 'paid' as the order status,
-- but 'paid' is not in the order_status enum (pending, confirmed, processing,
-- shipped, delivered, cancelled, refunded).
--
-- The correct initial status for a paid order is 'confirmed'.
--
-- This migration replaces all 'paid' references in the active RPC functions
-- with the valid enum value 'confirmed'.

-- ─── 1. FIX create_order_from_payment ───────────────────────────────────────

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
