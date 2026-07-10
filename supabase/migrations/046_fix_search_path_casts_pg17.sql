-- ============================================================================
-- Migration 046: Fix search_path, casts, and PG17 compatibility
--
-- Problems fixed:
-- 1. update_order_status: bare `p_status` without `::order_status` cast causes
--    42804 error when set search_path = ''. Also missing transition validation.
-- 2. get_invoice_details: row_to_json() with ORDER BY in aggregate subquery
--    causes 42803 error on PostgreSQL 17.
-- 3. ALL functions: `SET search_path = ''` breaks unqualified type references.
--    Fixed to `SET search_path = 'public'`.
--
-- This migration supersedes migration 045 (never applied).
-- ============================================================================

-- ─── Helper: drop all overloads of named functions ─────────────────────────

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_order_status',
        'get_invoice_details',
        'generate_invoice',
        'update_invoice_status',
        'get_invoices_management',
        'get_order_details'
      )
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || rec.signature || ' CASCADE';
  END LOOP;
END;
$$;

-- ============================================================================
-- 1. update_order_status — bare p_status → p_status::order_status cast
--    + transition validation from the state machine
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_status   TEXT,
  p_notes    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_current_status TEXT;
  v_valid          BOOLEAN;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  SELECT status::TEXT INTO v_current_status
  FROM orders WHERE id = p_order_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('pending', 'confirmed'), ('pending', 'cancelled'),
      ('confirmed', 'processing'), ('confirmed', 'cancelled'),
      ('processing', 'shipped'), ('processing', 'cancelled'),
      ('shipped', 'delivered'),
      ('delivered', 'returned'),
      ('cancelled', 'refunded'),
      ('returned', 'refunded')
    ) AS t(from_status, to_status)
    WHERE t.from_status = v_current_status AND t.to_status = p_status
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid status transition from %s to %s', v_current_status, p_status)
    );
  END IF;

  UPDATE orders
  SET status = p_status::order_status, notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status TO authenticated;

-- ============================================================================
-- 2. get_invoice_details — replace row_to_json() with jsonb_build_object()
--    to avoid PG17 42803 error (ORDER BY in aggregate subquery)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_invoice_details(p_invoice_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'order_id', i.order_id,
      'customer_id', i.customer_id,
      'customer_name', i.customer_name,
      'customer_email', i.customer_email,
      'subtotal', i.subtotal,
      'tax_amount', i.tax_amount,
      'tax_rate', i.tax_rate,
      'discount_amount', i.discount_amount,
      'shipping_amount', i.shipping_amount,
      'total_amount', i.total_amount,
      'status', i.status,
      'issued_at', i.issued_at,
      'paid_at', i.paid_at,
      'created_at', i.created_at,
      'pdf_path', i.pdf_path
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', it.id,
        'invoice_id', it.invoice_id,
        'product_id', it.product_id,
        'product_name', it.product_name,
        'quantity', it.quantity,
        'unit_price', it.unit_price,
        'total_price', it.total_price,
        'created_at', it.created_at
      ))
      FROM invoice_items it
      WHERE it.invoice_id = i.id
      ORDER BY it.created_at
    ), '[]'::jsonb),
    'order', jsonb_build_object(
      'id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'total', o.total,
      'created_at', o.created_at
    ),
    'customer', jsonb_build_object(
      'id', p.id,
      'first_name', p.first_name,
      'last_name', p.last_name,
      'email', p.email
    )
  )
  INTO v_result
  FROM invoices i
  JOIN orders o ON o.id = i.order_id
  JOIN profiles p ON p.id = i.customer_id
  WHERE i.id = p_invoice_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoice_details TO authenticated;

-- ============================================================================
-- 3. generate_invoice — SET search_path = 'public'
--    (invoice_number_seq already qualified as public.invoice_number_seq)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_invoice(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order         RECORD;
  v_customer      RECORD;
  v_invoice_id    UUID;
  v_invoice_num   TEXT;
  v_existing      UUID;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE order_id = p_order_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already exists for this order', 'invoice_id', v_existing);
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT * INTO v_customer FROM profiles WHERE id = v_order.user_id;

  v_invoice_num := 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 6, '0');

  INSERT INTO invoices (
    invoice_number, order_id, customer_id, customer_name, customer_email,
    subtotal, tax_amount, tax_rate, discount_amount, shipping_amount, total_amount,
    status, issued_at
  ) VALUES (
    v_invoice_num, p_order_id, v_order.user_id,
    COALESCE(v_customer.first_name || ' ' || v_customer.last_name, v_customer.email),
    v_customer.email,
    v_order.subtotal, COALESCE(v_order.tax_amount, 0), COALESCE(v_order.tax_rate, 0),
    COALESCE(v_order.discount, 0), COALESCE(v_order.shipping_cost, 0), v_order.total,
    'issued', now()
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT v_invoice_id, oi.product_id, oi.name, oi.quantity, oi.price, (oi.price * oi.quantity)
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_invoice TO authenticated;

-- ============================================================================
-- 4. update_invoice_status — SET search_path = 'public'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_invoice_status(
  p_invoice_id UUID,
  p_status     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  SELECT status INTO v_old_status FROM invoices WHERE id = p_invoice_id;
  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF p_status = 'paid' THEN
    UPDATE invoices SET status = p_status, paid_at = now() WHERE id = p_invoice_id;
  ELSIF p_status = 'cancelled' THEN
    UPDATE invoices SET status = p_status, cancelled_at = now() WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices SET status = p_status WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice_status TO authenticated;

-- ============================================================================
-- 5. get_invoices_management — SET search_path = 'public'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_invoices_management(
  p_page          INT DEFAULT 1,
  p_page_size     INT DEFAULT 20,
  p_search        TEXT DEFAULT NULL,
  p_sort_by       TEXT DEFAULT 'created_at',
  p_sort_dir      TEXT DEFAULT 'desc',
  p_status_filter TEXT DEFAULT NULL,
  p_date_from     DATE DEFAULT NULL,
  p_date_to       DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := 'TRUE';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (i.invoice_number ILIKE %L OR i.customer_name ILIKE %L OR i.customer_email ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%', '%' || p_search || '%');
  END IF;
  IF p_status_filter IS NOT NULL AND p_status_filter != '' THEN
    v_where := v_where || format(' AND i.status = %L', p_status_filter);
  END IF;
  IF p_date_from IS NOT NULL THEN
    v_where := v_where || format(' AND i.issued_at >= %L::timestamptz', p_date_from);
  END IF;
  IF p_date_to IS NOT NULL THEN
    v_where := v_where || format(' AND i.issued_at <= %L::timestamptz', p_date_to);
  END IF;

  EXECUTE format(
    'SELECT jsonb_build_object(
      ''total'', (SELECT COUNT(*) FROM invoices i WHERE %s),
      ''invoices'', COALESCE(jsonb_agg(sub), ''[]''::jsonb)
    )
    FROM (
      SELECT i.id, i.invoice_number, i.customer_name, i.customer_email,
        i.subtotal, i.tax_amount, i.total_amount, i.status, i.issued_at, i.paid_at
      FROM invoices i
      WHERE %s
      ORDER BY %s %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where,
    CASE WHEN p_sort_by = 'total' THEN 'i.total_amount' WHEN p_sort_by = 'status' THEN 'i.status' WHEN p_sort_by = 'issued_at' THEN 'i.issued_at' ELSE 'i.created_at' END,
    CASE WHEN p_sort_dir = 'desc' THEN 'DESC' ELSE 'ASC' END,
    p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoices_management TO authenticated;

-- ============================================================================
-- 6. get_order_details — SET search_path = 'public'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_order_details(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id',              o.id,
      'order_number',    o.order_number,
      'status',          o.status::TEXT,
      'payment_status',  o.payment_status::TEXT,
      'payment_method',  o.payment_method,
      'subtotal',        o.subtotal,
      'shipping_cost',   o.shipping_cost,
      'discount',        o.discount,
      'total',           o.total,
      'notes',           o.notes,
      'coupon_code',     o.coupon_code,
      'created_at',      o.created_at,
      'updated_at',      o.updated_at,
      'customer',        jsonb_build_object(
        'id',         p.id,
        'first_name', p.first_name,
        'last_name',  p.last_name,
        'email',      p.email,
        'phone',      p.phone
      ),
      'shipping_address', o.shipping_address,
      'billing_address',  o.billing_address,
      'items', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         oi.id,
        'product_id', oi.product_id,
        'name',       oi.name,
        'sku',        pr.sku,
        'price',      oi.price,
        'quantity',   oi.quantity,
        'total',      oi.price * oi.quantity,
        'image_url',  oi.image_url
      ) ORDER BY oi.created_at), '[]'::jsonb)
        FROM order_items oi
        LEFT JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id
      ),
      'return_requests', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         rr.id,
        'order_item_id', rr.order_item_id,
        'reason',     rr.reason,
        'status',     rr.status,
        'requested_at', rr.requested_at,
        'approved_at',  rr.approved_at,
        'rejected_at',  rr.rejected_at,
        'admin_notes',  rr.admin_notes
      ) ORDER BY rr.created_at DESC), '[]'::jsonb)
        FROM return_requests rr
        WHERE rr.order_id = o.id
      ),
      'refunds', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           r.id,
        'amount',       r.amount,
        'reason',       r.reason,
        'status',       r.status,
        'requested_at', r.requested_at,
        'processed_at', r.processed_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM refunds r
        WHERE r.order_id = o.id
      )
    )
  )
  FROM orders o
  LEFT JOIN profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_details TO authenticated;

-- ============================================================================
-- 7. create_order_from_payment — SET search_path = 'public'
--    (function body already uses public. prefix, but search_path = 'public'
--     ensures order_status enum and all types resolve)
-- ============================================================================

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
SET search_path = 'public'
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
    FROM orders
    WHERE stripe_payment_intent_id = p_stripe_payment_intent_id
    LIMIT 1;
    IF FOUND THEN
      PERFORM log_payment_event('order_already_exists',
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
    FROM orders
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
    FROM payment_sessions
    WHERE checkout_request_id = p_checkout_request_id;
  END IF;

  v_parsed_items := p_items::JSONB;

  -- === VALIDATION PASS 1: Lock and verify stock (inside transaction) ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

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

    IF v_var_id IS NOT NULL THEN
      PERFORM 1 FROM product_variants
      WHERE id = v_var_id AND stock >= v_qty
      FOR UPDATE;

      IF NOT FOUND THEN
        PERFORM log_payment_event('insufficient_variant_stock',
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
      IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_var_id AND stock >= v_qty) THEN
        RAISE EXCEPTION 'Double-check failed: insufficient variant stock for variant %', v_var_id;
      END IF;
    END IF;

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
  END LOOP;

  -- Re-check unique constraint (defense-in-depth)
  IF p_stripe_payment_intent_id IS NOT NULL AND p_stripe_payment_intent_id != '' THEN
    IF EXISTS (SELECT 1 FROM orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id) THEN
      RETURN jsonb_build_object(
        'success', true,
        'order_id', (SELECT id FROM orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id LIMIT 1),
        'order_number', (SELECT order_number FROM orders WHERE stripe_payment_intent_id = p_stripe_payment_intent_id LIMIT 1)
      );
    END IF;
  END IF;

  -- Create the order
  INSERT INTO orders (
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

  PERFORM log_payment_event('order_created',
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

    INSERT INTO order_items (order_id, product_id, variant_id, name, price, quantity, image_url, attributes)
    VALUES (v_order_id, v_prod_id, v_var_id, v_name, v_price, v_qty, v_image_url,
            jsonb_build_object('size', v_size));

    PERFORM decrement_checkout_stock(
      v_prod_id, v_qty, v_size, v_var_id,
      v_order_id::TEXT, 'order_creation'
    );
  END LOOP;

  -- Create timeline entries
  INSERT INTO order_timeline (order_id, event_type, description, metadata)
  VALUES
    (v_order_id, 'payment_received', 'Payment received: $' || round(p_amount, 2) || ' ' || upper(p_currency),
     jsonb_build_object('amount', p_amount, 'currency', p_currency)),
    (v_order_id, 'status_change', 'Order placed successfully',
     jsonb_build_object('from_status', null, 'to_status', 'confirmed'));

  -- Create payment record
  INSERT INTO payment_records (
    order_id, stripe_session_id, stripe_payment_intent_id,
    payment_method, currency, amount, status, paid_at
  ) VALUES (
    v_order_id, NULLIF(p_stripe_session_id, ''), p_stripe_payment_intent_id,
    p_payment_method, p_currency, p_amount, 'completed', v_now
  );

  PERFORM log_payment_event('payment_record_created',
    p_session_id := v_session_id,
    p_order_id := v_order_id,
    p_payment_intent_id := p_stripe_payment_intent_id,
    p_status := 'completed',
    p_message := 'Payment record created: ' || p_currency || ' ' || p_amount
  );

  -- Generate invoice (non-critical — wrapped in EXCEPTION)
  v_invoice_id := NULL;
  BEGIN
    INSERT INTO invoices (
      invoice_number, order_id, customer_id, customer_name, customer_email,
      subtotal, total_amount, status, issued_at
    ) VALUES (
      p_invoice_number, v_order_id, p_user_id,
      COALESCE((SELECT first_name || ' ' || last_name FROM profiles WHERE id = p_user_id), 'Customer'),
      (SELECT email FROM profiles WHERE id = p_user_id),
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
    INSERT INTO order_timeline (order_id, event_type, description, metadata)
    VALUES (v_order_id, 'admin_action', 'Invoice generation failed: ' || SQLERRM,
            jsonb_build_object('error', SQLERRM));
  END;

  -- Update payment session with checkout duration
  IF v_session_id IS NOT NULL THEN
    UPDATE payment_sessions
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

GRANT EXECUTE ON FUNCTION public.create_order_from_payment TO service_role;
