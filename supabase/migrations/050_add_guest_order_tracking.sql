-- ─── ADD GUEST ORDER TRACKING COLUMNS ───────────────────────────────────────
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS tracking_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS estimated_delivery TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shipping_method TEXT,
  ADD COLUMN IF NOT EXISTS courier TEXT,
  ADD COLUMN IF NOT EXISTS courier_tracking_number TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_id ON public.orders(tracking_id);

-- Helper to generate unique tracking IDs: 6 chars, uppercase alphanumeric (excluding confusing chars like I, O, 0, 1)
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
    FOR i IN 1..6 LOOP
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

-- Trigger to automatically assign tracking_id on order insertion
CREATE OR REPLACE FUNCTION public.set_order_tracking_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tracking_id IS NULL THEN
    NEW.tracking_id := public.generate_unique_tracking_id();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_set_order_tracking_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_order_tracking_id();

-- Backfill existing orders with a generated unique tracking ID if null
DO $$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN SELECT id FROM public.orders WHERE tracking_id IS NULL LOOP
    UPDATE public.orders
    SET tracking_id = public.generate_unique_tracking_id()
    WHERE id = v_order.id;
  END LOOP;
END;
$$;

-- Secure guest order tracking search by tracking_id
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
    )
  ) INTO v_order_data
  FROM public.orders o
  WHERE o.tracking_id = p_tracking_id;

  RETURN v_order_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_id TO anon, authenticated;
