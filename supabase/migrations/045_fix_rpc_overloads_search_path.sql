-- ============================================================================
-- Migration 045: Fix RPC overloads and search_path
--
-- Problems fixed:
-- 1. update_order_status had 2 overloads (2-param from 024, 3-param from 033).
--    Client calls with 2 params → hits the 2-param version from 024 which has
--    NO admin auth check. 3-param version had SET search_path = ''.
-- 2. get_invoice_details used row_to_json() with SET search_path = ''.
-- 3. get_invoices_management had SET search_path = ''.
-- 4. get_order_details had SET search_path = ''.
--
-- Fix: Drop ALL overloads of each function, recreate single version with
-- SET search_path = 'public' so public-schema types and functions resolve.
-- ============================================================================

-- ─── Helper: drop all overloads of named function ────────────────────────────

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
-- 1. update_order_status — single 3-param version (p_notes DEFAULT NULL) so
--    both 2-param and 3-param client calls resolve to this function.
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
--    to avoid any implicit dependency on pg_catalog schema.
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
-- 3. get_invoices_management — SET search_path = 'public'
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
-- 4. get_order_details — SET search_path = 'public'
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
