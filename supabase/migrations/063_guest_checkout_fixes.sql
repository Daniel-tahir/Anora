-- ─── UPDATE RLS POLICIES FOR ORDERS AND ORDER ITEMS ──────────────────────────────

-- Drop old select policies
DROP POLICY IF EXISTS "Users can read own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can read own order items" ON public.order_items;

-- Recreate orders select policy with email match fallback for guest orders
CREATE POLICY "Users can read own orders"
  ON public.orders FOR SELECT
  USING (
    auth.uid() = user_id 
    OR public.is_staff()
    OR (user_id IS NULL AND (auth.jwt() ->> 'email') IS NOT NULL AND lower(email) = lower(auth.jwt() ->> 'email'))
  );

-- Recreate order_items select policy matching the orders authorization boundary
CREATE POLICY "Users can read own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND (
          orders.user_id = auth.uid() 
          OR public.is_staff()
          OR (orders.user_id IS NULL AND (auth.jwt() ->> 'email') IS NOT NULL AND lower(orders.email) = lower(auth.jwt() ->> 'email'))
        )
    )
  );


-- ─── SECURE GUEST SUCCESS ORDER RETRIEVAL RPC ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_success_order_details(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_data JSONB;
BEGIN
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
    'order_items', (
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
    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'invoice_number', i.invoice_number,
        'status', i.status,
        'total_amount', i.total_amount
      )), '[]'::jsonb)
      FROM public.invoices i
      WHERE i.order_id = o.id
    ),
    'order_timeline', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ot.id,
        'event_type', ot.event_type,
        'description', ot.description,
        'created_at', ot.created_at
      )), '[]'::jsonb)
      FROM public.order_timeline ot
      WHERE ot.order_id = o.id
    )
  ) INTO v_order_data
  FROM public.orders o
  WHERE o.id = p_order_id
    AND (
      o.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.admin_roles
        WHERE user_id = auth.uid()
      )
      -- Allow access to order details for the thank you page within 1 hour of creation if retrieved by its exact UUID
      OR o.created_at > now() - interval '1 hour'
    );

  RETURN v_order_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_success_order_details TO anon, authenticated;


-- ─── UPDATE CREATE_ORDER_FROM_PAYMENT FOR PROFILE POPULATION ─────────────────────

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
  v_item            RECORD;
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
    billing_address, stripe_payment_intent_id, payment_status, status
  ) VALUES (
    p_user_id, p_email, p_order_number, p_subtotal, p_total,
    p_shipping_address::jsonb, p_billing_address::jsonb,
    p_stripe_payment_intent_id, 'completed', 'confirmed'
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

    -- Add order item row using ONLY: order_id, product_id, variant_id, name, price, quantity, image_url, attributes
    INSERT INTO order_items (
      order_id, product_id, variant_id, name, price, quantity, image_url, attributes
    ) VALUES (
      v_order_id,
      v_prod_id,
      v_var_id,
      COALESCE(v_item.value->>'name', v_item.value->>'product_name', ''),
      (v_item.value->>'price')::NUMERIC,
      v_qty,
      v_item.value->>'image_url',
      jsonb_build_object('size', v_size)
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

  -- Update profile with guest details if profile fields are empty
  IF p_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET 
      email = COALESCE(email, p_email),
      first_name = COALESCE(first_name, p_shipping_address::jsonb->>'firstName'),
      last_name = COALESCE(last_name, p_shipping_address::jsonb->>'lastName')
    WHERE id = p_user_id;
  END IF;

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


-- ─── UNIFIED CUSTOMER MANAGEMENT RPCS (GROUPED BY EMAIL) ─────────────────────────

CREATE OR REPLACE FUNCTION public.get_customers_management(
  p_page       INT DEFAULT 1,
  p_page_size  INT DEFAULT 20,
  p_search     TEXT DEFAULT NULL,
  p_sort_by    TEXT DEFAULT 'created_at',
  p_sort_dir   TEXT DEFAULT 'desc',
  p_segment    TEXT DEFAULT NULL,
  p_activity   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset  INT;
  v_total   INT;
  v_result  JSONB;
  v_sort_col TEXT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  -- Determine sort column
  v_sort_col := CASE
    WHEN p_sort_by = 'name'           THEN 'coalesce(first_name, '''') || '' '' || coalesce(last_name, '''')'
    WHEN p_sort_by = 'email'          THEN 'email'
    WHEN p_sort_by = 'orders_count'   THEN 'orders_count'
    WHEN p_sort_by = 'total_spent'    THEN 'total_spent'
    WHEN p_sort_by = 'created_at'     THEN 'registration_date'
    WHEN p_sort_by = 'last_activity'  THEN 'last_activity'
    ELSE 'registration_date'
  END;

  -- Build CTEs
  WITH customer_emails AS (
    SELECT DISTINCT lower(email) as email_key
    FROM public.profiles
    WHERE role = 'customer' AND email IS NOT NULL
    UNION
    SELECT DISTINCT lower(email) as email_key
    FROM public.orders
    WHERE email IS NOT NULL
  ),
  customer_details AS (
    SELECT
      COALESCE(p.id, min(o.id)) AS id,
      COALESCE(p.first_name, min(o.shipping_address->>'firstName')) AS first_name,
      COALESCE(p.last_name, min(o.shipping_address->>'lastName')) AS last_name,
      ce.email_key AS email,
      COALESCE(p.phone, min(o.shipping_address->>'phone')) AS phone,
      p.avatar_url,
      COALESCE(p.created_at, min(o.created_at)) AS registration_date,
      GREATEST(COALESCE(p.updated_at, min(o.created_at)), MAX(o.created_at)) AS last_activity,
      COUNT(DISTINCT o.id) AS orders_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0) AS total_spent,
      MAX(o.created_at) AS last_order_at,
      CASE
        WHEN COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0) >= 1000 THEN 'vip'
        WHEN COUNT(DISTINCT o.id) >= 2 THEN 'returning'
        ELSE 'new'
      END AS segment
    FROM customer_emails ce
    LEFT JOIN public.profiles p ON ce.email_key = lower(p.email) AND p.role = 'customer'
    LEFT JOIN public.orders o ON ce.email_key = lower(o.email) OR (o.user_id = p.id)
    GROUP BY ce.email_key, p.id, p.first_name, p.last_name, p.phone, p.avatar_url, p.created_at, p.updated_at
  ),
  filtered_customers AS (
    SELECT * FROM customer_details
    WHERE (
      p_search IS NULL OR p_search = ''
      OR first_name ILIKE '%' || p_search || '%'
      OR last_name ILIKE '%' || p_search || '%'
      OR email ILIKE '%' || p_search || '%'
      OR coalesce(first_name, '') || ' ' || coalesce(last_name, '') ILIKE '%' || p_search || '%'
    )
    AND (
      p_segment IS NULL OR p_segment = '' OR p_segment = 'all'
      OR segment = p_segment
    )
    AND (
      p_activity IS NULL OR p_activity = ''
      OR (p_activity = 'active' AND last_activity >= NOW() - INTERVAL '90 days')
      OR (p_activity = 'inactive' AND (last_activity IS NULL OR last_activity < NOW() - INTERVAL '90 days'))
    )
  )
  SELECT count(*) INTO v_total FROM filtered_customers;

  -- Now retrieve page results dynamically formatted
  EXECUTE format('
    WITH customer_emails AS (
      SELECT DISTINCT lower(email) as email_key
      FROM public.profiles
      WHERE role = ''customer'' AND email IS NOT NULL
      UNION
      SELECT DISTINCT lower(email) as email_key
      FROM public.orders
      WHERE email IS NOT NULL
    ),
    customer_details AS (
      SELECT
        COALESCE(p.id, min(o.id)) AS id,
        COALESCE(p.first_name, min(o.shipping_address->>''firstName'')) AS first_name,
        COALESCE(p.last_name, min(o.shipping_address->>''lastName'')) AS last_name,
        ce.email_key AS email,
        COALESCE(p.phone, min(o.shipping_address->>''phone'')) AS phone,
        p.avatar_url,
        COALESCE(p.created_at, min(o.created_at)) AS registration_date,
        GREATEST(COALESCE(p.updated_at, min(o.created_at)), MAX(o.created_at)) AS last_activity,
        COUNT(DISTINCT o.id) AS orders_count,
        COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (''cancelled'', ''refunded'')), 0) AS total_spent,
        MAX(o.created_at) AS last_order_at,
        CASE
          WHEN COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (''cancelled'', ''refunded'')), 0) >= 1000 THEN ''vip''
          WHEN COUNT(DISTINCT o.id) >= 2 THEN ''returning''
          ELSE ''new''
        END AS segment
      FROM customer_emails ce
      LEFT JOIN public.profiles p ON ce.email_key = lower(p.email) AND p.role = ''customer''
      LEFT JOIN public.orders o ON ce.email_key = lower(o.email) OR (o.user_id = p.id)
      GROUP BY ce.email_key, p.id, p.first_name, p.last_name, p.phone, p.avatar_url, p.created_at, p.updated_at
    ),
    filtered_customers AS (
      SELECT * FROM customer_details
      WHERE (
        %1$L IS NULL OR %1$L = ''''
        OR first_name ILIKE ''%%'' || %1$L || ''%%''
        OR last_name ILIKE ''%%'' || %1$L || ''%%''
        OR email ILIKE ''%%'' || %1$L || ''%%''
        OR coalesce(first_name, '''') || '' '' || coalesce(last_name, '''') ILIKE ''%%'' || %1$L || ''%%''
      )
      AND (
        %2$L IS NULL OR %2$L = '''' OR %2$L = ''all''
        OR segment = %2$L
      )
      AND (
        %3$L IS NULL OR %3$L = ''''
        OR (%3$L = ''active'' AND last_activity >= NOW() - INTERVAL ''90 days'')
        OR (%3$L = ''inactive'' AND (last_activity IS NULL OR last_activity < NOW() - INTERVAL ''90 days''))
      )
    )
    SELECT jsonb_build_object(
      ''customers'', COALESCE(jsonb_agg(sub ORDER BY %4$s %5$s), ''[]''::jsonb),
      ''total'', %6$L
    )
    FROM (
      SELECT * FROM filtered_customers
      ORDER BY %4$s %5$s
      LIMIT %7$L OFFSET %8$L
    ) sub
  ', p_search, p_segment, p_activity, v_sort_col, p_sort_dir, v_total, p_page_size, v_offset)
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


CREATE OR REPLACE FUNCTION public.get_customer_details(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT;
  v_profile RECORD;
  v_res JSONB;
BEGIN
  -- Check if profile exists
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  
  IF v_profile.id IS NOT NULL THEN
    v_email := v_profile.email;
    
    SELECT jsonb_build_object(
      'id',                v_profile.id,
      'first_name',        v_profile.first_name,
      'last_name',         v_profile.last_name,
      'email',             v_profile.email,
      'phone',             v_profile.phone,
      'avatar_url',        v_profile.avatar_url,
      'registration_date', v_profile.created_at,
      'last_activity',     GREATEST(v_profile.updated_at, (SELECT MAX(o.created_at) FROM public.orders o WHERE o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email))),
      'orders_count',      (SELECT COUNT(*) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')),
      'total_spent',       (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')),
      'avg_order_value',   CASE WHEN (SELECT COUNT(*) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')) > 0
                             THEN (SELECT SUM(o.total) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')) /
                                  (SELECT COUNT(*)::numeric FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded'))
                             ELSE 0 END,
      'last_order_at',     (SELECT MAX(o.created_at) FROM public.orders o WHERE o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)),
      'segment',           CASE
                             WHEN (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')) >= 1000 THEN 'vip'
                             WHEN (SELECT COUNT(*) FROM public.orders o WHERE (o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)) AND o.status NOT IN ('cancelled', 'refunded')) >= 2 THEN 'returning'
                             ELSE 'new'
                           END,
      'recent_orders',     COALESCE((
        SELECT jsonb_agg(sub.data) FROM (
          SELECT jsonb_build_object(
            'id',         o.id,
            'order_number', o.order_number,
            'created_at', o.created_at,
            'status',     o.status::TEXT,
            'total',      o.total
          ) AS data
          FROM public.orders o WHERE o.user_id = v_profile.id OR lower(o.email) = lower(v_profile.email)
          ORDER BY o.created_at DESC LIMIT 10
        ) sub
      ), '[]'::jsonb),
      'addresses',         COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id',       a.id,
          'label',    a.label,
          'line1',    a.line1,
          'line2',    a.line2,
          'city',     a.city,
          'state',    a.state,
          'postal_code', a.postal_code,
          'country',  a.country,
          'is_default', a.is_default
        ) ORDER BY a.is_default DESC, a.created_at DESC)
        FROM public.addresses a WHERE a.user_id = v_profile.id
      ), '[]'::jsonb)
    ) INTO v_res;
  ELSE
    -- If no profile, search orders by id (where p_user_id is the order ID of the guest)
    SELECT email INTO v_email FROM public.orders WHERE id = p_user_id;
    
    IF v_email IS NOT NULL THEN
      SELECT jsonb_build_object(
        'id',                p_user_id,
        'first_name',        min(o.shipping_address->>'firstName'),
        'last_name',         min(o.shipping_address->>'lastName'),
        'email',             v_email,
        'phone',             min(o.shipping_address->>'phone'),
        'avatar_url',        NULL,
        'registration_date', min(o.created_at),
        'last_activity',     MAX(o.created_at),
        'orders_count',      COUNT(DISTINCT o.id),
        'total_spent',       COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0),
        'avg_order_value',   CASE WHEN COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')) > 0
                               THEN SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')) /
                                    COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded'))::numeric
                               ELSE 0 END,
        'last_order_at',     MAX(o.created_at),
        'segment',           CASE
                               WHEN COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0) >= 1000 THEN 'vip'
                               WHEN COUNT(DISTINCT o.id) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')) >= 2 THEN 'returning'
                               ELSE 'new'
                             END,
        'recent_orders',     COALESCE((
          SELECT jsonb_agg(sub.data) FROM (
            SELECT jsonb_build_object(
              'id',         ro.id,
              'order_number', ro.order_number,
              'created_at', ro.created_at,
              'status',     ro.status::TEXT,
              'total',      ro.total
            ) AS data
            FROM public.orders ro WHERE lower(ro.email) = lower(v_email)
            ORDER BY ro.created_at DESC LIMIT 10
          ) sub
        ), '[]'::jsonb),
        'addresses',         '[]'::jsonb
      ) INTO v_res
      FROM public.orders o
      WHERE lower(o.email) = lower(v_email);
    ELSE
      v_res := '{}'::jsonb;
    END IF;
  END IF;

  RETURN v_res;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_customers_analytics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH customer_emails AS (
    SELECT DISTINCT lower(email) as email_key
    FROM public.profiles
    WHERE role = 'customer' AND email IS NOT NULL
    UNION
    SELECT DISTINCT lower(email) as email_key
    FROM public.orders
    WHERE email IS NOT NULL
  ),
  customer_details AS (
    SELECT
      ce.email_key AS email,
      COUNT(DISTINCT o.id) AS orders_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0) AS total_spent
    FROM customer_emails ce
    LEFT JOIN public.profiles p ON ce.email_key = lower(p.email) AND p.role = 'customer'
    LEFT JOIN public.orders o ON ce.email_key = lower(o.email) OR (o.user_id = p.id)
    GROUP BY ce.email_key
  )
  SELECT jsonb_build_object(
    'totalCustomers',     (SELECT COUNT(*) FROM customer_details),
    'newCustomers',       (SELECT COUNT(*) FROM customer_details WHERE total_spent < 1000 AND orders_count <= 1),
    'returningCustomers',  (SELECT COUNT(*) FROM customer_details WHERE total_spent < 1000 AND orders_count >= 2),
    'vipCustomers',       (SELECT COUNT(*) FROM customer_details WHERE total_spent >= 1000)
  );
$$;
