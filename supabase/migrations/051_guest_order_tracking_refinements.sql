-- ─── UPDATE UNIQUE TRACKING ID FORMAT TO 8 CHARACTERS ─────────────────────────
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_id TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_id := '';
    -- Increased to 8 characters loop
    FOR i IN 1..8 LOOP
      v_id := v_id || substr(v_chars, floor(random() * length(v_chars) + 1)::integer, 1);
    END LOOP;
    
    SELECT EXISTS (
      SELECT 1 FROM public.orders WHERE tracking_id = v_id
    ) INTO v_exists;
    
    IF NOT v_exists THEN
      RETURN v_id;
    END IF;
  END LOOP;
END;
$$;

-- ─── UPDATE GUEST ACCESS QUERY RPC TO SECURELY RETURN PRODUCTS LIST ───────────
CREATE OR REPLACE FUNCTION public.get_order_by_tracking_id(
  p_tracking_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_data JSONB;
BEGIN
  SELECT jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status::TEXT,
    'tracking_id', o.tracking_id,
    'estimated_delivery', o.estimated_delivery,
    'shipping_method', o.shipping_method,
    'courier', o.courier,
    'courier_tracking_number', o.courier_tracking_number,
    'created_at', o.created_at,
    'order_status_history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sh.id,
        'previous_status', sh.previous_status,
        'new_status', sh.new_status,
        'note', sh.note,
        'created_at', sh.created_at
      ) ORDER BY sh.created_at ASC), '[]'::jsonb)
      FROM public.order_status_history sh
      WHERE sh.order_id = o.id
    ),
    'order_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', oi.name,
        'image_url', oi.image_url,
        'quantity', oi.quantity,
        'attributes', oi.attributes
      ) ORDER BY oi.created_at ASC), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
    )
  ) INTO v_order_data
  FROM public.orders o
  WHERE o.tracking_id = p_tracking_id;

  RETURN v_order_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_id TO anon, authenticated;
