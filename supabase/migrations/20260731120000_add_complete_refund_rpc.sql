-- Add complete_refund_transaction RPC to perform atomic refund completion
CREATE OR REPLACE FUNCTION public.complete_refund_transaction(
  p_refund_id UUID,
  p_admin_user_id UUID,
  p_stripe_refund_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id UUID;
  v_refund_amount NUMERIC(10,2);
  v_refund_status TEXT;
  v_order_status TEXT;
  v_order_email TEXT;
  v_order_number TEXT;
  v_updated_refunds INT;
BEGIN
  -- 1. Get refund and order details
  SELECT order_id, amount, status
  INTO v_order_id, v_refund_amount, v_refund_status
  FROM public.refunds
  WHERE id = p_refund_id;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund not found');
  END IF;

  IF v_refund_status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  SELECT status, email, order_number
  INTO v_order_status, v_order_email, v_order_number
  FROM public.orders
  WHERE id = v_order_id;

  -- 2. Update refunds status to completed
  UPDATE public.refunds
  SET
    status = 'completed',
    processed_at = now(),
    processed_by = COALESCE(p_admin_user_id, processed_by),
    stripe_refund_id = COALESCE(p_stripe_refund_id, stripe_refund_id),
    updated_at = now()
  WHERE id = p_refund_id AND status != 'completed';

  GET DIAGNOSTICS v_updated_refunds = ROW_COUNT;
  IF v_updated_refunds = 0 THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  -- 3. Update orders status and payment_status to refunded
  UPDATE public.orders
  SET
    status = 'refunded',
    payment_status = 'refunded',
    updated_at = now()
  WHERE id = v_order_id;

  -- 4. Insert into order_status_history
  INSERT INTO public.order_status_history (
    order_id,
    previous_status,
    new_status,
    changed_by,
    note
  ) VALUES (
    v_order_id,
    v_order_status,
    'refunded',
    p_admin_user_id,
    'Refund completed via processor'
  );

  -- 5. Insert into order_timeline
  INSERT INTO public.order_timeline (
    order_id,
    event_type,
    description,
    metadata,
    created_at
  ) VALUES (
    v_order_id,
    'payment_refunded',
    'Refund completed for order: $' || to_char(v_refund_amount, 'FM999,999.00') || '.',
    jsonb_build_object(
      'refund_id', p_refund_id,
      'stripe_refund_id', COALESCE(p_stripe_refund_id, '')
    ),
    now()
  );

  -- 6. Insert into audit_logs
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by
  ) VALUES (
    'refunds',
    p_refund_id,
    'complete',
    jsonb_build_object('status', v_refund_status),
    jsonb_build_object('status', 'completed'),
    p_admin_user_id
  );

  RETURN jsonb_build_object('success', true, 'already_completed', false);
END;
$$;
