-- Make user_id nullable on orders table for guest checkouts
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- Add email column to orders table if it doesn't exist
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS email TEXT;

-- Update create_order_from_payment database function to accept p_email as an optional parameter and store it
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
  p_items                 JSONB,
  p_coupon_code           TEXT DEFAULT NULL,
  p_shipping_method       TEXT DEFAULT 'standard',
  p_email                 TEXT DEFAULT NULL
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order_id        UUID;
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
  v_order           RECORD;
BEGIN
  -- Parse items array
  v_parsed_items := COALESCE(p_items, '[]'::jsonb);

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

  -- Trigger background queue jobs for emails
  INSERT INTO background_jobs (job_type, payload) VALUES
    ('generate_invoice', jsonb_build_object('order_id', v_order_id)),
    ('generate_invoice_pdf', jsonb_build_object('order_id', v_order_id)),
    ('send_thank_you_email', jsonb_build_object('order_id', v_order_id)),
    ('send_invoice_email', jsonb_build_object('order_id', v_order_id)),
    ('send_admin_email', jsonb_build_object('order_id', v_order_id)),
    ('analytics_events', jsonb_build_object('order_id', v_order_id)),
    ('application_logs', jsonb_build_object('order_id', v_order_id));

  RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;
END;
$$;


-- Update get_order_by_tracking to support guest email matching
CREATE OR REPLACE FUNCTION public.get_order_by_tracking(
  p_order_number TEXT,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id UUID;
  v_user_id UUID;
  v_order_email TEXT;
  v_order_data JSONB;
BEGIN
  -- First find the order
  SELECT id, user_id, email INTO v_order_id, v_user_id, v_order_email
  FROM public.orders
  WHERE order_number = p_order_number;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify the email matches either the order.email (for guests) or the profile.email (for users)
  IF (v_order_email IS NOT NULL AND lower(v_order_email) = lower(p_email)) THEN
    -- Match found via order.email
  ELSIF (v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND lower(email) = lower(p_email)
  )) THEN
    -- Match found via profile.email
  ELSE
    RETURN NULL;
  END IF;

  -- Email matches, construct and return the order data
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status::TEXT,
    'payment_status', o.payment_status::TEXT,
    'payment_method', o.payment_method,
    'subtotal', o.subtotal,
    'total', o.total,
    'shipping_address', o.shipping_address,
    'billing_address', o.billing_address,
    'created_at', o.created_at,
    'updated_at', o.updated_at,
    'items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'name', oi.name,
        'price', oi.price,
        'quantity', oi.quantity,
        'image_url', oi.image_url,
        'attributes', oi.attributes
      )), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    ),
    'status_history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sh.id,
        'previous_status', sh.previous_status,
        'new_status', sh.new_status,
        'note', sh.note,
        'created_at', sh.created_at
      ) ORDER BY sh.created_at ASC), '[]'::jsonb)
      FROM public.order_status_history sh
      WHERE sh.order_id = o.id
    )
  ) INTO v_order_data
  FROM public.orders o
  WHERE o.id = v_order_id;

  RETURN v_order_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_tracking TO anon, authenticated;
