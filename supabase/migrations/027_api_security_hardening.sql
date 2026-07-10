-- Migration 027: API protection + security hardening
--
-- 1. require_admin() — throws if current user is not an admin
-- 2. Add require_admin() call to all SECURITY DEFINER admin RPCs
-- 3. Fix device_sessions unsafe FOR ALL policy

-- ─── require_admin() ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;
END;
$$;

-- ─── Fix device_sessions FOR ALL policy ─────────────────────────────────────

DROP POLICY IF EXISTS "System can manage device sessions" ON public.device_sessions;
DROP POLICY IF EXISTS "Admins can manage device sessions" ON public.device_sessions;
CREATE POLICY "Admins can manage device sessions"
  ON public.device_sessions
  FOR ALL
  USING (is_staff());

-- ─── Protect admin RPCs with require_admin() ───────────────────────────────

-- adjust_stock
CREATE OR REPLACE FUNCTION adjust_stock(
  p_product_id UUID,
  p_new_stock  INT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_stock INT;
  v_diff      INT;
BEGIN
  PERFORM require_admin();

  IF p_new_stock < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stock cannot be negative');
  END IF;

  SELECT stock INTO v_old_stock FROM public.products WHERE id = p_product_id;
  IF v_old_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  v_diff := p_new_stock - v_old_stock;

  UPDATE public.products SET stock = p_new_stock, updated_at = now() WHERE id = p_product_id;

  INSERT INTO public.inventory_logs (product_id, change_type, quantity_change, quantity_after, reference_id, notes, created_by)
  VALUES (
    p_product_id,
    CASE WHEN v_diff > 0 THEN 'restock'::public.inventory_change_type ELSE 'adjustment'::public.inventory_change_type END,
    v_diff,
    p_new_stock,
    'admin-adjustment',
    COALESCE(p_reason, CASE WHEN v_diff > 0 THEN 'Manual stock addition' ELSE 'Manual stock adjustment' END),
    auth.uid()
  );

  PERFORM public.check_and_generate_alerts(p_product_id);

  RETURN jsonb_build_object(
    'success', true,
    'previous_stock', v_old_stock,
    'new_stock', p_new_stock
  );
END;
$$;

-- add_stock
CREATE OR REPLACE FUNCTION add_stock(
  p_product_id UUID,
  p_quantity   INT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock INT;
BEGIN
  PERFORM require_admin();

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be greater than 0');
  END IF;

  SELECT stock INTO v_current_stock FROM public.products WHERE id = p_product_id;
  IF v_current_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  RETURN public.adjust_stock(p_product_id, v_current_stock + p_quantity, p_reason);
END;
$$;

-- remove_stock
CREATE OR REPLACE FUNCTION remove_stock(
  p_product_id UUID,
  p_quantity   INT,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_stock INT;
BEGIN
  PERFORM require_admin();

  IF p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Quantity must be greater than 0');
  END IF;

  SELECT stock INTO v_current_stock FROM public.products WHERE id = p_product_id;
  IF v_current_stock IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  IF v_current_stock < p_quantity THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient stock');
  END IF;

  RETURN public.adjust_stock(p_product_id, v_current_stock - p_quantity, p_reason);
END;
$$;

-- ─── Admin RPCs for orders, products, customers, etc. ──────────────────────

-- get_inventory_management
DROP FUNCTION IF EXISTS get_inventory_management(integer, integer, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION get_inventory_management(
  p_page         INT DEFAULT 1,
  p_page_size    INT DEFAULT 20,
  p_sort_by      TEXT DEFAULT 'name',
  p_sort_dir     TEXT DEFAULT 'asc',
  p_search       TEXT DEFAULT NULL,
  p_stock_status TEXT DEFAULT NULL,
  p_category_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_order  TEXT;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.name ILIKE %L OR p.sku ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%');
  END IF;
  IF p_stock_status = 'low' THEN
    v_where := v_where || ' AND p.stock > 0 AND p.stock <= 10';
  ELSIF p_stock_status = 'out' THEN
    v_where := v_where || ' AND p.stock = 0';
  ELSIF p_stock_status = 'overstock' THEN
    v_where := v_where || ' AND p.stock > 100';
  END IF;
  IF p_category_id IS NOT NULL THEN
    v_where := v_where || format(' AND p.category_id = %L', p_category_id);
  END IF;

  v_order := CASE p_sort_by
    WHEN 'stock' THEN 'p.stock'
    WHEN 'updated_at' THEN 'p.updated_at'
    WHEN 'category' THEN 'c.name'
    ELSE 'p.name'
  END;
  v_order := v_order || CASE WHEN p_sort_dir = 'desc' THEN ' DESC' ELSE ' ASC' END;

  EXECUTE format(
    'SELECT
      (SELECT COUNT(*) FROM public.products p %s) AS total,
      COALESCE(jsonb_agg(sub), ''[]''::jsonb) AS products
    FROM (
      SELECT
        p.id, p.name, p.sku, p.stock, p.is_active, p.updated_at,
        COALESCE(c.name, ''Uncategorized'') AS category_name
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      %s
      ORDER BY %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where, v_order, p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- resolve_alert
CREATE OR REPLACE FUNCTION resolve_alert(p_alert_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM require_admin();

  UPDATE public.inventory_alerts
  SET resolved = true, resolved_at = now()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── Order management ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_status   TEXT,
  p_notes    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM require_admin();

  UPDATE public.orders
  SET status = p_status, notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── Customer management ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_customers_management(
  p_page       INT DEFAULT 1,
  p_page_size  INT DEFAULT 20,
  p_search     TEXT DEFAULT NULL,
  p_sort_by    TEXT DEFAULT 'created_at',
  p_sort_dir   TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.email ILIKE %L OR p.first_name ILIKE %L OR p.last_name ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%', '%' || p_search || '%');
  END IF;

  EXECUTE format(
    'SELECT
      (SELECT COUNT(*) FROM public.profiles p %s) AS total,
      COALESCE(jsonb_agg(sub), ''[]''::jsonb) AS customers
    FROM (
      SELECT
        p.id, p.email, p.first_name, p.last_name, p.phone, p.avatar_url,
        p.created_at, p.last_login_at
      FROM public.profiles p
      %s
      ORDER BY p.%s %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where,
    CASE WHEN p_sort_by = 'name' THEN 'first_name' ELSE p_sort_by END,
    CASE WHEN p_sort_dir = 'desc' THEN 'DESC' ELSE 'ASC' END,
    p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Product management ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_products_management(
  p_page         INT DEFAULT 1,
  p_page_size    INT DEFAULT 20,
  p_search       TEXT DEFAULT NULL,
  p_sort_by      TEXT DEFAULT 'name',
  p_sort_dir     TEXT DEFAULT 'asc',
  p_category_id  UUID DEFAULT NULL,
  p_status       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.name ILIKE %L OR p.sku ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%');
  END IF;
  IF p_category_id IS NOT NULL THEN
    v_where := v_where || format(' AND p.category_id = %L', p_category_id);
  END IF;
  IF p_status = 'active' THEN
    v_where := v_where || ' AND p.is_active = true';
  ELSIF p_status = 'inactive' THEN
    v_where := v_where || ' AND p.is_active = false';
  END IF;

  EXECUTE format(
    'SELECT
      (SELECT COUNT(*) FROM public.products p %s) AS total,
      COALESCE(jsonb_agg(sub), ''[]''::jsonb) AS products
    FROM (
      SELECT p.id, p.name, p.sku, p.price, p.stock, p.is_active, p.created_at,
        COALESCE(c.name, ''Uncategorized'') AS category_name
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      %s
      ORDER BY p.%s %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where,
    CASE WHEN p_sort_by = 'category' THEN 'c.name' WHEN p_sort_by = 'price' THEN 'p.price' WHEN p_sort_by = 'stock' THEN 'p.stock' ELSE 'p.name' END,
    CASE WHEN p_sort_dir = 'desc' THEN 'DESC' ELSE 'ASC' END,
    p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Finance ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_invoices_management(
  p_page         INT DEFAULT 1,
  p_page_size    INT DEFAULT 20,
  p_search       TEXT DEFAULT NULL,
  p_sort_by      TEXT DEFAULT 'created_at',
  p_sort_dir     TEXT DEFAULT 'desc',
  p_status_filter TEXT DEFAULT NULL,
  p_date_from    DATE DEFAULT NULL,
  p_date_to      DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := 'TRUE';
BEGIN
  PERFORM require_admin();

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
    'SELECT
      (SELECT COUNT(*) FROM public.invoices i WHERE %s) AS total,
      COALESCE(jsonb_agg(sub), ''[]''::jsonb) AS invoices
    FROM (
      SELECT i.id, i.invoice_number, i.customer_name, i.customer_email,
        i.subtotal, i.tax, i.total, i.status, i.issued_at, i.paid_at
      FROM public.invoices i
      WHERE %s
      ORDER BY %s %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where,
    CASE WHEN p_sort_by = 'total' THEN 'i.total' WHEN p_sort_by = 'status' THEN 'i.status' WHEN p_sort_by = 'issued_at' THEN 'i.issued_at' ELSE 'i.created_at' END,
    CASE WHEN p_sort_dir = 'desc' THEN 'DESC' ELSE 'ASC' END,
    p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ─── Security/audit RPCs ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_activity_timeline(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_entity_type TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM audit_logs al
  WHERE (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_action IS NULL OR al.action = p_action)
    AND (p_search IS NULL OR al.entity_type ILIKE '%' || p_search || '%' OR al.action ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR al.created_at >= p_date_from)
    AND (p_date_to IS NULL OR al.created_at <= p_date_to)
    AND (p_actor_id IS NULL OR al.actor_id = p_actor_id);

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_results
  FROM (
    SELECT
      al.id,
      al.actor_id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.old_data,
      al.new_data,
      al.metadata,
      al.created_at,
      CASE
        WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
        THEN TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
        ELSE p.email
      END AS actor_name,
      p.avatar_url AS actor_avatar
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.actor_id
    WHERE (p_entity_type IS NULL OR al.entity_type = p_entity_type)
      AND (p_action IS NULL OR al.action = p_action)
      AND (p_search IS NULL OR al.entity_type ILIKE '%' || p_search || '%' OR al.action ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR al.created_at >= p_date_from)
      AND (p_date_to IS NULL OR al.created_at <= p_date_to)
      AND (p_actor_id IS NULL OR al.actor_id = p_actor_id)
    ORDER BY al.created_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'activities', v_results,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_audit_logs(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_entity_type TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'created_at',
  p_sort_dir TEXT DEFAULT 'desc'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
  v_order TEXT;
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  v_order := CASE
    WHEN p_sort_by = 'action' THEN 'al.action'
    WHEN p_sort_by = 'entity_type' THEN 'al.entity_type'
    WHEN p_sort_by = 'actor_name' THEN 'actor_name'
    ELSE 'al.created_at'
  END;
  v_order := v_order || ' ' || CASE WHEN p_sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END;

  SELECT COUNT(*) INTO v_total
  FROM audit_logs al
  WHERE (p_entity_type IS NULL OR al.entity_type = p_entity_type)
    AND (p_action IS NULL OR al.action = p_action)
    AND (p_search IS NULL OR al.entity_type ILIKE '%' || p_search || '%' OR al.action ILIKE '%' || p_search || '%' OR al.entity_id::TEXT ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR al.created_at >= p_date_from)
    AND (p_date_to IS NULL OR al.created_at <= p_date_to)
    AND (p_actor_id IS NULL OR al.actor_id = p_actor_id);

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(sub), ''[]''::JSONB) FROM (
      SELECT
        al.id,
        al.actor_id,
        al.action,
        al.entity_type,
        al.entity_id,
        al.old_data,
        al.new_data,
        al.metadata,
        al.ip_address,
        al.user_agent,
        al.created_at,
        CASE
          WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
          THEN TRIM(COALESCE(p.first_name,'''') || '' '' || COALESCE(p.last_name,''''))
          ELSE p.email
        END AS actor_name
      FROM audit_logs al
      LEFT JOIN profiles p ON p.id = al.actor_id
      WHERE ($1 IS NULL OR al.entity_type = $1)
        AND ($2 IS NULL OR al.action = $2)
        AND ($3 IS NULL OR al.entity_type ILIKE ''%%'' || $3 || ''%%'' OR al.action ILIKE ''%%'' || $3 || ''%%'' OR al.entity_id::TEXT ILIKE ''%%'' || $3 || ''%%'')
        AND ($4 IS NULL OR al.created_at >= $4)
        AND ($5 IS NULL OR al.created_at <= $5)
        AND ($6 IS NULL OR al.actor_id = $6)
      ORDER BY %s
      LIMIT $7 OFFSET $8
    ) sub',
    v_order
  ) INTO v_results
  USING p_entity_type, p_action, p_search, p_date_from, p_date_to, p_actor_id, p_page_size, v_offset;

  RETURN jsonb_build_object(
    'logs', v_results,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_admin_activity(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_action TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM admin_activity aa
  WHERE (p_action IS NULL OR aa.action = p_action)
    AND (p_entity_type IS NULL OR aa.entity_type = p_entity_type)
    AND (p_search IS NULL OR aa.action ILIKE '%' || p_search || '%' OR aa.entity_type ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR aa.created_at >= p_date_from)
    AND (p_date_to IS NULL OR aa.created_at <= p_date_to);

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_results
  FROM (
    SELECT
      aa.id,
      aa.admin_id,
      aa.action,
      aa.entity_type,
      aa.entity_id,
      aa.details,
      aa.ip_address,
      aa.created_at,
      CASE
        WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
        THEN TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
        ELSE p.email
      END AS admin_name,
      p.avatar_url
    FROM admin_activity aa
    LEFT JOIN profiles p ON p.id = aa.admin_id
    WHERE (p_action IS NULL OR aa.action = p_action)
      AND (p_entity_type IS NULL OR aa.entity_type = p_entity_type)
      AND (p_search IS NULL OR aa.action ILIKE '%' || p_search || '%' OR aa.entity_type ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR aa.created_at >= p_date_from)
      AND (p_date_to IS NULL OR aa.created_at <= p_date_to)
    ORDER BY aa.created_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'activities', v_results,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_active_sessions(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM device_sessions ds
  WHERE ds.is_active = true
    AND (p_search IS NULL OR ds.device_name ILIKE '%' || p_search || '%' OR ds.browser ILIKE '%' || p_search || '%');

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_results
  FROM (
    SELECT
      ds.id,
      ds.user_id,
      ds.device_name,
      ds.browser,
      ds.os,
      ds.ip_address,
      ds.last_activity_at,
      ds.started_at,
      ds.session_id,
      CASE
        WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
        THEN TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
        ELSE p.email
      END AS user_name,
      p.avatar_url
    FROM device_sessions ds
    LEFT JOIN profiles p ON p.id = ds.user_id
    WHERE ds.is_active = true
      AND (p_search IS NULL OR ds.device_name ILIKE '%' || p_search || '%' OR ds.browser ILIKE '%' || p_search || '%')
    ORDER BY ds.last_activity_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'sessions', v_results,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_failed_login_summary(
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50,
  p_search TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  PERFORM require_admin();

  v_offset := (p_page - 1) * p_page_size;

  SELECT COUNT(*) INTO v_total
  FROM failed_login_attempts fl
  WHERE (p_search IS NULL OR fl.email ILIKE '%' || p_search || '%' OR fl.ip_address ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR fl.last_attempt_at >= p_date_from)
    AND (p_date_to IS NULL OR fl.last_attempt_at <= p_date_to);

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_results
  FROM (
    SELECT
      fl.id,
      fl.user_id,
      fl.email,
      fl.ip_address,
      fl.user_agent,
      fl.attempt_count,
      fl.last_attempt_at,
      fl.created_at,
      CASE
        WHEN p.first_name IS NOT NULL OR p.last_name IS NOT NULL
        THEN TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))
        ELSE p.email
      END AS user_name
    FROM failed_login_attempts fl
    LEFT JOIN profiles p ON p.id = fl.user_id
    WHERE (p_search IS NULL OR fl.email ILIKE '%' || p_search || '%' OR fl.ip_address ILIKE '%' || p_search || '%')
      AND (p_date_from IS NULL OR fl.last_attempt_at >= p_date_from)
      AND (p_date_to IS NULL OR fl.last_attempt_at <= p_date_to)
    ORDER BY fl.last_attempt_at DESC
    LIMIT p_page_size
    OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'attempts', v_results,
    'total', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_security_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_logins_24h INT;
  v_active_sessions INT;
  v_locked_accounts INT;
  v_total_admins INT;
  v_recent_alerts JSONB;
BEGIN
  PERFORM require_admin();

  SELECT COUNT(*) INTO v_failed_logins_24h
  FROM failed_login_attempts
  WHERE last_attempt_at > now() - INTERVAL '24 hours'
    AND attempt_count >= 3;

  SELECT COUNT(*) INTO v_active_sessions
  FROM device_sessions
  WHERE is_active = true;

  SELECT COUNT(*) INTO v_locked_accounts
  FROM failed_login_attempts
  WHERE attempt_count >= 5
    AND last_attempt_at > now() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_total_admins
  FROM admin_roles
  WHERE role IN ('admin', 'superadmin');

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_recent_alerts
  FROM (
    SELECT entity_type, action, created_at
    FROM audit_logs
    WHERE created_at > now() - INTERVAL '24 hours'
      AND action IN ('deleted', 'order_status_changed')
    ORDER BY created_at DESC
    LIMIT 10
  ) sub;

  RETURN jsonb_build_object(
    'failed_logins_24h', v_failed_logins_24h,
    'active_sessions', v_active_sessions,
    'locked_accounts', v_locked_accounts,
    'total_admins', v_total_admins,
    'recent_alerts', v_recent_alerts
  );
END;
$$;
