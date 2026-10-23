-- ─── GET ORDER BY TRACKING RPC ─────────────────────────────────────────────
-- Safely fetches order tracking details for guest users matching order number and billing email.
-- Defined with SECURITY DEFINER to bypass RLS since guests don't own the order.

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
  v_order_data JSONB;
BEGIN
  -- First find the order
  SELECT id, user_id INTO v_order_id, v_user_id
  FROM public.orders
  WHERE order_number = p_order_number;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify the email matches the profile
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND lower(email) = lower(p_email)
  ) THEN
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
