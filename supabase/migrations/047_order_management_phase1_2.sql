-- ============================================================================
-- ANORA — Order Management Phase 1 & 2
-- Migration 047: Status history, cancellation, refund requests, internal notes
-- ============================================================================
-- Apply AFTER 046_fix_search_path_casts_pg17.sql
-- ============================================================================

-- ─── 1. ADD NEW ORDER STATUSES ──────────────────────────────────────────────
-- Adds 'packed' and 'out_for_delivery' to the order_status enum.
-- Uses ALTER TYPE ... ADD (safe — only appends, doesn't reorder).

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'packed';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';

-- ─── 2. ADD CANCELLATION & INTERNAL NOTES COLUMNS ──────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by   TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS internal_notes  TEXT;

-- ─── 3. ORDER STATUS HISTORY TABLE ─────────────────────────────────────────
-- Append-only audit trail for every status change.

CREATE TABLE IF NOT EXISTS public.order_status_history (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID         NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status TEXT,
  new_status      TEXT         NOT NULL,
  changed_by      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osh_order    ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_osh_created  ON public.order_status_history(order_id, created_at DESC);

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage order_status_history"
  ON public.order_status_history FOR ALL
  USING (is_staff());

CREATE POLICY "Customers can view own order_status_history"
  ON public.order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_status_history.order_id
    AND (orders.user_id = auth.uid() OR is_staff())
  ));

-- ─── 4. UPDATE get_order_metrics ───────────────────────────────────────────
-- Include counts for new statuses.

CREATE OR REPLACE FUNCTION public.get_order_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'totalOrders',      (SELECT COUNT(*) FROM public.orders),
    'pendingOrders',    (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'processingOrders', (SELECT COUNT(*) FROM public.orders WHERE status IN ('processing', 'packed', 'out_for_delivery')),
    'deliveredOrders',  (SELECT COUNT(*) FROM public.orders WHERE status = 'delivered'),
    'cancelledOrders',  (SELECT COUNT(*) FROM public.orders WHERE status = 'cancelled'),
    'returnedOrders',   (SELECT COUNT(*) FROM public.orders WHERE status = 'returned'),
    'refundedOrders',   (SELECT COUNT(*) FROM public.orders WHERE status = 'refunded')
  );
$$;

-- ─── 5. UPDATE get_order_details ───────────────────────────────────────────
-- Include cancellation info, internal_notes, status history, and refunds.

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

-- ─── 6. UPDATE update_order_status ─────────────────────────────────────────
-- Supports new status transitions and records history.

CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_status   TEXT,
  p_note     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_valid          BOOLEAN;
BEGIN
  SELECT status::TEXT INTO v_current_status
  FROM public.orders WHERE id = p_order_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('pending', 'confirmed'), ('pending', 'cancelled'),
      ('confirmed', 'processing'), ('confirmed', 'cancelled'),
      ('processing', 'packed'), ('processing', 'cancelled'),
      ('packed', 'shipped'), ('packed', 'cancelled'),
      ('shipped', 'out_for_delivery'),
      ('out_for_delivery', 'delivered'),
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

  UPDATE public.orders
  SET status = p_status::public.order_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (p_order_id, v_current_status, p_status, auth.uid(), p_note);

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'status_change',
    CASE
      WHEN p_status = 'cancelled' THEN 'Order cancelled'
      ELSE 'Status changed from ' || v_current_status || ' to ' || p_status
    END,
    jsonb_build_object('from_status', v_current_status, 'to_status', p_status));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 7. CANCEL ORDER RPC ───────────────────────────────────────────────────
-- Validates cancellation is allowed, records reason, updaes status.

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_reason   TEXT,
  p_cancelled_by TEXT DEFAULT 'customer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_user_id        UUID;
  v_order_owner_id UUID;
BEGIN
  SELECT status::TEXT, user_id INTO v_current_status, v_order_owner_id
  FROM public.orders WHERE id = p_order_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Validate cancellation is allowed from current status
  IF v_current_status NOT IN ('pending', 'confirmed', 'processing') THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Order cannot be cancelled in its current status');
  END IF;

  -- If cancelled by customer, verify they own the order
  IF p_cancelled_by = 'customer' AND v_order_owner_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to cancel this order');
  END IF;

  UPDATE public.orders
  SET status = 'cancelled'::public.order_status,
      cancelled_by = p_cancelled_by,
      cancelled_at = now(),
      cancellation_reason = p_reason,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (p_order_id, v_current_status, 'cancelled', auth.uid(), p_reason);

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'cancellation',
    CASE WHEN p_cancelled_by = 'customer' THEN 'Cancelled by customer: ' || p_reason
         ELSE 'Cancelled by staff: ' || p_reason
    END,
    jsonb_build_object('reason', p_reason, 'cancelled_by', p_cancelled_by));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 8. ADD INTERNAL NOTE RPC ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_internal_note(
  p_order_id UUID,
  p_note     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.orders
  SET internal_notes = CASE
      WHEN internal_notes IS NULL OR internal_notes = '' THEN p_note
      ELSE internal_notes || E'\n---\n[' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') || '] ' || p_note
    END,
    updated_at = now()
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'admin_action', 'Internal note added',
          jsonb_build_object('note_preview', left(p_note, 100)));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 9. REQUEST REFUND RPC (customer-facing) ───────────────────────────────
-- Creates a refund request. Only allowed for delivered orders.
-- Admin processes it via existing process_refund RPC.

CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id UUID,
  p_reason   TEXT,
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

  INSERT INTO public.refunds (order_id, amount, reason, status)
  VALUES (p_order_id, v_total, COALESCE(p_reason || CASE WHEN p_description IS NOT NULL AND p_description != '' THEN ': ' || p_description ELSE '' END, 'Customer requested'), 'pending');

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'payment_refunded', 'Refund requested: ' || p_reason,
          jsonb_build_object('reason', p_reason, 'description', p_description));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================================================
-- End of migration 047
-- ============================================================================
