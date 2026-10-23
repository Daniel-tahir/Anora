-- ============================================================================
-- ANORA — Fix get_order_details Customer Information Fallback
-- Migration 065: Use order-level email and address data when profile fields are NULL
-- ============================================================================

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
        'first_name', COALESCE(p.first_name, o.shipping_address ->> 'firstName', o.shipping_address ->> 'first_name'),
        'last_name',  COALESCE(p.last_name, o.shipping_address ->> 'lastName', o.shipping_address ->> 'last_name'),
        'email',      COALESCE(p.email, o.email),
        'phone',      COALESCE(p.phone, o.shipping_address ->> 'phone')
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

GRANT EXECUTE ON FUNCTION public.get_order_details(UUID) TO anon, authenticated;
