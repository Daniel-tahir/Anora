-- Drop any overloaded create_order_from_payment functions to avoid signature conflicts
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT oid::regprocedure AS proc_signature
        FROM pg_proc
        WHERE proname = 'create_order_from_payment'
    ) LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_signature;
    END LOOP;
END;
$$;

-- Drop NOT NULL constraint on invoices.customer_id to allow guest invoices
ALTER TABLE public.invoices ALTER COLUMN customer_id DROP NOT NULL;

-- Recreate create_order_from_payment with all required parameters and JSONB return type
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
  p_checkout_request_id   TEXT DEFAULT NULL,
  p_email                 TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order_id        UUID;
  v_invoice_id      UUID;
  v_item            JSONB;
  v_prod_id         UUID;
  v_qty             INT;
  v_size            TEXT;
  v_var_id          UUID;
  v_product_stock   INT;
  v_variant_stock    INT;
  v_size_stock_map   JSONB;
  v_is_size_tracked  BOOLEAN;
  v_session_id      TEXT := COALESCE(p_stripe_session_id, 'manual');
  v_parsed_items    JSONB;
  v_now             TIMESTAMPTZ := now();
BEGIN
  -- Parse items array
  v_parsed_items := COALESCE(p_items::jsonb, '[]'::jsonb);

  -- === VALIDATION PASS 1: Lock all items & verify stock ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Lock parent product row
    PERFORM 1 FROM products
    WHERE id = v_prod_id AND stock >= v_qty
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM log_payment_event('insufficient_stock',
        p_session_id := v_session_id,
        p_user_id := p_user_id,
        p_status := 'failed',
        p_message := 'Insufficient product stock: ' || v_prod_id,
        p_metadata := jsonb_build_object('product_id', v_prod_id, 'requested', v_qty)
      );
      RAISE EXCEPTION 'Insufficient stock for product %', v_prod_id;
    END IF;

    -- Lock and verify variant row if specified
    IF v_var_id IS NOT NULL THEN
      SELECT stock, size_stock INTO v_variant_stock, v_size_stock_map
      FROM product_variants
      WHERE id = v_var_id
      FOR UPDATE;

      IF v_variant_stock IS NULL OR v_variant_stock < v_qty THEN
        PERFORM log_payment_event('insufficient_variant_stock',
          p_session_id := v_session_id,
          p_user_id := p_user_id,
          p_status := 'failed',
          p_message := 'Insufficient variant stock: ' || v_var_id
        );
        RAISE EXCEPTION 'Insufficient variant stock for variant %', v_var_id;
      END IF;

      -- If variant has size stock, validate size stock
      IF v_size != '' THEN
        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            PERFORM log_payment_event('insufficient_size_stock',
              p_session_id := v_session_id,
              p_user_id := p_user_id,
              p_status := 'failed',
              p_message := 'Insufficient variant size stock: ' || v_size || ' for variant ' || v_var_id
            );
            RAISE EXCEPTION 'Insufficient stock for size % of variant %', v_size, v_var_id;
          END IF;
        END IF;
      END IF;
    ELSE
      -- Fall back to parent product's size stock validation
      IF v_size != '' THEN
        SELECT size_stock INTO v_size_stock_map
        FROM products
        WHERE id = v_prod_id;

        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            PERFORM log_payment_event('insufficient_size_stock',
              p_session_id := v_session_id,
              p_user_id := p_user_id,
              p_status := 'failed',
              p_message := 'Insufficient size stock: ' || v_size || ' for ' || v_prod_id
            );
            RAISE EXCEPTION 'Insufficient stock for size % of product %', v_size, v_prod_id;
          END IF;
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

    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_prod_id AND stock >= v_qty) THEN
      RAISE EXCEPTION 'Double-check failed: insufficient stock for product %', v_prod_id;
    END IF;

    IF v_var_id IS NOT NULL THEN
      SELECT stock, size_stock INTO v_variant_stock, v_size_stock_map
      FROM product_variants
      WHERE id = v_var_id;

      IF v_variant_stock < v_qty THEN
        RAISE EXCEPTION 'Double-check failed: insufficient variant stock for variant %', v_var_id;
      END IF;

      IF v_size != '' THEN
        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
        IF v_is_size_tracked AND COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
          RAISE EXCEPTION 'Double-check failed: insufficient size stock for variant % of size %', v_var_id, v_size;
        END IF;
      END IF;
    ELSE
      IF v_size != '' THEN
        SELECT size_stock INTO v_size_stock_map
        FROM products
        WHERE id = v_prod_id;

        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            RAISE EXCEPTION 'Double-check failed: insufficient size stock for % of %', v_size, v_prod_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Create order record
  INSERT INTO orders (
    user_id, email, order_number, subtotal, total, shipping_address,
    billing_address, payment_intent_id, payment_status, status
  ) VALUES (
    p_user_id, p_email, p_order_number, p_subtotal, p_total,
    p_shipping_address::jsonb, p_billing_address::jsonb,
    p_stripe_payment_intent_id, 'paid', 'confirmed'
  ) RETURNING id INTO v_order_id;

  -- Insert order items & decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Decrement checkout stock (updates parent and variant stock + size stock)
    IF NOT public.decrement_checkout_stock(
      v_prod_id,
      v_qty,
      v_size,
      v_var_id,
      v_order_id::TEXT,
      'order_checkout'
    ) THEN
      RAISE EXCEPTION 'Post-lock decrement failed for %', v_prod_id;
    END IF;

    -- Add order item row
    INSERT INTO order_items (
      order_id, product_id, variant_id, quantity, price, size, color
    ) VALUES (
      v_order_id,
      v_prod_id,
      v_var_id,
      v_qty,
      (v_item.value->>'price')::NUMERIC,
      v_size,
      COALESCE(v_item.value->>'color', '')
    );
  END LOOP;

  -- Generate invoice
  v_invoice_id := NULL;
  BEGIN
    INSERT INTO invoices (
      invoice_number, order_id, customer_id, customer_name, customer_email,
      subtotal, total_amount, status, issued_at
    ) VALUES (
      p_invoice_number, v_order_id, p_user_id,
      COALESCE((SELECT first_name || ' ' || last_name FROM profiles WHERE id = p_user_id), 'Customer'),
      COALESCE((SELECT email FROM profiles WHERE id = p_user_id), p_email),
      p_subtotal, p_total, 'paid', v_now
    )
    RETURNING id INTO v_invoice_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
      INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
      VALUES (
        v_invoice_id,
        (v_item.value->>'product_id')::UUID,
        v_item.value->>'name',
        (v_item.value->>'quantity')::INT,
        (v_item.value->>'price')::NUMERIC,
        ((v_item.value->>'quantity')::INT * (v_item.value->>'price')::NUMERIC)
      );
    END LOOP;

    INSERT INTO order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'invoice_generated', 'Invoice ' || p_invoice_number || ' generated',
            jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', p_invoice_number));

    PERFORM log_payment_event('invoice_created',
      p_order_id := v_order_id,
      p_status := 'paid',
      p_message := 'Invoice generated: ' || p_invoice_number,
      p_metadata := jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', p_invoice_number)
    );
  EXCEPTION WHEN OTHERS THEN
    -- Ignore or log
  END;

  -- Return combined result matching Tanstack client expectations
  RETURN jsonb_build_object(
    'success', TRUE,
    'order_id', v_order_id,
    'order_number', p_order_number,
    'invoice_id', v_invoice_id,
    'invoice_number', p_invoice_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_from_payment TO anon, authenticated;
