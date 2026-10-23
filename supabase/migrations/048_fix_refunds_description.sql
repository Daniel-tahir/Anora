-- ============================================================================
-- ANORA — Fix: Add missing `description` column to `refunds` table
-- Migration 048: Schema alignment for customer-facing refund requests
-- ============================================================================
-- Apply AFTER 047_order_management_phase1_2.sql
-- ============================================================================

-- ─── 1. ADD MISSING COLUMN ─────────────────────────────────────────────────
-- The frontend Supabase query at account.tsx:146 selects `refunds.description`.
-- The column was missing from the original migrations (012, 043).

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.refunds.description IS 'Customer-provided description for refund request';

-- ─── 2. UPDATE request_refund RPC ───────────────────────────────────────────
-- Store `description` in its own column instead of concatenating into `reason`.

CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id    UUID,
  p_reason      TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status        TEXT;
  v_total         NUMERIC;
  v_user_id       UUID;
  v_has_pending   BOOLEAN;
BEGIN
  SELECT status::TEXT, total, user_id INTO v_status, v_total, v_user_id
  FROM public.orders WHERE id = p_order_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_status != 'delivered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund can only be requested for delivered orders');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.refunds WHERE order_id = p_order_id AND status IN ('pending', 'approved'))
  INTO v_has_pending;

  IF v_has_pending THEN
    RETURN jsonb_build_object('success', false, 'error', 'A refund request is already pending for this order');
  END IF;

  INSERT INTO public.refunds (order_id, amount, reason, description, status)
  VALUES (p_order_id, v_total, p_reason, p_description, 'pending');

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'payment_refunded', 'Refund requested: ' || p_reason,
          jsonb_build_object('reason', p_reason, 'description', p_description));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 3. UPDATE get_order_details RPC ────────────────────────────────────────
-- Include `description` in the refunds JSONB aggregation.

CREATE OR REPLACE FUNCTION public.get_order_details(p_order_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'order', jsonb_build_object(
      'id',                o.id,
      'order_number',      o.order_number,
      'status',            o.status::TEXT,
      'payment_status',    o.payment_status::TEXT,
      'payment_method',    o.payment_method,
      'subtotal',          o.subtotal,
      'shipping_cost',     o.shipping_cost,
      'discount',          o.discount,
      'total',             o.total,
      'notes',             o.notes,
      'internal_notes',    o.internal_notes,
      'coupon_code',       o.coupon_code,
      'cancelled_by',      o.cancelled_by,
      'cancelled_at',      o.cancelled_at,
      'cancellation_reason', o.cancellation_reason,
      'created_at',        o.created_at,
      'updated_at',        o.updated_at,
      'customer',          jsonb_build_object(
        'id',         p.id,
        'first_name', p.first_name,
        'last_name',  p.last_name,
        'email',      p.email,
        'phone',      p.phone
      ),
      'shipping_address',  o.shipping_address,
      'billing_address',   o.billing_address,
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
        FROM public.order_items oi
        LEFT JOIN public.products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id
      ),
      'return_requests', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           rr.id,
        'order_item_id', rr.order_item_id,
        'reason',       rr.reason,
        'status',       rr.status,
        'requested_at', rr.requested_at,
        'approved_at',  rr.approved_at,
        'rejected_at',  rr.rejected_at,
        'admin_notes',  rr.admin_notes
      ) ORDER BY rr.created_at DESC), '[]'::jsonb)
        FROM public.return_requests rr
        WHERE rr.order_id = o.id
      ),
      'refunds', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           r.id,
        'amount',       r.amount,
        'reason',       r.reason,
        'description',  r.description,
        'status',       r.status,
        'requested_at', r.requested_at,
        'processed_at', r.processed_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM public.refunds r
        WHERE r.order_id = o.id
      ),
      'status_history', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',              sh.id,
        'previous_status', sh.previous_status,
        'new_status',      sh.new_status,
        'note',            sh.note,
        'created_at',      sh.created_at
      ) ORDER BY sh.created_at ASC), '[]'::jsonb)
        FROM public.order_status_history sh
        WHERE sh.order_id = o.id
      )
    )
  )
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;
$$;

-- ============================================================================
-- End of migration 048
-- ============================================================================
