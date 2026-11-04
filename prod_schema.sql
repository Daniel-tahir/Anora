--
-- PostgreSQL database dump
--

\restrict rYgJQh4ZKwPiGyjkDZIpFIYgfcqtqhqwPfl663zmCatWL48fCgy66gi2q4kqxbQ

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Debian 17.11-1.pgdg13+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.discount_type AS ENUM (
    'percentage',
    'fixed'
);


--
-- Name: inventory_change_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inventory_change_type AS ENUM (
    'order',
    'restock',
    'adjustment',
    'return',
    'cancellation'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'order_update',
    'promo',
    'newsletter',
    'system'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'returned',
    'cancelled',
    'refunded',
    'packed',
    'out_for_delivery'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'pending',
    'completed',
    'failed',
    'refunded'
);


--
-- Name: add_internal_note(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_internal_note(p_order_id uuid, p_note text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: add_stock(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_stock(p_product_id uuid, p_quantity integer, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current_stock INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: add_to_cart_safe(uuid, text, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_to_cart_safe(p_user_id uuid, p_session_id text, p_product_id uuid, p_variant_id uuid, p_quantity integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
declare
  v_stock int;
begin
  -- Get stock safely (lock row)
  if p_variant_id is null then
    select stock into v_stock
    from products
    where id = p_product_id
    for update;
  else
    select stock into v_stock
    from product_variants
    where id = p_variant_id
    for update;
  end if;

  if v_stock < p_quantity then
    return false;
  end if;

  insert into cart_items (
    user_id, session_id, product_id, variant_id, quantity
  )
  values (
    p_user_id,
    p_session_id,
    p_product_id,
    p_variant_id,
    p_quantity
  )
  on conflict do nothing;

  return true;
end;
$$;


--
-- Name: adjust_stock(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.adjust_stock(p_product_id uuid, p_new_stock integer, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_old_stock INT;
  v_diff      INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: approve_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_review(p_review_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.reviews
  SET status = 'approved', approved_at = now(), published_at = now(), updated_at = now()
  WHERE id = p_review_id;
  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: bulk_delete_products(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_delete_products(p_ids uuid[]) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  DELETE FROM public.products WHERE id = ANY(p_ids);
  SELECT jsonb_build_object('success', true);
$$;


--
-- Name: bulk_update_products(uuid[], text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_update_products(p_ids uuid[], p_status text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_status IS NOT NULL THEN
    UPDATE public.products
    SET status = p_status,
        is_active = CASE WHEN p_status = 'active' OR p_status = 'out_of_stock' THEN true ELSE false END,
        updated_at = now()
    WHERE id = ANY(p_ids);
  END IF;

  IF p_is_active IS NOT NULL AND p_status IS NULL THEN
    UPDATE public.products
    SET is_active = p_is_active,
        status = CASE WHEN p_is_active THEN
          CASE WHEN stock > 0 THEN 'active' ELSE 'out_of_stock' END
        ELSE 'draft' END,
        updated_at = now()
    WHERE id = ANY(p_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'updated', (SELECT COUNT(*) FROM unnest(p_ids) AS t WHERE t = ANY(p_ids)));
END;
$$;


--
-- Name: cancel_order(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_cancelled_by text DEFAULT 'customer'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: check_and_generate_alerts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_and_generate_alerts(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_stock INT;
  v_overstock_threshold INT := 100;
BEGIN
  SELECT stock INTO v_stock FROM public.products WHERE id = p_product_id;
  IF v_stock IS NULL THEN RETURN; END IF;

  -- Critical (0-2)
  IF v_stock <= 2 THEN
    INSERT INTO public.inventory_alerts (product_id, alert_type, threshold, current_stock)
    VALUES (p_product_id, 'critical', 2, v_stock)
    ON CONFLICT (product_id, alert_type) DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      resolved = false,
      resolved_at = NULL;
  ELSE
    UPDATE public.inventory_alerts SET resolved = true, resolved_at = now()
    WHERE product_id = p_product_id AND alert_type = 'critical' AND resolved = false;
  END IF;

  -- Low (3-10)
  IF v_stock > 2 AND v_stock <= 10 THEN
    INSERT INTO public.inventory_alerts (product_id, alert_type, threshold, current_stock)
    VALUES (p_product_id, 'low', 10, v_stock)
    ON CONFLICT (product_id, alert_type) DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      resolved = false,
      resolved_at = NULL;
  ELSE
    UPDATE public.inventory_alerts SET resolved = true, resolved_at = now()
    WHERE product_id = p_product_id AND alert_type = 'low' AND resolved = false;
  END IF;

  -- Overstock (>100)
  IF v_stock > v_overstock_threshold THEN
    INSERT INTO public.inventory_alerts (product_id, alert_type, threshold, current_stock)
    VALUES (p_product_id, 'overstock', v_overstock_threshold, v_stock)
    ON CONFLICT (product_id, alert_type) DO UPDATE SET
      current_stock = EXCLUDED.current_stock,
      resolved = false,
      resolved_at = NULL;
  ELSE
    UPDATE public.inventory_alerts SET resolved = true, resolved_at = now()
    WHERE product_id = p_product_id AND alert_type = 'overstock' AND resolved = false;
  END IF;
END;
$$;


--
-- Name: check_login_lockout(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_login_lockout(p_email text, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_recent_attempts INT;
  v_first_attempt TIMESTAMPTZ;
BEGIN
  SELECT MAX(attempt_count), MIN(last_attempt_at) INTO v_recent_attempts, v_first_attempt
  FROM failed_login_attempts
  WHERE (user_id = p_user_id OR (user_id IS NULL AND email = p_email))
    AND last_attempt_at > now() - INTERVAL '15 minutes'
  GROUP BY user_id, email
  ORDER BY MAX(last_attempt_at) DESC
  LIMIT 1;

  IF v_recent_attempts >= 5 THEN
    RETURN jsonb_build_object(
      'is_locked', true,
      'attempts', v_recent_attempts,
      'lockout_expires_at', v_first_attempt + INTERVAL '15 minutes',
      'remaining_seconds', GREATEST(0, EXTRACT(EPOCH FROM (v_first_attempt + INTERVAL '15 minutes' - now())))
    );
  END IF;

  RETURN jsonb_build_object(
    'is_locked', false,
    'attempts', COALESCE(v_recent_attempts, 0)
  );
END;
$$;


--
-- Name: check_payment_session_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_payment_session_status() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  valid_transition BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status != 'created' THEN
      RAISE EXCEPTION 'Payment session must start with status "created", got "%"', NEW.status;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM (VALUES
        ('created', 'pending'),
        ('created', 'expired'),
        ('pending', 'processing'),
        ('pending', 'failed'),
        ('pending', 'cancelled'),
        ('pending', 'expired'),
        ('processing', 'succeeded'),
        ('processing', 'failed'),
        ('succeeded', 'completed')
      ) AS t(from_status, to_status)
      WHERE from_status = OLD.status AND to_status = NEW.status
    ) INTO valid_transition;

    IF NOT valid_transition THEN
      RAISE EXCEPTION 'Invalid payment session status transition: "%" -> "%"', OLD.status, NEW.status;
    END IF;

    -- Auto-set lifecycle timestamps on transitions
    IF NEW.status = 'pending' AND OLD.status = 'created' THEN
      NEW.processing_at := NULL;
    END IF;
    IF NEW.status = 'processing' THEN
      NEW.processing_at := COALESCE(NEW.processing_at, now());
    END IF;
    IF NEW.status = 'succeeded' THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.status = 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
    IF NEW.status = 'failed' THEN
      NEW.failed_at := now();
    END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := now();
    END IF;
    IF NEW.status = 'expired' THEN
      NEW.cancelled_at := now();
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: checkout_order(uuid, numeric, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.checkout_order(p_user_id uuid, p_cart_total numeric, p_shipping jsonb, p_billing jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
declare
  v_order_id uuid;
begin
  -- Create order
  insert into orders (
    user_id,
    status,
    subtotal,
    shipping_cost,
    discount,
    total,
    payment_status,
    shipping_address,
    billing_address
  )
  values (
    p_user_id,
    'pending',
    p_cart_total,
    0,
    0,
    p_cart_total,
    'pending',
    p_shipping,
    p_billing
  )
  returning id into v_order_id;

  -- Move cart items into order_items
  insert into order_items (
    order_id,
    product_id,
    variant_id,
    name,
    price,
    quantity,
    image_url
  )
  select
    v_order_id,
    c.product_id,
    c.variant_id,
    p.name,
    p.price,
    c.quantity,
    pi.image_url
  from cart_items c
  join products p on p.id = c.product_id
  left join product_images pi on pi.product_id = p.id
  where c.user_id = p_user_id;

  -- Clear cart
  delete from cart_items where user_id = p_user_id;

  return v_order_id;
end;
$$;


--
-- Name: cleanup_expired_sessions(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_sessions(p_retention_days integer DEFAULT 90) RETURNS TABLE(expired_count integer, deleted_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_expired INTEGER := 0;
  v_deleted INTEGER := 0;
BEGIN
  -- Mark sessions as expired where expires_at is past and status is not terminal
  UPDATE public.payment_sessions
  SET status = 'expired',
      cancelled_at = now()
  WHERE status IN ('created', 'pending')
    AND expires_at < now();

  GET DIAGNOSTICS v_expired = ROW_COUNT;

  -- Delete expired sessions older than retention period
  DELETE FROM public.payment_sessions
  WHERE status IN ('expired', 'failed', 'cancelled')
    AND (completed_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL
         OR GREATEST(
           COALESCE(completed_at, '1970-01-01'::timestamptz),
           COALESCE(cancelled_at, '1970-01-01'::timestamptz),
           COALESCE(failed_at, '1970-01-01'::timestamptz)
         ) < now() - (p_retention_days || ' days')::interval);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_expired, v_deleted;
END;
$$;


--
-- Name: create_category(text, text, uuid, text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_category(p_name text, p_slug text, p_parent_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = p_slug) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this slug already exists');
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE name = p_name) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists');
  END IF;

  INSERT INTO public.categories (name, slug, parent_id, description, image_url, sort_order, is_active)
  VALUES (p_name, p_slug, p_parent_id, p_description, p_image_url, p_sort_order, p_is_active)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;


--
-- Name: create_coupon(text, text, text, numeric, numeric, integer, numeric, timestamp with time zone, timestamp with time zone, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_coupon(p_code text, p_description text DEFAULT NULL::text, p_discount_type text DEFAULT 'percentage'::text, p_discount_value numeric DEFAULT 0, p_min_order numeric DEFAULT 0, p_max_uses integer DEFAULT NULL::integer, p_maximum_discount_amount numeric DEFAULT NULL::numeric, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_coupon_id UUID;
BEGIN
  IF p_discount_type NOT IN ('percentage', 'fixed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid discount type');
  END IF;

  IF p_discount_value <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Discount value must be positive');
  END IF;

  IF p_discount_type = 'percentage' AND p_discount_value > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Percentage discount cannot exceed 100');
  END IF;

  IF p_min_order < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minimum order amount cannot be negative');
  END IF;

  IF p_maximum_discount_amount IS NOT NULL AND p_maximum_discount_amount < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Maximum discount amount cannot be negative');
  END IF;

  IF p_starts_at IS NOT NULL AND p_expires_at IS NOT NULL AND p_starts_at >= p_expires_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Start date must be before expiry date');
  END IF;

  INSERT INTO public.coupons (code, description, discount_type, discount_value, min_order, max_uses, maximum_discount_amount, starts_at, expires_at, metadata)
  VALUES (
    UPPER(TRIM(p_code)),
    p_description,
    p_discount_type::public.discount_type,
    p_discount_value,
    p_min_order,
    p_max_uses,
    p_maximum_discount_amount,
    p_starts_at,
    p_expires_at,
    p_metadata
  )
  RETURNING id INTO v_coupon_id;

  RETURN jsonb_build_object('success', true, 'id', v_coupon_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'A coupon with this code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: create_gift_card(numeric, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_gift_card(p_initial_balance numeric, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_code       TEXT;
  v_gift_card_id UUID;
  v_attempts   INT := 0;
BEGIN
  IF p_initial_balance <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Initial balance must be positive');
  END IF;

  LOOP
    v_code := UPPER(
      SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 4) || '-' ||
      SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 4) || '-' ||
      SUBSTRING(MD5(gen_random_uuid()::TEXT) FROM 1 FOR 4)
    );
    BEGIN
      INSERT INTO public.gift_cards (code, initial_balance, current_balance, expires_at, created_by)
      VALUES (v_code, p_initial_balance, p_initial_balance, p_expires_at, auth.uid())
      RETURNING id INTO v_gift_card_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        v_attempts := v_attempts + 1;
        IF v_attempts >= 10 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Failed to generate unique gift card code');
        END IF;
    END;
  END LOOP;

  INSERT INTO public.gift_card_transactions (gift_card_id, transaction_type, amount, balance_before, balance_after, notes)
  VALUES (v_gift_card_id, 'activation', p_initial_balance, 0, p_initial_balance, p_notes);

  RETURN jsonb_build_object('success', true, 'id', v_gift_card_id, 'code', v_code);
END;
$$;


--
-- Name: create_order_from_payment(uuid, text, numeric, numeric, text, text, text, text, text, text, numeric, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_order_from_payment(p_user_id uuid, p_order_number text, p_subtotal numeric, p_total numeric, p_shipping_address text, p_billing_address text, p_stripe_session_id text, p_stripe_payment_intent_id text, p_payment_method text, p_currency text, p_amount numeric, p_invoice_number text, p_items text, p_checkout_request_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order_id        UUID;
  v_invoice_id      UUID;
  v_item            RECORD; -- Declared as RECORD to support field access .value on jsonb_array_elements rows
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

  -- Clear cart for user (Delete Cart inside the transaction)
  IF p_user_id IS NOT NULL THEN
    DELETE FROM public.cart_items WHERE user_id = p_user_id;
  END IF;

  -- Update Customer Purchase History inside the transaction
  IF p_user_id IS NOT NULL THEN
    UPDATE public.profiles
    SET updated_at = v_now,
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('last_order_at', v_now, 'last_order_id', v_order_id)
    WHERE id = p_user_id;
  END IF;

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


--
-- Name: create_refund(uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_refund(p_order_id uuid, p_amount numeric, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  INSERT INTO public.refunds (order_id, amount, reason)
  VALUES (p_order_id, p_amount, p_reason)
  RETURNING jsonb_build_object('success', true, 'id', id);
$$;


--
-- Name: create_return_request(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_return_request(p_order_id uuid, p_reason text, p_order_item_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  INSERT INTO public.return_requests (order_id, order_item_id, reason)
  VALUES (p_order_id, p_order_item_id, p_reason)
  RETURNING jsonb_build_object('success', true, 'id', id);
$$;


--
-- Name: decrement_checkout_stock(uuid, integer, text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_checkout_stock(p_product_id uuid, p_quantity integer, p_size text DEFAULT NULL::text, p_variant_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_product_stock INT;
  v_variant_stock  INT;
  v_size_stock     INT;
  v_size_stock_map JSONB;
  v_is_size_tracked BOOLEAN;
  v_updated_sizes  JSONB;
  v_change_type    inventory_change_type := 'order';
  v_var_size_stock_map JSONB;
  v_var_is_size_tracked BOOLEAN;
  v_var_updated_sizes JSONB;
  v_var_size_stock INT;
BEGIN
  SELECT stock, size_stock INTO v_product_stock, v_size_stock_map
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product_stock IS NULL OR v_product_stock < p_quantity THEN
    RETURN FALSE;
  END IF;

  v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
  v_updated_sizes := v_size_stock_map;

  -- Only check/update size stock if the product actually has per-size tracking
  IF p_size IS NOT NULL AND p_size <> '' AND v_is_size_tracked THEN
    v_size_stock := COALESCE((v_updated_sizes ->> p_size)::INT, 0);
    IF v_size_stock < p_quantity THEN
      RETURN FALSE;
    END IF;
    v_updated_sizes := jsonb_set(
      COALESCE(v_updated_sizes, '{}'::jsonb),
      ARRAY[p_size],
      to_jsonb(GREATEST(v_size_stock - p_quantity, 0)),
      true
    );
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT stock, size_stock INTO v_variant_stock, v_var_size_stock_map
    FROM public.product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

    IF v_variant_stock IS NULL OR v_variant_stock < p_quantity THEN
      RETURN FALSE;
    END IF;

    v_var_is_size_tracked := v_var_size_stock_map IS NOT NULL AND v_var_size_stock_map != '{}'::jsonb;
    v_var_updated_sizes := v_var_size_stock_map;

    IF p_size IS NOT NULL AND p_size <> '' AND v_var_is_size_tracked THEN
      v_var_size_stock := COALESCE((v_var_updated_sizes ->> p_size)::INT, 0);
      IF v_var_size_stock < p_quantity THEN
        RETURN FALSE;
      END IF;
      v_var_updated_sizes := jsonb_set(
        COALESCE(v_var_updated_sizes, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(GREATEST(v_var_size_stock - p_quantity, 0)),
        true
      );
    END IF;

    UPDATE public.product_variants
    SET stock = stock - p_quantity,
        size_stock = COALESCE(v_var_updated_sizes, size_stock)
    WHERE id = p_variant_id;
  END IF;

  UPDATE public.products
  SET stock = stock - p_quantity,
      size_stock = COALESCE(v_updated_sizes, size_stock)
  WHERE id = p_product_id;

  INSERT INTO public.inventory_logs (
    product_id, variant_id, change_type, quantity_change,
    quantity_after, reference_id, notes
  ) VALUES (
    p_product_id, p_variant_id, v_change_type, -p_quantity,
    GREATEST(v_product_stock - p_quantity, 0),
    p_reference, p_notes
  );

  RETURN TRUE;
END;
$$;


--
-- Name: decrement_stock(uuid, integer, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decrement_stock(p_product_id uuid, p_quantity integer, p_variant_id uuid DEFAULT NULL::uuid, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_current_stock INT;
  v_change_type   inventory_change_type := 'order';
BEGIN
  IF p_variant_id IS NOT NULL THEN
    -- Decrement variant stock
    SELECT stock INTO v_current_stock
    FROM product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_current_stock < p_quantity THEN
      RETURN FALSE;
    END IF;

    UPDATE product_variants
    SET stock = stock - p_quantity
    WHERE id = p_variant_id;

    INSERT INTO inventory_logs (
      product_id, variant_id, change_type, quantity_change,
      quantity_after, reference_id, notes
    ) VALUES (
      p_product_id, p_variant_id, v_change_type, -p_quantity,
      v_current_stock - p_quantity, p_reference, p_notes
    );
  ELSE
    -- Decrement product-level stock
    SELECT stock INTO v_current_stock
    FROM products
    WHERE id = p_product_id
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RETURN FALSE;
    END IF;

    IF v_current_stock < p_quantity THEN
      RETURN FALSE;
    END IF;

    UPDATE products
    SET stock = stock - p_quantity
    WHERE id = p_product_id;

    INSERT INTO inventory_logs (
      product_id, change_type, quantity_change,
      quantity_after, reference_id, notes
    ) VALUES (
      p_product_id, v_change_type, -p_quantity,
      v_current_stock - p_quantity, p_reference, p_notes
    );
  END IF;

  RETURN TRUE;
END;
$$;


--
-- Name: delete_category(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_category(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product_count INT;
BEGIN
  SELECT COUNT(*) INTO v_product_count FROM public.products WHERE category_id = p_id;

  IF v_product_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Cannot delete category because %s product(s) are assigned to it', v_product_count)
    );
  END IF;

  DELETE FROM public.categories WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: delete_coupon(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_coupon(p_coupon_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.coupons WHERE id = p_coupon_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coupon not found');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: delete_review(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_review(p_review_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.reviews WHERE id = p_review_id;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true);
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Review not found');
  END IF;
END;
$$;


--
-- Name: duplicate_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.duplicate_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product       RECORD;
  v_new_id        UUID;
  v_new_sku       TEXT;
  v_new_slug      TEXT;
  v_copy_num      INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id;
  IF v_product.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Product not found');
  END IF;

  v_copy_num := 1;
  LOOP
    v_new_sku := COALESCE(v_product.sku, 'SKU') || '-COPY-' || v_copy_num;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE sku = v_new_sku);
    v_copy_num := v_copy_num + 1;
  END LOOP;

  v_new_slug := v_product.slug || '-copy-' || v_copy_num;

  -- Ensure slug is also unique
  WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = v_new_slug) LOOP
    v_copy_num := v_copy_num + 1;
    v_new_slug := v_product.slug || '-copy-' || v_copy_num;
  END LOOP;

  INSERT INTO public.products (
    category_id, name, slug, description, price, compare_price,
    sku, stock, badge, fabric, material, color, sizes, size_stock,
    is_active, featured, metadata, status
  ) VALUES (
    v_product.category_id,
    v_product.name || ' (Copy)',
    v_new_slug,
    v_product.description,
    v_product.price,
    v_product.compare_price,
    v_new_sku,
    0,
    v_product.badge,
    v_product.fabric,
    v_product.material,
    v_product.color,
    v_product.sizes,
    v_product.size_stock,
    false,
    false,
    v_product.metadata,
    'draft'
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.product_images (product_id, image_url, alt_text, sort_order)
  SELECT v_new_id, image_url, alt_text, sort_order
  FROM public.product_images
  WHERE product_id = p_product_id;

  RETURN jsonb_build_object('success', true, 'id', v_new_id);
END;
$$;


--
-- Name: end_user_session(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_user_session(p_session_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE device_sessions
  SET is_active = false, ended_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: flag_low_stock_products(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.flag_low_stock_products() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_threshold INT := 5;
  v_low_stock BOOLEAN;
BEGIN
  v_low_stock := NEW.stock > 0 AND NEW.stock <= v_threshold;

  NEW.metadata := jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{low_stock}',
    to_jsonb(v_low_stock),
    true
  );

  NEW.metadata := jsonb_set(
    NEW.metadata,
    '{low_stock_threshold}',
    to_jsonb(v_threshold),
    true
  );

  IF NEW.stock <= v_threshold AND OLD.stock > v_threshold THEN
    INSERT INTO inventory_logs (
      product_id,
      variant_id,
      change_type,
      quantity_change,
      quantity_after,
      notes
    ) VALUES (
      NEW.id,
      NULL,
      'adjustment',
      0,
      NEW.stock,
      'low_stock_threshold_crossed'
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: flag_low_stock_variants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.flag_low_stock_variants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_threshold INT := 5;
  v_low_stock BOOLEAN;
BEGIN
  v_low_stock := NEW.stock > 0 AND NEW.stock <= v_threshold;

  IF NEW.stock <= v_threshold AND OLD.stock > v_threshold THEN
    INSERT INTO inventory_logs (
      product_id,
      variant_id,
      change_type,
      quantity_change,
      quantity_after,
      notes
    ) VALUES (
      NEW.product_id,
      NEW.id,
      'adjustment',
      0,
      NEW.stock,
      'low_stock_threshold_crossed'
    );
  END IF;

  UPDATE products
  SET metadata = jsonb_set(
    jsonb_set(COALESCE(metadata, '{}'::jsonb), '{low_stock}', to_jsonb(v_low_stock), true),
    '{low_stock_threshold}',
    to_jsonb(v_threshold),
    true
  )
  WHERE id = NEW.product_id;

  RETURN NEW;
END;
$$;


--
-- Name: generate_invoice(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice(p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order         RECORD;
  v_customer      RECORD;
  v_invoice_id    UUID;
  v_invoice_num   TEXT;
  v_existing      UUID;
BEGIN
  SELECT id INTO v_existing FROM invoices WHERE order_id = p_order_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already exists for this order', 'invoice_id', v_existing);
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT * INTO v_customer FROM profiles WHERE id = v_order.user_id;

  v_invoice_num := 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD(NEXTVAL('public.invoice_number_seq')::TEXT, 6, '0');

  INSERT INTO invoices (
    invoice_number, order_id, customer_id, customer_name, customer_email,
    subtotal, tax_amount, tax_rate, discount_amount, shipping_amount, total_amount,
    status, issued_at
  ) VALUES (
    v_invoice_num, p_order_id, v_order.user_id,
    COALESCE(v_customer.first_name || ' ' || v_customer.last_name, v_customer.email),
    v_customer.email,
    v_order.subtotal, COALESCE(v_order.tax_amount, 0), COALESCE(v_order.tax_rate, 0),
    COALESCE(v_order.discount, 0), COALESCE(v_order.shipping_cost, 0), v_order.total,
    'issued', now()
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
  SELECT v_invoice_id, oi.product_id, oi.name, oi.quantity, oi.price, (oi.price * oi.quantity)
  FROM order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', v_invoice_id, 'invoice_number', v_invoice_num);
END;
$$;


--
-- Name: generate_unique_tracking_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_tracking_id() RETURNS text
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


--
-- Name: get_abandoned_cart_analytics(timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_abandoned_cart_analytics(p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_group_by text DEFAULT 'day'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_total_abandoned INT;
  v_lost_revenue NUMERIC;
  v_recovered_revenue NUMERIC;
  v_recovered_carts INT;
  v_converted_carts INT;
  v_recovery_rate NUMERIC;
  v_avg_cart_value NUMERIC;
  v_trend JSONB;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'abandoned' OR status = 'expired'),
    COALESCE(SUM(subtotal) FILTER (WHERE status = 'abandoned' OR status = 'expired'), 0),
    COALESCE(SUM(subtotal) FILTER (WHERE status = 'recovered'), 0),
    COUNT(*) FILTER (WHERE status = 'recovered'),
    COUNT(*) FILTER (WHERE status = 'converted'),
    CASE
      WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE status IN ('recovered', 'converted'))::NUMERIC / COUNT(*) * 100, 1)
      ELSE 0
    END,
    COALESCE(ROUND(AVG(subtotal), 2), 0)
  INTO
    v_total_abandoned, v_lost_revenue, v_recovered_revenue,
    v_recovered_carts, v_converted_carts, v_recovery_rate, v_avg_cart_value
  FROM abandoned_carts
  WHERE (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to IS NULL OR created_at <= p_date_to);

  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_trend
  FROM (
    SELECT
      CASE
        WHEN p_group_by = 'month' THEN to_char(created_at, 'YYYY-MM')
        WHEN p_group_by = 'week' THEN to_char(created_at, 'YYYY-"W"WW')
        ELSE to_char(created_at, 'YYYY-MM-DD')
      END AS period,
      COUNT(*) AS total_carts,
      COALESCE(SUM(subtotal), 0) AS total_value,
      COUNT(*) FILTER (WHERE status IN ('recovered', 'converted')) AS recovered,
      COALESCE(SUM(subtotal) FILTER (WHERE status IN ('recovered', 'converted')), 0) AS recovered_value
    FROM abandoned_carts
    WHERE (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to)
    GROUP BY period
    ORDER BY period
  ) sub;

  RETURN jsonb_build_object(
    'total_abandoned_carts', v_total_abandoned,
    'lost_revenue', v_lost_revenue,
    'recovered_revenue', v_recovered_revenue,
    'recovered_carts', v_recovered_carts,
    'converted_carts', v_converted_carts,
    'recovery_rate', v_recovery_rate,
    'average_cart_value', v_avg_cart_value,
    'trend', v_trend
  );
END;
$$;


--
-- Name: get_abandoned_carts(integer, integer, text, text, timestamp with time zone, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_abandoned_carts(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
  v_order TEXT;
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  v_order := CASE
    WHEN p_sort_by = 'subtotal' THEN 'ac.subtotal'
    WHEN p_sort_by = 'item_count' THEN 'ac.item_count'
    WHEN p_sort_by = 'status' THEN 'ac.status'
    WHEN p_sort_by = 'user_name' THEN 'user_name'
    ELSE 'ac.created_at'
  END;
  v_order := v_order || ' ' || CASE WHEN p_sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END;

  SELECT COUNT(*) INTO v_total
  FROM abandoned_carts ac
  WHERE (p_status IS NULL OR ac.status = p_status)
    AND (p_search IS NULL OR ac.session_id ILIKE '%' || p_search || '%')
    AND (p_date_from IS NULL OR ac.created_at >= p_date_from)
    AND (p_date_to IS NULL OR ac.created_at <= p_date_to);

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(sub), ''[]''::JSONB) FROM (
      SELECT
        ac.id,
        ac.user_id,
        ac.session_id,
        ac.subtotal,
        ac.item_count,
        ac.status,
        ac.recovered_at,
        ac.converted_at,
        ac.converted_order_id,
        ac.created_at,
        ac.updated_at,
        COALESCE(NULLIF(CONCAT_WS('' '', p.first_name, p.last_name), ''''), p.email) AS customer_name,
        p.email AS customer_email,
        COALESCE(
          (SELECT jsonb_agg(row_to_json(aci)) FROM abandoned_cart_items aci WHERE aci.cart_id = ac.id),
          ''[]''::JSONB
        ) AS items
      FROM abandoned_carts ac
      LEFT JOIN profiles p ON p.id = ac.user_id
      WHERE ($1 IS NULL OR ac.status = $1)
        AND ($2 IS NULL OR ac.session_id ILIKE ''%%'' || $2 || ''%%'')
        AND ($3 IS NULL OR ac.created_at >= $3)
        AND ($4 IS NULL OR ac.created_at <= $4)
      ORDER BY %s
      LIMIT $5 OFFSET $6
    ) sub',
    v_order
  ) INTO v_results
  USING p_status, p_search, p_date_from, p_date_to, p_page_size, v_offset;

  RETURN jsonb_build_object(
    'carts', v_results,
    'total', v_total
  );
END;
$_$;


--
-- Name: get_active_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_categories() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'description', c.description,
      'image_url', c.image_url,
      'sort_order', c.sort_order,
      'parent_id', c.parent_id,
      'product_count', (SELECT COUNT(*) FROM public.products p WHERE p.category_id = c.id AND p.is_active = true)
    ) ORDER BY c.sort_order, c.name
  ), '[]'::jsonb)
  FROM public.categories c
  WHERE c.is_active = true;
$$;


--
-- Name: get_active_sessions(integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_sessions(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_search text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: get_activity_timeline(integer, integer, text, text, text, timestamp with time zone, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_activity_timeline(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_entity_type text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_actor_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: get_admin_activity(integer, integer, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_activity(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_action text DEFAULT NULL::text, p_entity_type text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: get_admin_dashboard_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_dashboard_stats() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'totalOrders',     (SELECT COUNT(*) FROM public.orders),
    'totalRevenue',    (SELECT COALESCE(SUM(total), 0) FROM public.orders WHERE payment_status = 'completed'),
    'pendingOrders',   (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    'deliveredOrders', (SELECT COUNT(*) FROM public.orders WHERE status = 'delivered'),
    'cancelledOrders', (SELECT COUNT(*) FROM public.orders WHERE status = 'cancelled'),
    'refundRequests',  (SELECT COUNT(*) FROM public.orders WHERE status = 'refunded'),
    'totalProducts',   (SELECT COUNT(*) FROM public.products WHERE is_active = true),
    'totalCustomers',  (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer')
  );
$$;


--
-- Name: get_admin_product(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_admin_product(p_product_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_product JSONB;
  v_images JSONB;
BEGIN
  PERFORM public.require_admin();

  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'sku', p.sku,
    'description', p.description,
    'short_description', p.short_description,
    'price', p.price,
    'compare_price', p.compare_price,
    'stock', p.stock,
    'low_stock_threshold', p.low_stock_threshold,
    'sizes', p.sizes,
    'size_stock', COALESCE(p.size_stock, '{}'::jsonb),
    'colors', COALESCE(p.colors, '[]'::jsonb),
    'fabric', p.fabric,
    'material', p.material,
    'badge', p.badge,
    'is_new', p.is_new,
    'is_best_seller', p.is_best_seller,
    'featured', p.featured,
    'is_active', p.is_active,
    'status', p.status,
    'category_id', p.category_id,
    'sale_active', p.sale_active,
    'discount_percent', p.discount_percent,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'image_url', pi.image_url,
      'alt_text', pi.alt_text,
      'sort_order', pi.sort_order
    ) ORDER BY pi.sort_order, pi.created_at
  ), '[]'::jsonb)
  INTO v_images
  FROM public.product_images pi
  WHERE pi.product_id = p_product_id;

  RETURN jsonb_build_object(
    'product', v_product,
    'images', v_images
  );
END;
$$;


--
-- Name: get_analytics_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_analytics_summary() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalRevenue',        COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'revenueToday',        COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= CURRENT_DATE::timestamptz), 0),
    'revenueThisWeek',     COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= date_trunc('week', CURRENT_DATE)), 0),
    'revenueThisMonth',    COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= date_trunc('month', CURRENT_DATE)), 0),

    'totalOrders',         (SELECT COUNT(*) FROM public.orders),
    'pendingOrders',       (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'pending'),
    'confirmedOrders',     (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'confirmed'),
    'processingOrders',    (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'processing'),
    'shippedOrders',       (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'shipped'),
    'deliveredOrders',     (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'delivered'),
    'returnedOrders',      (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'returned'),
    'cancelledOrders',     (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'cancelled'),
    'refundedOrders',      (SELECT COUNT(*) FROM public.orders o WHERE o.status = 'refunded'),

    'totalCustomers',      (SELECT COUNT(*) FROM public.profiles p WHERE p.role = 'customer'),
    'newCustomers',        (SELECT COUNT(*) FROM public.profiles p WHERE p.role = 'customer' AND p.created_at >= date_trunc('month', CURRENT_DATE)),
    'returningCustomers',  COALESCE((SELECT COUNT(*) FROM (SELECT o.user_id FROM public.orders o WHERE o.payment_status = 'completed' GROUP BY o.user_id HAVING COUNT(*) > 1) AS sub), 0),

    'totalProducts',       (SELECT COUNT(*) FROM public.products),
    'activeProducts',      (SELECT COUNT(*) FROM public.products p WHERE p.is_active = true),
    'lowStockProducts',    (SELECT COUNT(*) FROM public.products p WHERE p.is_active = true AND p.stock <= 10),

    'totalCategories',     (SELECT COUNT(*) FROM public.categories)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_audit_logs(integer, integer, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_audit_logs(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_entity_type text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_actor_id uuid DEFAULT NULL::uuid, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
  v_order TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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
$_$;


--
-- Name: get_bottom_selling_products(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_bottom_selling_products(p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',    p.name,
    'orders',  sub.cnt,
    'revenue', sub.rev
  ) ORDER BY sub.cnt ASC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT oi.product_id,
           COUNT(DISTINCT oi.order_id) AS cnt,
           COALESCE(SUM(oi.price * oi.quantity), 0) AS rev
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id AND o.payment_status = 'completed'
    GROUP BY oi.product_id
    ORDER BY cnt ASC
    LIMIT p_limit
  ) sub
  JOIN public.products p ON p.id = sub.product_id;

  RETURN v_result;
END;
$$;


--
-- Name: get_categories_management(integer, integer, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_categories_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'name'::text, p_sort_dir text DEFAULT 'asc'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(
      ' AND (c.name ILIKE %L OR c.slug ILIKE %L)',
      '%' || p_search || '%',
      '%' || p_search || '%'
    );
  END IF;

  EXECUTE 'SELECT COUNT(*) FROM public.categories c' || v_where INTO v_total;

  EXECUTE 'SELECT jsonb_build_object(
    ''categories'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'name'         THEN 'sub.name'
      WHEN p_sort_by = 'product_count' THEN 'sub.product_count'
      WHEN p_sort_by = 'created_at'   THEN 'sub.created_at'
      ELSE 'sub.name'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', $1
  )
  FROM (
    SELECT
      c.id, c.name, c.slug, c.is_active, c.created_at, c.updated_at,
      c.parent_id, c.description, c.image_url, c.sort_order,
      (SELECT COUNT(*) FROM public.products p WHERE p.category_id = c.id) AS product_count,
      (SELECT cp.name FROM public.categories cp WHERE cp.id = c.parent_id) AS parent_name
    FROM public.categories c'
    || v_where ||
    ' ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'name'         THEN 'c.name'
      WHEN p_sort_by = 'product_count' THEN 'product_count'
      WHEN p_sort_by = 'created_at'   THEN 'c.created_at'
      ELSE 'c.name'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub'
  INTO v_result
  USING v_total;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$_$;


--
-- Name: get_category_by_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_category_by_slug(p_slug text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.slug,
    'description', c.description,
    'image_url', c.image_url,
    'parent_id', c.parent_id,
    'sort_order', c.sort_order,
    'is_active', c.is_active,
    'parent_name', (SELECT cp.name FROM public.categories cp WHERE cp.id = c.parent_id)
  )
  FROM public.categories c
  WHERE c.slug = p_slug AND c.is_active = true;
$$;


--
-- Name: get_coupon_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coupon_analytics() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'total_coupons',          (SELECT COUNT(*) FROM public.coupons),
    'active_coupons',         (SELECT COUNT(*) FROM public.coupons WHERE is_active = true AND (expires_at IS NULL OR expires_at > now()) AND (max_uses IS NULL OR used_count < max_uses)),
    'expired_coupons',        (SELECT COUNT(*) FROM public.coupons WHERE expires_at IS NOT NULL AND expires_at <= now()),
    'inactive_coupons',       (SELECT COUNT(*) FROM public.coupons WHERE is_active = false),
    'exhausted_coupons',      (SELECT COUNT(*) FROM public.coupons WHERE max_uses IS NOT NULL AND used_count >= max_uses),
    'total_redemptions',      (SELECT COALESCE(COUNT(*), 0) FROM public.coupon_redemptions),
    'total_discounted',       (SELECT COALESCE(SUM(discount_amount), 0) FROM public.coupon_redemptions),
    'percentage_coupons',     (SELECT COUNT(*) FROM public.coupons WHERE discount_type = 'percentage'),
    'fixed_coupons',          (SELECT COUNT(*) FROM public.coupons WHERE discount_type = 'fixed')
  );
$$;


--
-- Name: get_coupon_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coupon_details(p_coupon_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',                c.id,
    'code',              c.code,
    'description',       c.description,
    'discount_type',     c.discount_type::TEXT,
    'discount_value',    c.discount_value,
    'max_uses',          c.max_uses,
    'used_count',        c.used_count,
    'is_active',         c.is_active,
    'starts_at',         c.starts_at,
    'expires_at',        c.expires_at,
    'min_order',         c.min_order,
    'maximum_discount_amount', c.maximum_discount_amount,
    'metadata',          c.metadata,
    'min_order',         c.min_order,
    'created_at',        c.created_at,
    'updated_at',        c.updated_at,
    'redemptions',       COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',         cr.id,
        'user_id',    cr.user_id,
        'order_id',   cr.order_id,
        'discount_amount', cr.discount_amount,
        'created_at', cr.created_at
      ) ORDER BY cr.created_at DESC)
      FROM public.coupon_redemptions cr WHERE cr.coupon_id = c.id
    ), '[]'::jsonb),
    'total_redeemed', (SELECT COALESCE(COUNT(*), 0) FROM public.coupon_redemptions cr WHERE cr.coupon_id = c.id),
    'total_discounted', (SELECT COALESCE(SUM(cr.discount_amount), 0) FROM public.coupon_redemptions cr WHERE cr.coupon_id = c.id)
  )
  FROM public.coupons c
  WHERE c.id = p_coupon_id;
$$;


--
-- Name: get_coupon_redemptions(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coupon_redemptions(p_coupon_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'redemptions', COALESCE(jsonb_agg(jsonb_build_object(
      'id',              cr.id,
      'coupon_id',       cr.coupon_id,
      'user_id',         cr.user_id,
      'order_id',        cr.order_id,
      'discount_amount', cr.discount_amount,
      'created_at',      cr.created_at,
      'coupon_code',     c.code,
      'customer_email',  p.email,
      'order_total',     o.total
    ) ORDER BY cr.created_at DESC), '[]'::jsonb),
    'total', (SELECT COUNT(*) FROM public.coupon_redemptions WHERE (p_coupon_id IS NULL OR coupon_id = p_coupon_id))
  )
  FROM public.coupon_redemptions cr
  JOIN public.coupons c ON c.id = cr.coupon_id
  LEFT JOIN public.profiles p ON p.id = cr.user_id
  LEFT JOIN public.orders o ON o.id = cr.order_id
  WHERE (p_coupon_id IS NULL OR cr.coupon_id = p_coupon_id)
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_coupons_management(integer, integer, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coupons_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_status_filter text DEFAULT NULL::text, p_type_filter text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(
      ' AND (c.code ILIKE %L OR c.description ILIKE %L)',
      '%' || p_search || '%',
      '%' || p_search || '%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != '' AND p_status_filter != 'all' THEN
    IF p_status_filter = 'active' THEN
      v_where := v_where || ' AND c.is_active = true AND (c.expires_at IS NULL OR c.expires_at > now()) AND (c.max_uses IS NULL OR c.used_count < c.max_uses)';
    ELSIF p_status_filter = 'inactive' THEN
      v_where := v_where || ' AND c.is_active = false';
    ELSIF p_status_filter = 'expired' THEN
      v_where := v_where || ' AND c.expires_at IS NOT NULL AND c.expires_at <= now()';
    ELSIF p_status_filter = 'exhausted' THEN
      v_where := v_where || ' AND c.max_uses IS NOT NULL AND c.used_count >= c.max_uses';
    END IF;
  END IF;

  IF p_type_filter IS NOT NULL AND p_type_filter != '' AND p_type_filter != 'all' THEN
    v_where := v_where || format(' AND c.discount_type = %L', p_type_filter);
  END IF;

  v_total := 0;
  EXECUTE 'SELECT COUNT(*) FROM public.coupons c' || v_where INTO v_total;

  EXECUTE 'SELECT jsonb_build_object(
    ''coupons'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'code'           THEN 'sub.code'
      WHEN p_sort_by = 'discount_type'  THEN 'sub.discount_type'
      WHEN p_sort_by = 'discount_value' THEN 'sub.discount_value'
      WHEN p_sort_by = 'used_count'     THEN 'sub.used_count'
      WHEN p_sort_by = 'max_uses'       THEN 'sub.max_uses'
      WHEN p_sort_by = 'is_active'      THEN 'sub.is_active'
      WHEN p_sort_by = 'starts_at'      THEN 'sub.starts_at'
      WHEN p_sort_by = 'expires_at'     THEN 'sub.expires_at'
      ELSE 'sub.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', $1
  )
  FROM (
    SELECT
      c.id, c.code, c.description, c.discount_type::TEXT, c.discount_value,
      c.max_uses, c.used_count, c.is_active, c.starts_at, c.expires_at,
      c.maximum_discount_amount,
      c.metadata, c.min_order, c.created_at, c.updated_at,
      (SELECT COALESCE(SUM(cr.discount_amount), 0) FROM public.coupon_redemptions cr WHERE cr.coupon_id = c.id) AS total_discounted
    FROM public.coupons c'
    || v_where ||
    ' ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'code'           THEN 'c.code'
      WHEN p_sort_by = 'discount_type'  THEN 'c.discount_type'
      WHEN p_sort_by = 'discount_value' THEN 'c.discount_value'
      WHEN p_sort_by = 'used_count'     THEN 'c.used_count'
      WHEN p_sort_by = 'max_uses'       THEN 'c.max_uses'
      WHEN p_sort_by = 'is_active'      THEN 'c.is_active'
      WHEN p_sort_by = 'starts_at'      THEN 'c.starts_at'
      WHEN p_sort_by = 'expires_at'     THEN 'c.expires_at'
      ELSE 'c.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub'
  INTO v_result
  USING v_total;

  RETURN COALESCE(v_result, jsonb_build_object('coupons', '[]'::jsonb, 'total', 0));
END;
$_$;


--
-- Name: get_customer_analytics(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_analytics(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_new       INT;
  v_returning INT;
BEGIN
  SELECT COUNT(*) INTO v_new
  FROM public.profiles p
  WHERE p.role = 'customer'
    AND (p_start_date IS NULL OR p.created_at >= p_start_date::timestamptz)
    AND (p_end_date   IS NULL OR p.created_at < (p_end_date + 1)::timestamptz);

  SELECT COUNT(*) INTO v_returning
  FROM (
    SELECT o.user_id
    FROM public.orders o
    WHERE o.payment_status = 'completed'
      AND (p_start_date IS NULL OR o.created_at >= p_start_date::timestamptz)
      AND (p_end_date   IS NULL OR o.created_at < (p_end_date + 1)::timestamptz)
    GROUP BY o.user_id
    HAVING COUNT(*) > 1
  ) sub;

  RETURN jsonb_build_object(
    'newCustomers',       COALESCE(v_new, 0),
    'returningCustomers', COALESCE(v_returning, 0)
  );
END;
$$;


--
-- Name: get_customer_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_details(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',                p.id,
    'first_name',        p.first_name,
    'last_name',         p.last_name,
    'email',             p.email,
    'phone',             p.phone,
    'avatar_url',        p.avatar_url,
    'registration_date', p.created_at,
    'last_activity',     GREATEST(p.updated_at, (SELECT MAX(o.created_at) FROM public.orders o WHERE o.user_id = p.id)),
    'orders_count',      (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')),
    'total_spent',       (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')),
    'avg_order_value',   CASE WHEN (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')) > 0
                           THEN (SELECT SUM(o.total) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')) /
                                (SELECT COUNT(*)::numeric FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded'))
                           ELSE 0 END,
    'last_order_at',     (SELECT MAX(o.created_at) FROM public.orders o WHERE o.user_id = p.id),
    'segment',           CASE
                           WHEN (SELECT COALESCE(SUM(o.total), 0) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')) >= 1000 THEN 'vip'
                           WHEN (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')) >= 2 THEN 'returning'
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
        FROM public.orders o WHERE o.user_id = p.id
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
      FROM public.addresses a WHERE a.user_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;


--
-- Name: get_customer_report(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_report(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'newCustomers',       (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'
                            AND (p_start_date IS NULL OR created_at >= p_start_date::timestamptz)
                            AND (p_end_date IS NULL OR created_at < (p_end_date::date + 1)::timestamptz)),
    'returningCustomers', COALESCE((SELECT COUNT(*) FROM (
                            SELECT o.user_id FROM public.orders o
                            WHERE o.payment_status = 'completed'
                            GROUP BY o.user_id HAVING COUNT(*) > 1
                          ) sub), 0),
    'vipCustomers',       COALESCE((SELECT COUNT(*) FROM (
                            SELECT o.user_id FROM public.orders o
                            WHERE o.payment_status = 'completed'
                            GROUP BY o.user_id
                            HAVING COALESCE(SUM(o.total), 0) >= 1000
                          ) sub), 0),
    'totalCustomers',     (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'),
    'averageLifetimeValue', COALESCE((
      SELECT AVG(customer_totals.total) FROM (
        SELECT COALESCE(SUM(o.total), 0) AS total
        FROM public.orders o
        WHERE o.payment_status = 'completed'
        GROUP BY o.user_id
      ) customer_totals
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_customers_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customers_analytics() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'totalCustomers',     (SELECT COUNT(*) FROM public.profiles WHERE role = 'customer'),
    'newCustomers',       (
      SELECT COUNT(*) FROM (
        SELECT p.id
        FROM public.profiles p
        LEFT JOIN public.orders o ON o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY p.id
        HAVING COUNT(DISTINCT o.id) <= 1
      ) sub
    ),
    'returningCustomers',  (
      SELECT COUNT(*) FROM (
        SELECT p.id
        FROM public.profiles p
        JOIN public.orders o ON o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY p.id
        HAVING COUNT(DISTINCT o.id) >= 2
          AND COALESCE(SUM(o.total), 0) < 1000
      ) sub
    ),
    'vipCustomers',       (
      SELECT COUNT(*) FROM (
        SELECT p.id
        FROM public.profiles p
        JOIN public.orders o ON o.user_id = p.id AND o.status NOT IN ('cancelled', 'refunded')
        GROUP BY p.id
        HAVING COALESCE(SUM(o.total), 0) >= 1000
      ) sub
    )
  );
$$;


--
-- Name: get_customers_management(integer, integer, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customers_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_segment text DEFAULT NULL::text, p_activity text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_offset    INT;
  v_total     INT;
  v_result    JSONB;
  v_where     TEXT := 'p.role = ''customer''';
  v_having    TEXT := '';
  v_seg_where TEXT := 'TRUE';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.email ILIKE %L OR p.first_name ILIKE %L OR p.last_name ILIKE %L OR p.first_name || '' '' || p.last_name ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%', '%' || p_search || '%', '%' || p_search || '%');
  END IF;

  IF p_activity = 'active' THEN
    v_having := ' HAVING (MAX(o.created_at) >= NOW() - INTERVAL ''90 days'' OR COUNT(o.id) > 0)';
  ELSIF p_activity = 'inactive' THEN
    v_having := ' HAVING (MAX(o.created_at) IS NULL OR MAX(o.created_at) < NOW() - INTERVAL ''90 days'')';
  END IF;

  IF p_segment IS NOT NULL AND p_segment != '' AND p_segment != 'all' THEN
    v_seg_where := format('segment = %L', p_segment);
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM (SELECT p.id FROM public.profiles p LEFT JOIN public.orders o ON o.user_id = p.id WHERE %s GROUP BY p.id%s) cnt',
    v_where, v_having
  ) INTO v_total;

  EXECUTE format(
    'SELECT jsonb_build_object(
      ''total'', %s,
      ''customers'', COALESCE(jsonb_agg(sub), ''[]''::jsonb)
    )
    FROM (
      SELECT * FROM (
        SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.avatar_url,
          p.created_at AS registration_date,
          GREATEST(p.updated_at, MAX(o.created_at)) AS last_activity,
          COUNT(DISTINCT o.id) AS orders_count,
          COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (''cancelled'', ''refunded'')), 0) AS total_spent,
          MAX(o.created_at) AS last_order_at,
          CASE WHEN COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN (''cancelled'', ''refunded'')), 0) >= 1000 THEN ''vip'' WHEN COUNT(DISTINCT o.id) >= 2 THEN ''returning'' ELSE ''new'' END AS segment
        FROM public.profiles p
        LEFT JOIN public.orders o ON o.user_id = p.id
        WHERE %s
        GROUP BY p.id%s
      ) analytics
      WHERE %s
      ORDER BY %s %s
      LIMIT %s OFFSET %s
    ) sub',
    v_total, v_where, v_having, v_seg_where,
    CASE WHEN p_sort_by = 'name' THEN 'first_name' WHEN p_sort_by = 'email' THEN 'email' WHEN p_sort_by = 'orders_count' THEN 'orders_count' WHEN p_sort_by = 'total_spent' THEN 'total_spent' WHEN p_sort_by = 'created_at' THEN 'registration_date' WHEN p_sort_by = 'last_activity' THEN 'last_activity' ELSE 'registration_date' END,
    CASE WHEN p_sort_dir = 'asc' THEN 'ASC' ELSE 'DESC' END,
    p_page_size, v_offset
  ) INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: get_discount_trend(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_discount_trend(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH trend AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(COALESCE(o.discount,0)), 0) AS discount
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d::timestamptz + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_date::TEXT,
    'discount', discount
  ) ORDER BY day_date), '[]'::jsonb)
  INTO v_result
  FROM trend;

  RETURN v_result;
END;
$$;


--
-- Name: get_export_data(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_export_data(p_data_type text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  CASE p_data_type
    WHEN 'sales' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'orderNumber', o.order_number, 'date', o.created_at::TEXT,
        'customer', COALESCE(p.first_name || ' ' || p.last_name, p.email),
        'email', p.email, 'total', o.total, 'status', o.status,
        'paymentStatus', o.payment_status
      ) ORDER BY o.created_at DESC), '[]'::jsonb)
      INTO v_result
      FROM public.orders o
      JOIN public.profiles p ON p.id = o.user_id
      WHERE (p_start_date IS NULL OR o.created_at >= p_start_date::timestamptz)
        AND (p_end_date IS NULL OR o.created_at < (p_end_date::date + 1)::timestamptz);

    WHEN 'customers' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', COALESCE(p.first_name || ' ' || p.last_name, p.email),
        'email', p.email, 'phone', p.phone, 'registered', p.created_at::TEXT,
        'orders', COALESCE(sub.orders, 0),
        'totalSpent', COALESCE(sub.total_spent, 0)
      ) ORDER BY sub.orders DESC NULLS LAST), '[]'::jsonb)
      INTO v_result
      FROM public.profiles p
      LEFT JOIN (
        SELECT o.user_id, COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS total_spent
        FROM public.orders o WHERE o.payment_status = 'completed'
        GROUP BY o.user_id
      ) sub ON sub.user_id = p.id
      WHERE p.role = 'customer';

    WHEN 'products' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', p.name, 'sku', p.sku, 'price', p.price, 'stock', p.stock,
        'category', c.name, 'status', CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END,
        'totalSold', COALESCE(sub.sold, 0), 'revenue', COALESCE(sub.revenue, 0)
      ) ORDER BY p.name), '[]'::jsonb)
      INTO v_result
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT oi.product_id, SUM(oi.quantity) AS sold, COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id AND o.payment_status = 'completed'
        GROUP BY oi.product_id
      ) sub ON sub.product_id = p.id;

    WHEN 'finance' THEN
      SELECT jsonb_build_object(
        'totals', (SELECT row_to_json(t) FROM (
          SELECT
            COALESCE(SUM(o.total), 0) AS grossRevenue,
            COALESCE(SUM(COALESCE(o.tax_amount,0)), 0) AS totalTaxes,
            COALESCE(SUM(COALESCE(o.discount,0)), 0) AS totalDiscounts,
            COALESCE(SUM(COALESCE(r.amount,0)), 0) AS totalRefunds,
            COUNT(*) AS totalOrders
          FROM public.orders o
          LEFT JOIN public.refunds r ON r.status = 'completed'
          WHERE o.payment_status = 'completed'
            AND (p_start_date IS NULL OR o.created_at >= p_start_date::timestamptz)
            AND (p_end_date IS NULL OR o.created_at < (p_end_date::date + 1)::timestamptz)
        ) t),
        'orders', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'orderNumber', o.order_number, 'date', o.created_at::TEXT,
          'subtotal', o.subtotal, 'tax', o.tax_amount, 'discount', o.discount,
          'shipping', o.shipping_cost, 'total', o.total
        ) ORDER BY o.created_at DESC) FROM public.orders o
          WHERE o.payment_status = 'completed'
            AND (p_start_date IS NULL OR o.created_at >= p_start_date::timestamptz)
            AND (p_end_date IS NULL OR o.created_at < (p_end_date::date + 1)::timestamptz)), '[]'::jsonb)
      ) INTO v_result;

    WHEN 'inventory' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', p.name, 'sku', p.sku, 'stock', p.stock,
        'price', p.price, 'stockValue', (COALESCE(p.stock,0) * COALESCE(p.price,0)),
        'status', CASE WHEN p.stock = 0 THEN 'out_of_stock' WHEN p.stock <= 10 THEN 'low_stock' ELSE 'in_stock' END
      ) ORDER BY p.name), '[]'::jsonb)
      INTO v_result
      FROM public.products p
      WHERE p.is_active = true;

    ELSE
      v_result := '[]'::jsonb;
  END CASE;

  RETURN v_result;
END;
$$;


--
-- Name: get_failed_login_summary(integer, integer, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_failed_login_summary(p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_search text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_offset INT;
  v_total INT;
  v_results JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: get_finance_dashboard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_finance_dashboard() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    -- Revenue
    'grossRevenue',       COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'netRevenue',         COALESCE((SELECT SUM(o.total - COALESCE(o.tax_amount,0)) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'revenueToday',       COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= CURRENT_DATE::timestamptz), 0),
    'revenueThisWeek',    COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= date_trunc('week', CURRENT_DATE)), 0),
    'revenueThisMonth',   COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= date_trunc('month', CURRENT_DATE)), 0),
    'revenueThisYear',    COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status = 'completed' AND o.created_at >= date_trunc('year', CURRENT_DATE)), 0),

    -- Financial metrics
    'taxesCollected',     COALESCE((SELECT SUM(COALESCE(o.tax_amount,0)) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'discountsApplied',   COALESCE((SELECT SUM(COALESCE(o.discount,0)) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'refundAmounts',      COALESCE((SELECT SUM(COALESCE(r.amount,0)) FROM public.refunds r), 0),
    'averageOrderValue',  COALESCE((SELECT AVG(o.total) FROM public.orders o WHERE o.payment_status = 'completed'), 0),
    'totalPaidOrders',    (SELECT COUNT(*) FROM public.orders o WHERE o.payment_status = 'completed'),
    'outstandingAmounts', COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.payment_status NOT IN ('completed', 'refunded', 'failed') AND o.status != 'cancelled'), 0),

    -- Invoice counts
    'totalInvoices',      (SELECT COUNT(*) FROM public.invoices),
    'draftInvoices',      (SELECT COUNT(*) FROM public.invoices WHERE status = 'draft'),
    'issuedInvoices',     (SELECT COUNT(*) FROM public.invoices WHERE status = 'issued'),
    'paidInvoices',       (SELECT COUNT(*) FROM public.invoices WHERE status = 'paid')
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_financial_report(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_financial_report(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH daily AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(COALESCE(o.tax_amount,0)), 0) AS taxes,
           COALESCE(SUM(COALESCE(o.discount,0)), 0) AS discounts,
           COALESCE(SUM(COALESCE(r.amount,0)), 0) AS refunds
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d::timestamptz + INTERVAL '1 day'
    LEFT JOIN public.refunds r
      ON r.status = 'completed'
      AND r.created_at >= d::timestamptz
      AND r.created_at < d::timestamptz + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT jsonb_build_object(
    'totalTaxes', COALESCE((SELECT SUM(taxes) FROM daily), 0),
    'totalDiscounts', COALESCE((SELECT SUM(discounts) FROM daily), 0),
    'totalRefunds', COALESCE((SELECT SUM(refunds) FROM daily), 0),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date', day_date::TEXT, 'taxes', taxes, 'discounts', discounts, 'refunds', refunds
    ) ORDER BY day_date) FROM daily), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_gift_card_analytics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gift_card_analytics() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'total_gift_cards',     (SELECT COUNT(*) FROM public.gift_cards),
    'active_gift_cards',    (SELECT COUNT(*) FROM public.gift_cards WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())),
    'inactive_gift_cards',  (SELECT COUNT(*) FROM public.gift_cards WHERE status = 'inactive'),
    'expired_gift_cards',   (SELECT COUNT(*) FROM public.gift_cards WHERE status = 'expired'),
    'depleted_gift_cards',  (SELECT COUNT(*) FROM public.gift_cards WHERE status = 'depleted'),
    'outstanding_balance',  (SELECT COALESCE(SUM(current_balance), 0) FROM public.gift_cards WHERE status = 'active'),
    'total_issued',         (SELECT COALESCE(SUM(initial_balance), 0) FROM public.gift_cards),
    'total_redeemed',       (SELECT COALESCE(SUM(gc.initial_balance - gc.current_balance), 0) FROM public.gift_cards gc WHERE gc.status = 'depleted'),
    'total_transactions',   (SELECT COALESCE(COUNT(*), 0) FROM public.gift_card_transactions)
  );
$$;


--
-- Name: get_gift_card_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gift_card_details(p_gift_card_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'id',              g.id,
    'code',            g.code,
    'initial_balance', g.initial_balance,
    'current_balance', g.current_balance,
    'status',          g.status,
    'expires_at',      g.expires_at,
    'created_by',      g.created_by,
    'created_at',      g.created_at,
    'updated_at',      g.updated_at,
    'transactions',    COALESCE((
      SELECT jsonb_agg(sub.data) FROM (
        SELECT jsonb_build_object(
          'id',              t.id,
          'gift_card_id',    t.gift_card_id,
          'order_id',        t.order_id,
          'user_id',         t.user_id,
          'transaction_type', t.transaction_type,
          'amount',           t.amount,
          'balance_before',   t.balance_before,
          'balance_after',    t.balance_after,
          'notes',            t.notes,
          'created_at',       t.created_at
        ) AS data
        FROM public.gift_card_transactions t WHERE t.gift_card_id = g.id
        ORDER BY t.created_at DESC LIMIT 100
      ) sub
    ), '[]'::jsonb),
    'usage_count', (SELECT COALESCE(COUNT(*), 0) FROM public.gift_card_transactions t WHERE t.gift_card_id = g.id AND t.transaction_type = 'redemption')
  )
  FROM public.gift_cards g
  WHERE g.id = p_gift_card_id;
$$;


--
-- Name: get_gift_card_transactions(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gift_card_transactions(p_gift_card_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'transactions', COALESCE(jsonb_agg(jsonb_build_object(
      'id',              t.id,
      'gift_card_id',    t.gift_card_id,
      'order_id',        t.order_id,
      'transaction_type', t.transaction_type,
      'amount',           t.amount,
      'balance_before',   t.balance_before,
      'balance_after',    t.balance_after,
      'notes',            t.notes,
      'created_at',       t.created_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb),
    'total', (SELECT COUNT(*) FROM public.gift_card_transactions WHERE gift_card_id = p_gift_card_id)
  )
  FROM public.gift_card_transactions t
  WHERE t.gift_card_id = p_gift_card_id
  LIMIT p_limit OFFSET p_offset;
$$;


--
-- Name: get_gift_cards_management(integer, integer, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_gift_cards_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_status_filter text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (g.code ILIKE %L)', '%' || p_search || '%');
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != '' AND p_status_filter != 'all' THEN
    v_where := v_where || format(' AND g.status = %L', p_status_filter);
  END IF;

  v_total := 0;
  EXECUTE 'SELECT COUNT(*) FROM public.gift_cards g' || v_where INTO v_total;

  EXECUTE 'SELECT jsonb_build_object(
    ''gift_cards'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'code'            THEN 'sub.code'
      WHEN p_sort_by = 'initial_balance' THEN 'sub.initial_balance'
      WHEN p_sort_by = 'current_balance' THEN 'sub.current_balance'
      WHEN p_sort_by = 'status'          THEN 'sub.status'
      WHEN p_sort_by = 'expires_at'      THEN 'sub.expires_at'
      ELSE 'sub.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', $1
  )
  FROM (
    SELECT
      g.id, g.code, g.initial_balance, g.current_balance, g.status,
      g.expires_at, g.created_at, g.updated_at, g.created_by,
      (SELECT COALESCE(COUNT(*), 0) FROM public.gift_card_transactions gct WHERE gct.gift_card_id = g.id) AS usage_count
    FROM public.gift_cards g'
    || v_where ||
    ' ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'code'            THEN 'g.code'
      WHEN p_sort_by = 'initial_balance' THEN 'g.initial_balance'
      WHEN p_sort_by = 'current_balance' THEN 'g.current_balance'
      WHEN p_sort_by = 'status'          THEN 'g.status'
      WHEN p_sort_by = 'expires_at'      THEN 'g.expires_at'
      ELSE 'g.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub'
  INTO v_result
  USING v_total;

  RETURN COALESCE(v_result, jsonb_build_object('gift_cards', '[]'::jsonb, 'total', 0));
END;
$_$;


--
-- Name: get_inventory_alerts(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_alerts(p_unresolved_only boolean DEFAULT true) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',            a.id,
    'product_id',    a.product_id,
    'product_name',  p.name,
    'product_sku',   p.sku,
    'alert_type',    a.alert_type,
    'threshold',     a.threshold,
    'current_stock', a.current_stock,
    'resolved',      a.resolved,
    'resolved_at',   a.resolved_at,
    'created_at',    a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  FROM public.inventory_alerts a
  JOIN public.products p ON p.id = a.product_id
  WHERE (p_unresolved_only IS NOT TRUE OR a.resolved = false);
$$;


--
-- Name: get_inventory_history(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_history(p_product_id uuid, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',             il.id,
    'product_id',     il.product_id,
    'product_name',   p.name,
    'movement_type',  il.change_type::TEXT,
    'quantity',       il.quantity_change,
    'previous_stock', il.quantity_after - il.quantity_change,
    'new_stock',      il.quantity_after,
    'reason',         il.notes,
    'created_at',     il.created_at
  ) ORDER BY il.created_at DESC), '[]'::jsonb)
  FROM public.inventory_logs il
  JOIN public.products p ON p.id = il.product_id
  WHERE il.product_id = p_product_id
  LIMIT p_limit;
$$;


--
-- Name: get_inventory_management(integer, integer, text, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_sort_by text DEFAULT 'name'::text, p_sort_dir text DEFAULT 'asc'::text, p_search text DEFAULT NULL::text, p_stock_status text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_order  TEXT;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Build filters
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
    'SELECT jsonb_build_object(
      ''total'', (SELECT COUNT(*) FROM public.products p %s),
      ''products'', COALESCE(jsonb_agg(sub), ''[]''::jsonb)
    )
    FROM (
      SELECT
        p.id, p.name, p.sku, p.stock, p.is_active, p.updated_at,
        p.sizes, p.size_stock, p.colors,
        COALESCE(
          (SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order) FROM public.product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL),
          ''[]''::jsonb
        ) AS images,
        COALESCE(c.name, ''Uncategorized'') AS category_name,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            ''id'', pv.id,
            ''product_id'', pv.product_id,
            ''name'', pv.name,
            ''sku'', pv.sku,
            ''price'', pv.price,
            ''stock'', pv.stock,
            ''sizes'', pv.sizes,
            ''size_stock'', pv.size_stock,
            ''color_hex'', pv.color_hex,
            ''is_active'', pv.is_active,
            ''images'', COALESCE(
              (SELECT jsonb_agg(pvi.image_url ORDER BY pvi.sort_order) FROM public.product_images pvi WHERE pvi.variant_id = pv.id),
              ''[]''::jsonb
            )
          ) ORDER BY pv.sort_order ASC)
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ), ''[]''::jsonb) AS variants
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


--
-- Name: get_inventory_report(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_report() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'totalProducts',    (SELECT COUNT(*) FROM public.products WHERE is_active = true),
    'inStock',          (SELECT COUNT(*) FROM public.products WHERE is_active = true AND stock > 10),
    'lowStock',         (SELECT COUNT(*) FROM public.products WHERE is_active = true AND stock > 0 AND stock <= 10),
    'outOfStock',       (SELECT COUNT(*) FROM public.products WHERE is_active = true AND stock = 0),
    'totalStockValue',  COALESCE((SELECT SUM(COALESCE(p.stock,0) * COALESCE(p.price,0)) FROM public.products p WHERE p.is_active = true), 0),
    'recentMovements',  (SELECT COUNT(*) FROM public.inventory_logs WHERE created_at >= CURRENT_DATE - INTERVAL '30 days')
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_inventory_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inventory_summary() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'totalProducts',  (SELECT COUNT(*) FROM public.products),
    'inStock',        (SELECT COUNT(*) FROM public.products WHERE stock > 0),
    'lowStock',       (SELECT COUNT(*) FROM public.products WHERE stock > 0 AND stock <= 10),
    'outOfStock',     (SELECT COUNT(*) FROM public.products WHERE stock = 0),
    'overstock',      (SELECT COUNT(*) FROM public.products WHERE stock > 100)
  );
$$;


--
-- Name: get_invoice_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invoice_details(p_invoice_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_invoices_management(integer, integer, text, text, text, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invoices_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_status_filter text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: get_monthly_comparison(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_monthly_comparison(p_year integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_year  INT;
  v_prev  INT;
  v_result JSONB;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_prev := v_year - 1;

  WITH months AS (
    SELECT generate_series(1, 12) AS m
  ),
  current_year AS (
    SELECT m,
           COALESCE(SUM(o.total), 0) AS revenue
    FROM months
    LEFT JOIN public.orders o
      ON EXTRACT(YEAR FROM o.created_at) = v_year
      AND EXTRACT(MONTH FROM o.created_at) = m
      AND o.payment_status = 'completed'
    GROUP BY m
  ),
  prev_year AS (
    SELECT m,
           COALESCE(SUM(o.total), 0) AS revenue
    FROM months
    LEFT JOIN public.orders o
      ON EXTRACT(YEAR FROM o.created_at) = v_prev
      AND EXTRACT(MONTH FROM o.created_at) = m
      AND o.payment_status = 'completed'
    GROUP BY m
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'month', cy.m,
    'revenue', cy.revenue,
    'previousRevenue', py.revenue
  ) ORDER BY cy.m), '[]'::jsonb)
  INTO v_result
  FROM current_year cy
  JOIN prev_year py ON py.m = cy.m;

  RETURN v_result;
END;
$$;


--
-- Name: get_order_by_tracking(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_by_tracking(p_order_number text, p_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order_id UUID;
  v_user_id UUID;
  v_order_email TEXT;
  v_order_data JSONB;
BEGIN
  -- First find the order
  SELECT id, user_id, email INTO v_order_id, v_user_id, v_order_email
  FROM public.orders
  WHERE order_number = p_order_number;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verify the email matches either the order.email (for guests) or the profile.email (for users)
  IF (v_order_email IS NOT NULL AND lower(v_order_email) = lower(p_email)) THEN
    -- Match found via order.email
  ELSIF (v_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND lower(email) = lower(p_email)
  )) THEN
    -- Match found via profile.email
  ELSE
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


--
-- Name: get_order_by_tracking_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_by_tracking_id(p_tracking_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: get_order_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_details(p_order_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: get_order_metrics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_order_metrics() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: get_orders_by_category_distribution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_orders_by_category_distribution() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'category', sub.name,
    'count',    sub.cnt
  ) ORDER BY sub.cnt DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.name, COUNT(*) AS cnt
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    JOIN public.categories c ON c.id = p.category_id
    GROUP BY c.id, c.name
  ) sub;

  RETURN v_result;
END;
$$;


--
-- Name: get_orders_by_status_distribution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_orders_by_status_distribution() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'status', sub.status::TEXT,
    'count',  sub.cnt
  ) ORDER BY sub.cnt DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT o.status, COUNT(*) AS cnt
    FROM public.orders o
    GROUP BY o.status
  ) sub;

  RETURN v_result;
END;
$$;


--
-- Name: get_orders_management(integer, integer, text, text, text, text, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_orders_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_status text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_sql    TEXT;
  v_count_sql TEXT;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(
      ' AND (o.order_number ILIKE %L OR p.first_name ILIKE %L OR p.last_name ILIKE %L OR p.email ILIKE %L)',
      '%' || p_search || '%',
      '%' || p_search || '%',
      '%' || p_search || '%',
      '%' || p_search || '%'
    );
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    v_where := v_where || format(' AND o.status = %L', p_status);
  END IF;

  IF p_payment_status IS NOT NULL AND p_payment_status != '' THEN
    v_where := v_where || format(' AND o.payment_status = %L', p_payment_status);
  END IF;

  IF p_date_from IS NOT NULL THEN
    v_where := v_where || format(' AND DATE(o.created_at) >= %L', p_date_from);
  END IF;

  IF p_date_to IS NOT NULL THEN
    v_where := v_where || format(' AND DATE(o.created_at) <= %L', p_date_to);
  END IF;

  v_count_sql := 'SELECT COUNT(*) FROM public.orders o LEFT JOIN public.profiles p ON p.id = o.user_id' || v_where;
  EXECUTE v_count_sql INTO v_total;

  v_sql := 'SELECT jsonb_build_object(
    ''orders'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'total'        THEN 'sub.total'
      WHEN p_sort_by = 'status'       THEN 'sub.status'
      WHEN p_sort_by = 'payment_status' THEN 'sub.payment_status'
      WHEN p_sort_by = 'customer_name' THEN 'sub.customer_name'
      ELSE 'sub.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', ' || v_total || '
  )
  FROM (
    SELECT
      o.id, o.order_number, o.total, o.status, o.payment_status,
      o.payment_method, o.created_at, o.updated_at,
      COALESCE(p.first_name || '' '' || p.last_name, p.email, ''—'') AS customer_name,
      COALESCE(p.email, ''—'') AS customer_email,
      (SELECT COUNT(*) FROM public.order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.user_id'
    || v_where || '
    ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'total'        THEN 'o.total'
      WHEN p_sort_by = 'status'       THEN 'o.status'
      WHEN p_sort_by = 'payment_status' THEN 'o.payment_status'
      WHEN p_sort_by = 'customer_name' THEN 'p.first_name, p.last_name'
      ELSE 'o.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub';

  EXECUTE v_sql INTO v_result;
  RETURN COALESCE(v_result, jsonb_build_object('orders', '[]'::jsonb, 'total', 0));
END;
$$;


--
-- Name: get_parent_categories(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_parent_categories() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
    ORDER BY c.sort_order, c.name
  ), '[]'::jsonb)
  FROM public.categories c
  WHERE c.is_active = true;
$$;


--
-- Name: get_pending_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pending_jobs(p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_jobs
  FROM (
    SELECT id, job_type, order_id, payload, retry_count, max_retries, created_at, sequence
    FROM background_jobs
    WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;


--
-- Name: get_product_by_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_product_by_slug(p_slug text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
DECLARE
  v_product JSONB;
  v_images JSONB;
  v_category JSONB;
  v_parent_category JSONB;
  v_variants JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'sku', p.sku,
    'description', p.description,
    'short_description', p.short_description,
    'price', p.price,
    'compare_price', p.compare_price,
    'stock', p.stock,
    'low_stock_threshold', p.low_stock_threshold,
    'sizes', p.sizes,
    'size_stock', COALESCE(p.size_stock, '{}'::jsonb),
    'colors', COALESCE(p.colors, '[]'::jsonb),
    'fabric', p.fabric,
    'material', p.material,
    'badge', p.badge,
    'is_new', p.is_new,
    'is_best_seller', p.is_best_seller,
    'featured', p.featured,
    'is_active', p.is_active,
    'status', p.status,
    'sale_active', p.sale_active,
    'discount_percent', p.discount_percent,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_product
  FROM public.products p
  WHERE p.slug = p_slug AND p.is_active = true;

  IF v_product IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'image_url', pi.image_url,
      'alt_text', pi.alt_text,
      'sort_order', pi.sort_order
    ) ORDER BY pi.sort_order, pi.created_at
  ), '[]'::jsonb)
  INTO v_images
  FROM public.product_images pi
  WHERE pi.product_id = (v_product->>'id')::UUID AND pi.variant_id IS NULL;

  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
  INTO v_category
  FROM public.categories c
  WHERE c.id = (v_product->>'category_id')::UUID;

  SELECT jsonb_build_object('id', pc.id, 'name', pc.name, 'slug', pc.slug)
  INTO v_parent_category
  FROM public.categories c
  JOIN public.categories pc ON pc.id = c.parent_id
  WHERE c.id = (v_product->>'category_id')::UUID;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pv.id,
      'name', pv.name,
      'sku', pv.sku,
      'price', pv.price,
      'compare_price', pv.compare_price,
      'stock', pv.stock,
      'sizes', pv.sizes,
      'size_stock', pv.size_stock,
      'color_hex', pv.color_hex,
      'is_active', pv.is_active,
      'images', COALESCE((
        SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order)
        FROM public.product_images pi
        WHERE pi.variant_id = pv.id
      ), '[]'::jsonb)
    ) ORDER BY pv.sort_order, pv.created_at
  ), '[]'::jsonb)
  INTO v_variants
  FROM public.product_variants pv
  WHERE pv.product_id = (v_product->>'id')::UUID AND pv.is_active = true;

  RETURN jsonb_build_object(
    'product', v_product,
    'images', v_images,
    'category', v_category,
    'parent_category', v_parent_category,
    'variants', v_variants
  );
END;
$$;


--
-- Name: get_products_by_category_and_subcategory(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_products_by_category_and_subcategory(p_category_slug text, p_subcategory_slug text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'price', p.price,
      'compare_price', p.compare_price,
      'description', p.description,
      'badge', p.badge,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'category_slug', c.slug,
      'category_name', c.name,
      'category_id', c.id,
      'sizes', p.sizes,
      'sku', p.sku,
      'stock', p.stock,
      'size_stock', p.size_stock,
      'color', p.color,
      'sale_active', p.sale_active,
      'discount_percent', p.discount_percent,
      'images', COALESCE(
        (SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order)
         FROM public.product_images pi
         WHERE pi.product_id = p.id),
        '[]'::jsonb
      )
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  JOIN public.categories pc ON pc.id = c.parent_id
  WHERE c.slug = p_subcategory_slug
    AND pc.slug = p_category_slug
    AND p.is_active = true;
$$;


--
-- Name: get_products_by_category_slug(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_products_by_category_slug(p_slug text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH RECURSIVE category_tree AS (
    SELECT id, parent_id 
    FROM public.categories 
    WHERE slug = p_slug AND is_active = true
    
    UNION ALL
    
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN category_tree ct ON c.parent_id = ct.id
    WHERE c.is_active = true
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'price', p.price,
      'compare_price', p.compare_price,
      'description', p.description,
      'badge', p.badge,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'category_slug', c.slug,
      'category_name', c.name,
      'category_id', c.id,
      'sizes', p.sizes,
      'sku', p.sku,
      'stock', p.stock,
      'size_stock', p.size_stock,
      'color', p.color,
      'sale_active', p.sale_active,
      'discount_percent', p.discount_percent,
      'images', COALESCE(
        (SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order)
         FROM public.product_images pi
         WHERE pi.product_id = p.id),
        '[]'::jsonb
      )
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE c.id IN (SELECT id FROM category_tree) AND p.is_active = true;
$$;


--
-- Name: get_products_management(integer, integer, text, text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_products_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_stock_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_order  TEXT;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.name ILIKE %L OR p.sku ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%');
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    IF p_status = 'out_of_stock' THEN
      v_where := v_where || ' AND p.stock = 0';
    ELSE
      v_where := v_where || format(' AND p.status = %L', p_status);
    END IF;
  END IF;

  IF p_category_id IS NOT NULL THEN
    v_where := v_where || format(' AND p.category_id = %L', p_category_id);
  END IF;

  IF p_stock_status IS NOT NULL AND p_stock_status != '' THEN
    IF p_stock_status = 'in_stock' THEN
      v_where := v_where || ' AND p.stock > 0';
    ELSIF p_stock_status = 'low_stock' THEN
      v_where := v_where || ' AND p.stock > 0 AND p.stock <= p.low_stock_threshold';
    ELSIF p_stock_status = 'out_of_stock' THEN
      v_where := v_where || ' AND p.stock = 0';
    END IF;
  END IF;

  v_order := CASE p_sort_by
    WHEN 'name' THEN 'p.name'
    WHEN 'sku' THEN 'p.sku'
    WHEN 'price' THEN 'p.price'
    WHEN 'stock' THEN 'p.stock'
    WHEN 'status' THEN 'p.status'
    WHEN 'category_name' THEN 'c.name'
    WHEN 'created_at' THEN 'p.created_at'
    ELSE 'p.created_at'
  END;
  v_order := v_order || CASE WHEN p_sort_dir = 'desc' THEN ' DESC NULLS LAST' ELSE ' ASC NULLS LAST' END;

  EXECUTE format(
    'SELECT jsonb_build_object(
      ''total'', (SELECT COUNT(*) FROM public.products p %s),
      ''products'', COALESCE(
        (SELECT jsonb_agg(item) FROM (
          SELECT jsonb_build_object(
            ''id'', p.id,
            ''name'', p.name,
            ''sku'', p.sku,
            ''price'', p.price,
            ''compare_price'', p.compare_price,
            ''stock'', p.stock,
            ''status'', p.status,
            ''is_active'', p.is_active,
            ''sale_active'', p.sale_active,
            ''discount_percent'', p.discount_percent,
            ''created_at'', p.created_at,
            ''updated_at'', p.updated_at,
            ''category_name'', COALESCE(c.name, ''—''),
            ''category_id'', p.category_id,
            ''subcategory_name'', COALESCE(c.name, ''—''),
            ''thumbnail'', (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.created_at LIMIT 1)
          ) AS item
          FROM public.products p
          LEFT JOIN public.categories c ON c.id = p.category_id
          %s
          ORDER BY %s
          OFFSET %L LIMIT %L
        ) sub),
        ''[]''::jsonb
      )
    )',
    v_where, v_where, v_order, v_offset, p_page_size
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_refund_trend(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_refund_trend(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH trend AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(COALESCE(r.amount,0)), 0) AS refund
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.refunds r
      ON r.created_at >= d::timestamptz
      AND r.created_at < d::timestamptz + INTERVAL '1 day'
      AND r.status = 'completed'
    GROUP BY d
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_date::TEXT,
    'refund', refund
  ) ORDER BY day_date), '[]'::jsonb)
  INTO v_result
  FROM trend;

  RETURN v_result;
END;
$$;


--
-- Name: get_retryable_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_retryable_jobs(p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_jobs
  FROM (
    SELECT id, job_type, order_id, payload, retry_count, max_retries, created_at, sequence
    FROM background_jobs
    WHERE status = 'failed'
      AND next_retry_at IS NOT NULL
      AND next_retry_at <= now()
      AND retry_count < max_retries
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;


--
-- Name: get_revenue_analytics(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_analytics(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE; v_end DATE; v_prev_start DATE; v_prev_end DATE;
  v_num_days INT; v_current NUMERIC; v_previous NUMERIC; v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, date_trunc('month', CURRENT_DATE)::DATE);
  v_end := COALESCE(p_end_date, CURRENT_DATE);
  v_num_days := (v_end - v_start) + 1;
  v_prev_end := v_start - 1;
  v_prev_start := v_prev_end - v_num_days + 1;
  SELECT COALESCE(SUM(o.total), 0) INTO v_current
  FROM public.orders o
  WHERE o.payment_status = 'completed'
    AND o.created_at >= v_start::timestamptz
    AND o.created_at < (v_end::date + 1)::timestamptz;
  SELECT COALESCE(SUM(o.total), 0) INTO v_previous
  FROM public.orders o
  WHERE o.payment_status = 'completed'
    AND o.created_at >= v_prev_start::timestamptz
    AND o.created_at < (v_prev_end::date + 1)::timestamptz;
  WITH trend AS (
    SELECT d::TEXT AS day_label, COALESCE(SUM(o.total), 0) AS sales
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT jsonb_build_object(
    'current', v_current, 'previous', v_previous,
    'change', CASE WHEN v_previous > 0 THEN ROUND(((v_current - v_previous) / v_previous * 100)::NUMERIC, 1) ELSE 0 END,
    'trend', COALESCE((SELECT jsonb_agg(jsonb_build_object('date', day_label, 'sales', sales) ORDER BY day_label) FROM trend), '[]'::jsonb)
  ) INTO v_result;
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


--
-- Name: get_revenue_report(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_report(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH daily AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(o.total), 0) AS gross_revenue,
           COALESCE(SUM(o.total - COALESCE(o.tax_amount,0)), 0) AS net_revenue,
           COALESCE(SUM(o.discount), 0) AS discounts,
           COALESCE(SUM(o.tax_amount), 0) AS taxes,
           COUNT(o.id) AS orders_count
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d::timestamptz + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT jsonb_build_object(
    'totalGrossRevenue', COALESCE((SELECT SUM(gross_revenue) FROM daily), 0),
    'totalNetRevenue', COALESCE((SELECT SUM(net_revenue) FROM daily), 0),
    'totalTaxes', COALESCE((SELECT SUM(taxes) FROM daily), 0),
    'totalDiscounts', COALESCE((SELECT SUM(discounts) FROM daily), 0),
    'totalOrders', (SELECT SUM(orders_count) FROM daily),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'date', day_date::TEXT, 'grossRevenue', gross_revenue, 'netRevenue', net_revenue,
      'discounts', discounts, 'taxes', taxes, 'orders', orders_count
    ) ORDER BY day_date) FROM daily), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;


--
-- Name: get_revenue_trend(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_trend(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH trend AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(o.total), 0) AS revenue
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d::timestamptz + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_date::TEXT,
    'revenue', revenue
  ) ORDER BY day_date), '[]'::jsonb)
  INTO v_result
  FROM trend;

  RETURN v_result;
END;
$$;


--
-- Name: get_review_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_details(p_review_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'id',              r.id,
      'product_id',      r.product_id,
      'product_name',    pr.name,
      'user_id',         r.user_id,
      'customer_name',   COALESCE(p.first_name || ' ' || p.last_name, r.reviewer_name),
      'customer_email',  COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)),
      'rating',          r.rating,
      'title',           r.title,
      'review_text',     r.review_text,
      'status',          r.status,
      'is_verified',     r.is_verified,
      'admin_note',      r.admin_note,
      'approved_at',     r.approved_at,
      'created_at',      r.created_at
    )
    FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.id = p_review_id
  );
END;
$$;


--
-- Name: get_review_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_review_stats() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'total',          (SELECT COUNT(*) FROM public.reviews),
    'pending',        (SELECT COUNT(*) FROM public.reviews WHERE status = 'pending'),
    'approved',       (SELECT COUNT(*) FROM public.reviews WHERE status = 'approved'),
    'rejected',       (SELECT COUNT(*) FROM public.reviews WHERE status = 'rejected'),
    'average_rating', (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.reviews WHERE status = 'approved')
  );
$$;


--
-- Name: get_reviews_management(integer, integer, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reviews_management(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_search text DEFAULT NULL::text, p_sort_by text DEFAULT 'created_at'::text, p_sort_dir text DEFAULT 'desc'::text, p_status_filter text DEFAULT NULL::text, p_rating_filter integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(
      ' AND (pr.name ILIKE %1$L OR COALESCE(p.first_name || '' '' || p.last_name, r.reviewer_name) ILIKE %1$L OR COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)) ILIKE %1$L OR r.review_text ILIKE %1$L)',
      '%' || p_search || '%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != '' AND p_status_filter != 'all' THEN
    v_where := v_where || format(' AND r.status = %L', p_status_filter);
  END IF;

  IF p_rating_filter IS NOT NULL AND p_rating_filter BETWEEN 1 AND 5 THEN
    v_where := v_where || format(' AND r.rating = %L', p_rating_filter);
  END IF;

  EXECUTE 'SELECT COUNT(*) FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id'
    || v_where INTO v_total;

  EXECUTE 'SELECT jsonb_build_object(
    ''reviews'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'rating'   THEN 'sub.rating'
      WHEN p_sort_by = 'status'   THEN 'sub.status'
      WHEN p_sort_by = 'created_at' THEN 'sub.created_at'
      ELSE 'sub.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', $1
  )
  FROM (
    SELECT
      r.id,
      r.rating,
      r.title,
      r.review_text,
      r.status,
      r.is_verified,
      r.admin_note,
      r.approved_at,
      r.created_at,
      r.updated_at,
      pr.id AS product_id,
      pr.name AS product_name,
      pr.slug AS product_slug,
      (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id = pr.id ORDER BY pi.sort_order ASC LIMIT 1) AS product_image,
      p.id AS user_id,
      COALESCE(p.first_name || '' '' || p.last_name, r.reviewer_name) AS customer_name,
      COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)) AS customer_email
    FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id'
    || v_where ||
    ' ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'rating'   THEN 'r.rating'
      WHEN p_sort_by = 'status'   THEN 'r.status'
      WHEN p_sort_by = 'created_at' THEN 'r.created_at'
      ELSE 'r.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub'
  INTO v_result
  USING v_total;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$_$;


--
-- Name: get_sales_analytics(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_sales_analytics(p_period text DEFAULT 'daily'::text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE; v_end DATE; v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end := COALESCE(p_end_date, CURRENT_DATE);
  CASE p_period
    WHEN 'daily' THEN
      WITH daily AS (
        SELECT d::TEXT AS day_label,
               COALESCE(SUM(o.total), 0) AS sales,
               COUNT(o.id) AS orders
        FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
        LEFT JOIN public.orders o
          ON o.payment_status = 'completed'
          AND o.created_at >= d::timestamptz
          AND o.created_at < d + INTERVAL '1 day'
        GROUP BY d
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day_label, 'sales', sales, 'orders', orders) ORDER BY day_label), '[]'::jsonb)
      INTO v_result FROM daily;
    WHEN 'weekly' THEN
      WITH weekly AS (
        SELECT to_char(d, 'IYYY-"W"IW') AS week_label,
               COALESCE(SUM(o.total), 0) AS sales,
               COUNT(o.id) AS orders
        FROM generate_series(date_trunc('week', v_start)::DATE, v_end, '1 week'::INTERVAL) AS d(d)
        LEFT JOIN public.orders o
          ON o.payment_status = 'completed'
          AND o.created_at >= d::timestamptz
          AND o.created_at < d + INTERVAL '1 week'
        GROUP BY d
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', week_label, 'sales', sales, 'orders', orders) ORDER BY week_label), '[]'::jsonb)
      INTO v_result FROM weekly;
    WHEN 'monthly' THEN
      WITH monthly AS (
        SELECT to_char(d, 'YYYY-MM') AS month_label,
               COALESCE(SUM(o.total), 0) AS sales,
               COUNT(o.id) AS orders
        FROM generate_series(date_trunc('month', v_start)::DATE, v_end, '1 month'::INTERVAL) AS d(d)
        LEFT JOIN public.orders o
          ON o.payment_status = 'completed'
          AND o.created_at >= d::timestamptz
          AND o.created_at < d + INTERVAL '1 month'
        GROUP BY d
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', month_label, 'sales', sales, 'orders', orders) ORDER BY month_label), '[]'::jsonb)
      INTO v_result FROM monthly;
    WHEN 'yearly' THEN
      WITH yearly AS (
        SELECT EXTRACT(YEAR FROM d)::TEXT AS year_label,
               COALESCE(SUM(o.total), 0) AS sales,
               COUNT(o.id) AS orders
        FROM generate_series(date_trunc('year', v_start)::DATE, v_end, '1 year'::INTERVAL) AS d(d)
        LEFT JOIN public.orders o
          ON o.payment_status = 'completed'
          AND o.created_at >= d::timestamptz
          AND o.created_at < d + INTERVAL '1 year'
        GROUP BY d
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', year_label, 'sales', sales, 'orders', orders) ORDER BY year_label), '[]'::jsonb)
      INTO v_result FROM yearly;
    ELSE v_result := '[]'::jsonb;
  END CASE;
  RETURN v_result;
END;
$$;


--
-- Name: get_security_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_security_overview() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_failed_logins_24h INT;
  v_active_sessions INT;
  v_locked_accounts INT;
  v_total_admins INT;
  v_recent_alerts JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: get_tax_trend(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tax_trend(p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_result JSONB;
BEGIN
  v_start := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
  v_end   := COALESCE(p_end_date, CURRENT_DATE);

  WITH trend AS (
    SELECT d::DATE AS day_date,
           COALESCE(SUM(COALESCE(o.tax_amount,0)), 0) AS tax
    FROM generate_series(v_start, v_end, '1 day'::INTERVAL) AS d(d)
    LEFT JOIN public.orders o
      ON o.payment_status = 'completed'
      AND o.created_at >= d::timestamptz
      AND o.created_at < d::timestamptz + INTERVAL '1 day'
    GROUP BY d
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_date::TEXT,
    'tax', tax
  ) ORDER BY day_date), '[]'::jsonb)
  INTO v_result
  FROM trend;

  RETURN v_result;
END;
$$;


--
-- Name: get_top_selling_products(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_top_selling_products(p_limit integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name',    p.name,
    'orders',  sub.cnt,
    'revenue', sub.rev
  ) ORDER BY sub.cnt DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT oi.product_id,
           COUNT(DISTINCT oi.order_id) AS cnt,
           COALESCE(SUM(oi.price * oi.quantity), 0) AS rev
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id AND o.payment_status = 'completed'
    GROUP BY oi.product_id
    ORDER BY cnt DESC
    LIMIT p_limit
  ) sub
  JOIN public.products p ON p.id = sub.product_id;

  RETURN v_result;
END;
$$;


--
-- Name: get_yearly_comparison(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_yearly_comparison() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH yearly_data AS (
    SELECT EXTRACT(YEAR FROM o.created_at)::INT AS y,
           COALESCE(SUM(o.total), 0) AS revenue
    FROM public.orders o
    WHERE o.payment_status = 'completed'
    GROUP BY EXTRACT(YEAR FROM o.created_at)::INT
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'year', y,
    'revenue', revenue
  ) ORDER BY y), '[]'::jsonb)
  INTO v_result
  FROM yearly_data;

  RETURN v_result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    'customer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_admin_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_admin_role(required text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_roles
    WHERE user_id = auth.uid()
      AND (required IS NULL OR role = required)
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.has_admin_role('admin');
$$;


--
-- Name: is_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_staff() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT public.has_admin_role(NULL);
$$;


--
-- Name: log_audit_entry(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_entry() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_action TEXT;
  v_old_data JSONB;
  v_new_data JSONB;
  v_entity_type TEXT;
  v_entity_id TEXT;
BEGIN
  v_entity_type := TG_TABLE_NAME;

  IF TG_OP = 'INSERT' THEN
    v_action := 'created';
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id::TEXT;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'updated';
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);
    v_entity_id := NEW.id::TEXT;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'deleted';
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
    v_entity_id := OLD.id::TEXT;
  END IF;

  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), v_action, v_entity_type, v_entity_id, v_old_data, v_new_data);

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: log_order_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_order_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, old_data, new_data, metadata)
    VALUES (
      auth.uid(),
      'order_status_changed',
      'orders',
      NEW.id::TEXT,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: log_payment_event(text, uuid, uuid, text, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_payment_event(p_event_type text, p_session_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid, p_payment_intent_id text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL::uuid, p_status text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.payment_audit_logs (
    event_type, session_id, user_id, payment_intent_id,
    order_id, status, message, metadata
  ) VALUES (
    p_event_type, p_session_id, p_user_id, p_payment_intent_id,
    p_order_id, p_status, p_message, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: mark_cart_converted(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_cart_converted(p_cart_id uuid, p_order_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE abandoned_carts
  SET status = 'converted', converted_at = now(), converted_order_id = p_order_id
  WHERE id = p_cart_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: mark_cart_recovered(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_cart_recovered(p_cart_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE abandoned_carts
  SET status = 'recovered', recovered_at = now()
  WHERE id = p_cart_id AND status = 'abandoned';

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: merge_cart_items(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_cart_items(p_user_id uuid, p_session_id text) RETURNS void
    LANGUAGE plpgsql
    AS $$
begin
  -- Merge guest cart into user cart
  insert into cart_items (user_id, product_id, variant_id, quantity)
  select
    p_user_id,
    c.product_id,
    c.variant_id,
    c.quantity
  from cart_items c
  where c.session_id = p_session_id
  on conflict (user_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'))
  do update set
    quantity = cart_items.quantity + excluded.quantity;

  -- Cleanup guest cart
  delete from cart_items where session_id = p_session_id;
end;
$$;


--
-- Name: move_to_dead_letter(uuid, text, uuid, jsonb, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.move_to_dead_letter(p_job_id uuid, p_job_type text, p_order_id uuid, p_payload jsonb, p_error_message text, p_stack_trace text DEFAULT NULL::text, p_retry_count integer DEFAULT 0) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_dlq_id UUID;
BEGIN
  INSERT INTO public.dead_letter_jobs (
    original_job_id, job_type, order_id, payload,
    error_message, stack_trace, retry_count
  ) VALUES (
    p_job_id, p_job_type, p_order_id, p_payload,
    p_error_message, p_stack_trace, p_retry_count
  )
  RETURNING id INTO v_dlq_id;

  UPDATE public.background_jobs
  SET status = 'dlq', completed_at = now()
  WHERE id = p_job_id;

  RETURN v_dlq_id;
END;
$$;


--
-- Name: next_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_invoice_number() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT NEXTVAL('public.invoice_number_seq')::INT;
$$;


--
-- Name: next_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_number() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT NEXTVAL('public.order_number_seq')::INT;
$$;


--
-- Name: owns_profile(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.owns_profile(profile_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT auth.uid() = profile_id OR public.is_staff();
$$;


--
-- Name: process_refund(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_refund(p_refund_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order_id UUID;
BEGIN
  UPDATE public.refunds
  SET
    status = p_status,
    processed_at = CASE WHEN p_status IN ('approved', 'completed') THEN now() ELSE processed_at END,
    processed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_refund_id
  RETURNING order_id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund not found');
  END IF;

  IF p_status IN ('approved', 'completed') THEN
    UPDATE public.orders SET payment_status = 'refunded', updated_at = now() WHERE id = v_order_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: process_return(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_return(p_return_id uuid, p_status text, p_admin_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_order_id UUID;
BEGIN
  UPDATE public.return_requests
  SET
    status = p_status,
    admin_notes = COALESCE(p_admin_notes, admin_notes),
    approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
    rejected_at = CASE WHEN p_status = 'rejected' THEN now() ELSE rejected_at END,
    updated_at = now()
  WHERE id = p_return_id
  RETURNING order_id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Return request not found');
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.orders SET status = 'returned', updated_at = now() WHERE id = v_order_id AND status = 'delivered';
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: record_admin_activity(text, text, text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_admin_activity(p_action text, p_entity_type text DEFAULT NULL::text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb, p_ip_address text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;

  INSERT INTO admin_activity(admin_id, action, entity_type, entity_id, details, ip_address)
  VALUES (v_admin_id, p_action, p_entity_type, p_entity_id, p_details, p_ip_address);

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: record_failed_login(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_failed_login(p_email text, p_user_id uuid DEFAULT NULL::uuid, p_ip_address text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_existing_id UUID;
  v_attempt_count INT;
BEGIN
  -- Find existing record for this user/email within last 24 hours
  SELECT id, attempt_count INTO v_existing_id, v_attempt_count
  FROM failed_login_attempts
  WHERE (user_id = p_user_id OR (user_id IS NULL AND email = p_email))
    AND last_attempt_at > now() - INTERVAL '24 hours'
  ORDER BY last_attempt_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE failed_login_attempts
    SET attempt_count = v_attempt_count + 1,
        last_attempt_at = now(),
        ip_address = COALESCE(p_ip_address, ip_address)
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'success', true,
      'attempt_count', v_attempt_count + 1,
      'is_locked', (v_attempt_count + 1) >= 5
    );
  ELSE
    INSERT INTO failed_login_attempts(user_id, email, ip_address, attempt_count)
    VALUES (p_user_id, p_email, p_ip_address, 1);

    RETURN jsonb_build_object(
      'success', true,
      'attempt_count', 1,
      'is_locked', false
    );
  END IF;
END;
$$;


--
-- Name: recover_from_dead_letter(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recover_from_dead_letter(p_dlq_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_dlq RECORD;
BEGIN
  SELECT * INTO v_dlq FROM public.dead_letter_jobs WHERE id = p_dlq_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_dlq.recovered_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.background_jobs (
    job_type, order_id, status, payload, retry_count, max_retries
  ) VALUES (
    v_dlq.job_type, v_dlq.order_id, 'pending', v_dlq.payload, 0, 3
  );

  UPDATE public.dead_letter_jobs
  SET recovered_at = now()
  WHERE id = p_dlq_id;

  RETURN TRUE;
END;
$$;


--
-- Name: redeem_gift_card(uuid, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_gift_card(p_gift_card_id uuid, p_amount numeric, p_order_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance     NUMERIC;
  v_status          TEXT;
BEGIN
  SELECT current_balance, status INTO v_current_balance, v_status
  FROM public.gift_cards WHERE id = p_gift_card_id FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found');
  END IF;

  IF v_status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card is not active');
  END IF;

  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  v_new_balance := v_current_balance - p_amount;

  UPDATE public.gift_cards
  SET current_balance = v_new_balance,
      status = CASE WHEN v_new_balance = 0 THEN 'depleted' ELSE status END,
      updated_at = now()
  WHERE id = p_gift_card_id;

  INSERT INTO public.gift_card_transactions (gift_card_id, order_id, user_id, transaction_type, amount, balance_before, balance_after)
  VALUES (p_gift_card_id, p_order_id, auth.uid(), 'redemption', p_amount, v_current_balance, v_new_balance);

  RETURN jsonb_build_object(
    'success', true,
    'amount_redeemed', p_amount,
    'balance_before', v_current_balance,
    'balance_after', v_new_balance
  );
END;
$$;


--
-- Name: reject_review(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_review(p_review_id uuid, p_admin_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.reviews
  SET status = 'rejected', admin_note = COALESCE(p_admin_note, admin_note), updated_at = now()
  WHERE id = p_review_id;
  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: release_expired_reservations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_expired_reservations() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_released INT;
BEGIN
  UPDATE public.inventory_reservations
  SET status = 'expired'
  WHERE status = 'active' AND expires_at < now();
  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$$;


--
-- Name: remove_stock(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_stock(p_product_id uuid, p_quantity integer, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current_stock INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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


--
-- Name: request_refund(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_refund(p_order_id uuid, p_reason text, p_description text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: require_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_admin() RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
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


--
-- Name: reserve_inventory(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_inventory(p_checkout_request_id text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_item      RECORD;
  v_prod_id   UUID;
  v_var_id    UUID;
  v_size      TEXT;
  v_qty       INT;
  v_size_map  JSONB;
  v_is_sized  BOOLEAN;
  v_available INT;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_var_id  := NULLIF(v_item.value->>'variant_id', '')::UUID;
    v_size    := COALESCE(v_item.value->>'size', '');
    v_qty     := (v_item.value->>'quantity')::INT;

    SELECT stock, size_stock INTO v_available, v_size_map
    FROM public.products WHERE id = v_prod_id FOR UPDATE;

    IF v_available IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Product not found: ' || v_prod_id);
    END IF;

    v_is_sized := v_size_map IS NOT NULL AND v_size_map != '{}'::jsonb;

    IF v_is_sized AND v_size != '' THEN
      v_available := COALESCE((v_size_map ->> v_size)::INT, 0);
    END IF;

    IF v_available < v_qty THEN
      RETURN jsonb_build_object('success', false, 'error',
        'Insufficient stock for product ' || v_prod_id);
    END IF;

    IF v_var_id IS NOT NULL THEN
      SELECT stock INTO v_available
      FROM public.product_variants WHERE id = v_var_id FOR UPDATE;

      IF v_available IS NULL OR v_available < v_qty THEN
        RETURN jsonb_build_object('success', false, 'error',
          'Insufficient variant stock for variant ' || v_var_id);
      END IF;
    END IF;

    INSERT INTO public.inventory_reservations
      (checkout_request_id, product_id, variant_id, size, quantity, status)
    VALUES
      (p_checkout_request_id, v_prod_id, v_var_id, NULLIF(v_size, ''), v_qty, 'active');
  END LOOP;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: resolve_alert(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_alert(p_alert_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  UPDATE public.inventory_alerts
  SET resolved = true, resolved_at = now()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: search_products(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_products(p_query text) RETURNS TABLE(id uuid, name text, price numeric, slug text, image text)
    LANGUAGE sql
    AS $$
  select
    p.id,
    p.name,
    p.price,
    p.slug,
    pi.image_url
  from products p
  left join product_images pi on pi.product_id = p.id
  where
    p.is_active = true
    and (
      p.name ilike '%' || p_query || '%'
      or p.slug ilike '%' || p_query || '%'
      or p.color ilike '%' || p_query || '%'
    )
  limit 20;
$$;


--
-- Name: set_order_tracking_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_order_tracking_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.tracking_id IS NULL THEN
    NEW.tracking_id := public.generate_unique_tracking_id();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: stock_change_alert_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stock_change_alert_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF OLD.stock IS DISTINCT FROM NEW.stock THEN
    PERFORM public.check_and_generate_alerts(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sum_jsonb_values(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sum_jsonb_values(size_stock jsonb) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  val INT;
  total INT := 0;
  k TEXT;
BEGIN
  IF size_stock IS NULL OR size_stock = '{}'::jsonb THEN
    RETURN 0;
  END IF;
  FOR k IN SELECT jsonb_object_keys(size_stock) LOOP
    val := (size_stock->>k)::INT;
    IF val IS NOT NULL THEN
      total := total + val;
    END IF;
  END LOOP;
  RETURN total;
END;
$$;


--
-- Name: toggle_coupon_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_coupon_status(p_coupon_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current BOOLEAN;
BEGIN
  SELECT is_active INTO v_current FROM public.coupons WHERE id = p_coupon_id;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coupon not found');
  END IF;

  UPDATE public.coupons SET is_active = NOT v_current WHERE id = p_coupon_id;

  RETURN jsonb_build_object('success', true, 'is_active', NOT v_current);
END;
$$;


--
-- Name: toggle_gift_card_status(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_gift_card_status(p_gift_card_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_current TEXT;
  v_balance NUMERIC;
BEGIN
  SELECT status, current_balance INTO v_current, v_balance FROM public.gift_cards WHERE id = p_gift_card_id;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gift card not found');
  END IF;

  IF v_current = 'active' THEN
    UPDATE public.gift_cards SET status = 'inactive', updated_at = now() WHERE id = p_gift_card_id;
    RETURN jsonb_build_object('success', true, 'status', 'inactive');
  ELSIF v_current = 'inactive' THEN
    UPDATE public.gift_cards SET status = 'active', updated_at = now() WHERE id = p_gift_card_id;
    INSERT INTO public.gift_card_transactions (gift_card_id, transaction_type, amount, balance_before, balance_after, notes)
    VALUES (p_gift_card_id, 'activation', v_balance, v_balance, v_balance, 'Reactivated');
    RETURN jsonb_build_object('success', true, 'status', 'active');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Cannot toggle status for ' || v_current || ' gift cards');
  END IF;
END;
$$;


--
-- Name: toggle_wishlist(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_wishlist(p_user_id uuid, p_product_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
begin
  if exists (
    select 1 from wishlists
    where user_id = p_user_id
    and product_id = p_product_id
  ) then
    delete from wishlists
    where user_id = p_user_id
    and product_id = p_product_id;

    return false;
  else
    insert into wishlists (user_id, product_id)
    values (p_user_id, p_product_id);

    return true;
  end if;
end;
$$;


--
-- Name: trg_enqueue_review_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_enqueue_review_email() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Check if review email job is already enqueued to prevent duplicate schedules
    IF NOT EXISTS (
      SELECT 1 FROM public.background_jobs 
      WHERE order_id = NEW.id AND job_type = 'send_review_email'
    ) THEN
      INSERT INTO public.background_jobs (job_type, order_id, status, scheduled_at, payload)
      VALUES (
        'send_review_email',
        NEW.id,
        'pending',
        now() + INTERVAL '2 days',
        jsonb_build_object('email', NEW.email)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_calculate_product_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_calculate_product_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = NEW.id) THEN
    NEW.stock := (
      SELECT COALESCE(SUM(stock), 0)
      FROM public.product_variants
      WHERE product_id = NEW.id AND is_active = true
    );
  ELSE
    NEW.stock := public.sum_jsonb_values(NEW.size_stock);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_calculate_variant_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_calculate_variant_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.stock := public.sum_jsonb_values(NEW.size_stock);
  RETURN NEW;
END;
$$;


--
-- Name: trg_fn_sync_product_stock_from_variants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_fn_sync_product_stock_from_variants() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  
  UPDATE public.products
  SET stock = (
    SELECT COALESCE(SUM(stock), 0)
    FROM public.product_variants
    WHERE product_id = v_product_id AND is_active = true
  )
  WHERE id = v_product_id;
  
  RETURN NULL;
END;
$$;


--
-- Name: try_claim_webhook(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_claim_webhook(p_order_id uuid, p_idempotency_key text, p_payment_intent text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_processed_at TIMESTAMPTZ;
BEGIN
  SELECT webhook_processed_at INTO v_processed_at
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_processed_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE orders
  SET
    webhook_processed_at  = now(),
    idempotency_key       = p_idempotency_key,
    stripe_payment_intent_id = COALESCE(p_payment_intent, stripe_payment_intent_id),
    stripe_session_id     = COALESCE(p_session_id, stripe_session_id)
  WHERE id = p_order_id;

  RETURN TRUE;
END;
$$;


--
-- Name: update_category(uuid, text, text, uuid, text, text, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_category(p_id uuid, p_name text, p_slug text, p_parent_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_image_url text DEFAULT NULL::text, p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = p_slug AND id != p_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this slug already exists');
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE name = p_name AND id != p_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists');
  END IF;

  UPDATE public.categories
  SET name = p_name, slug = p_slug, parent_id = p_parent_id, description = p_description,
      image_url = p_image_url, sort_order = p_sort_order, is_active = p_is_active,
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: update_coupon(uuid, text, text, text, numeric, numeric, integer, numeric, timestamp with time zone, timestamp with time zone, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_coupon(p_id uuid, p_code text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_discount_type text DEFAULT NULL::text, p_discount_value numeric DEFAULT NULL::numeric, p_min_order numeric DEFAULT NULL::numeric, p_max_uses integer DEFAULT NULL::integer, p_maximum_discount_amount numeric DEFAULT NULL::numeric, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_is_active boolean DEFAULT NULL::boolean, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF p_code IS NOT NULL THEN
    UPDATE public.coupons SET code = UPPER(TRIM(p_code)) WHERE id = p_id;
  END IF;

  IF p_description IS NOT NULL THEN
    UPDATE public.coupons SET description = p_description WHERE id = p_id;
  END IF;

  IF p_discount_type IS NOT NULL THEN
    IF p_discount_type NOT IN ('percentage', 'fixed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid discount type');
    END IF;
    UPDATE public.coupons SET discount_type = p_discount_type::public.discount_type WHERE id = p_id;
  END IF;

  IF p_discount_value IS NOT NULL THEN
    IF p_discount_value <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Discount value must be positive');
    END IF;
    IF EXISTS (SELECT 1 FROM public.coupons WHERE id = p_id AND discount_type = 'percentage' AND p_discount_value > 100) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Percentage discount cannot exceed 100');
    END IF;
    UPDATE public.coupons SET discount_value = p_discount_value WHERE id = p_id;
  END IF;

  IF p_min_order IS NOT NULL THEN
    UPDATE public.coupons SET min_order = p_min_order WHERE id = p_id;
  END IF;

  IF p_max_uses IS NOT NULL THEN
    UPDATE public.coupons SET max_uses = p_max_uses WHERE id = p_id;
  END IF;

  IF p_maximum_discount_amount IS NOT NULL THEN
    UPDATE public.coupons SET maximum_discount_amount = p_maximum_discount_amount WHERE id = p_id;
  END IF;

  IF p_starts_at IS NOT NULL THEN
    UPDATE public.coupons SET starts_at = p_starts_at WHERE id = p_id;
  END IF;

  IF p_expires_at IS NOT NULL THEN
    UPDATE public.coupons SET expires_at = p_expires_at WHERE id = p_id;
  END IF;

  IF p_is_active IS NOT NULL THEN
    UPDATE public.coupons SET is_active = p_is_active WHERE id = p_id;
  END IF;

  IF p_metadata IS NOT NULL THEN
    UPDATE public.coupons SET metadata = p_metadata WHERE id = p_id;
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'A coupon with this code already exists');
  WHEN others THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: update_invoice_status(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_status(p_invoice_id uuid, p_status text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  SELECT status INTO v_old_status FROM invoices WHERE id = p_invoice_id;
  IF v_old_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF p_status = 'paid' THEN
    UPDATE invoices SET status = p_status, paid_at = now() WHERE id = p_invoice_id;
  ELSIF p_status = 'cancelled' THEN
    UPDATE invoices SET status = p_status, cancelled_at = now() WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices SET status = p_status WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: update_order_status(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
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
  SET status = p_status::public.order_status, 
      updated_at = now(),
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
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


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_checkout_token(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_checkout_token(p_order_id uuid, p_token text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_stored_token TEXT;
  v_status       TEXT;
BEGIN
  SELECT checkout_session_token, status::TEXT
  INTO v_stored_token, v_status
  FROM orders
  WHERE id = p_order_id;

  IF v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_status != 'pending' THEN
    RETURN FALSE;
  END IF;

  IF v_stored_token IS NULL OR v_stored_token != p_token THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;


--
-- Name: validate_stock(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_stock(p_product_id uuid, p_qty integer) RETURNS boolean
    LANGUAGE sql
    AS $$
  select case
    when stock >= p_qty then true
    else false
  end
  from products
  where id = p_product_id;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'abandoned'::text NOT NULL,
    recovered_at timestamp with time zone,
    converted_at timestamp with time zone,
    converted_order_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT abandoned_carts_status_check CHECK ((status = ANY (ARRAY['abandoned'::text, 'recovered'::text, 'converted'::text, 'expired'::text])))
);


--
-- Name: abandoned_cart_analytics; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.abandoned_cart_analytics AS
 SELECT count(*) FILTER (WHERE (status = ANY (ARRAY['abandoned'::text, 'expired'::text]))) AS total_abandoned,
    COALESCE(sum(subtotal) FILTER (WHERE (status = ANY (ARRAY['abandoned'::text, 'expired'::text]))), (0)::numeric) AS lost_revenue,
    COALESCE(sum(subtotal) FILTER (WHERE (status = 'recovered'::text)), (0)::numeric) AS recovered_revenue,
        CASE
            WHEN (count(*) > 0) THEN round((((count(*) FILTER (WHERE (status = ANY (ARRAY['recovered'::text, 'converted'::text]))))::numeric / (count(*))::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS recovery_rate
   FROM public.abandoned_carts;


--
-- Name: abandoned_cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cart_id uuid NOT NULL,
    product_id uuid,
    variant_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    label text,
    first_name text,
    last_name text,
    phone text,
    line1 text NOT NULL,
    line2 text,
    city text NOT NULL,
    state text,
    postal_code text NOT NULL,
    country text DEFAULT 'United States'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    entity_type text,
    entity_id text,
    details jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'editor'::text])))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    old_data jsonb,
    new_data jsonb,
    ip_address text,
    user_agent text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone
);


--
-- Name: background_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.background_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_type text NOT NULL,
    order_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    result jsonb,
    retry_count integer DEFAULT 0,
    max_retries integer DEFAULT 3,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    CONSTRAINT background_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'dlq'::text])))
);


--
-- Name: blog_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_authors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text,
    bio text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blog_id uuid,
    author_name text NOT NULL,
    author_email text NOT NULL,
    content text NOT NULL,
    approved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_tag_relation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_tag_relation (
    blog_id uuid NOT NULL,
    tag_id uuid NOT NULL
);


--
-- Name: blog_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blog_views; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blog_id uuid,
    ip_address text,
    user_agent text,
    viewed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blogs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    content text NOT NULL,
    excerpt text,
    cover_image text,
    gallery_images text[] DEFAULT '{}'::text[] NOT NULL,
    author_id uuid,
    category_id uuid,
    reading_time integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    last_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    views_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meta_title text,
    meta_description text,
    meta_keywords text,
    canonical_url text,
    CONSTRAINT blogs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'scheduled'::text])))
);


--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cart_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    session_id text,
    product_id uuid NOT NULL,
    variant_id uuid,
    quantity integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    size text DEFAULT ''::text NOT NULL,
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT cart_owner_check CHECK (((user_id IS NOT NULL) OR (session_id IS NOT NULL)))
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    subject text,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    user_id uuid NOT NULL,
    order_id uuid NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupon_redemptions_discount_amount_check CHECK ((discount_amount >= (0)::numeric))
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    discount_type public.discount_type NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_order numeric(10,2) DEFAULT 0,
    max_uses integer,
    used_count integer DEFAULT 0 NOT NULL,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    maximum_discount_amount numeric(10,2),
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone,
    CONSTRAINT coupons_discount_value_check CHECK ((discount_value > (0)::numeric)),
    CONSTRAINT coupons_max_uses_check CHECK (((max_uses IS NULL) OR (max_uses > 0))),
    CONSTRAINT coupons_maximum_discount_amount_check CHECK (((maximum_discount_amount IS NULL) OR (maximum_discount_amount >= (0)::numeric))),
    CONSTRAINT coupons_min_order_check CHECK ((min_order >= (0)::numeric)),
    CONSTRAINT coupons_used_count_check CHECK ((used_count >= 0))
);


--
-- Name: dead_letter_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dead_letter_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_job_id uuid,
    job_type text NOT NULL,
    order_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    stack_trace text,
    retry_count integer DEFAULT 0 NOT NULL,
    failed_at timestamp with time zone DEFAULT now() NOT NULL,
    recovered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: device_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_id text,
    device_name text,
    browser text,
    os text,
    ip_address text,
    is_active boolean DEFAULT true NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid,
    email_type text NOT NULL,
    recipient text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    last_attempt_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    failure_reason text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_logs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'retrying'::text, 'delivered'::text, 'bounced'::text, 'opened'::text, 'clicked'::text, 'complained'::text])))
);


--
-- Name: failed_login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    ip_address text,
    user_agent text,
    attempt_count integer DEFAULT 1 NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: faqs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.faqs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    category text,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gift_card_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_card_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gift_card_id uuid NOT NULL,
    order_id uuid,
    user_id uuid,
    transaction_type text NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance_before numeric(10,2) NOT NULL,
    balance_after numeric(10,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_card_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT gift_card_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['redemption'::text, 'refund'::text, 'adjustment'::text, 'expiration'::text, 'activation'::text])))
);


--
-- Name: gift_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    initial_balance numeric(10,2) NOT NULL,
    current_balance numeric(10,2) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gift_cards_current_balance_check CHECK ((current_balance >= (0)::numeric)),
    CONSTRAINT gift_cards_initial_balance_check CHECK ((initial_balance > (0)::numeric)),
    CONSTRAINT gift_cards_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text, 'depleted'::text])))
);


--
-- Name: inventory_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    alert_type text NOT NULL,
    threshold integer NOT NULL,
    current_stock integer NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_alerts_alert_type_check CHECK ((alert_type = ANY (ARRAY['critical'::text, 'low'::text, 'overstock'::text])))
);


--
-- Name: inventory_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid,
    variant_id uuid,
    change_type public.inventory_change_type NOT NULL,
    quantity_change integer NOT NULL,
    quantity_after integer NOT NULL,
    reference_id text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checkout_request_id text NOT NULL,
    payment_intent_id text,
    product_id uuid NOT NULL,
    variant_id uuid,
    size text,
    quantity integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:30:00'::interval) NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT inventory_reservations_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT inventory_reservations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text NOT NULL,
    order_id uuid NOT NULL,
    customer_id uuid,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    tax_amount numeric(10,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(10,2) DEFAULT 0 NOT NULL,
    shipping_amount numeric(10,2) DEFAULT 0 NOT NULL,
    total_amount numeric(10,2) NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notes text,
    issued_at timestamp with time zone,
    paid_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pdf_path text,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'paid'::text, 'cancelled'::text, 'refunded'::text])))
);


--
-- Name: newsletters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    source text,
    metadata jsonb DEFAULT '{}'::jsonb,
    subscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    unsubscribed_at timestamp with time zone
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.notification_type DEFAULT 'system'::public.notification_type NOT NULL,
    title text NOT NULL,
    message text,
    data jsonb DEFAULT '{}'::jsonb,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    variant_id uuid,
    name text NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    image_url text,
    attributes jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_items_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


--
-- Name: order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    previous_status text,
    new_status text NOT NULL,
    changed_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_timeline; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_timeline (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    event_type text NOT NULL,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_timeline_event_type_check CHECK ((event_type = ANY (ARRAY['payment_received'::text, 'status_change'::text, 'note_added'::text, 'payment_refunded'::text, 'admin_action'::text, 'invoice_generated'::text, 'cancellation'::text, 'item_returned'::text])))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    subtotal numeric(10,2) NOT NULL,
    shipping_cost numeric(10,2) DEFAULT 0 NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) NOT NULL,
    coupon_code text,
    payment_status public.payment_status DEFAULT 'pending'::public.payment_status NOT NULL,
    payment_method text,
    shipping_address jsonb,
    billing_address jsonb,
    notes text,
    order_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    payment_provider text DEFAULT 'stripe'::text NOT NULL,
    stripe_session_id text,
    stripe_payment_intent_id text,
    paid_at timestamp with time zone,
    refunded_at timestamp with time zone,
    payment_error text,
    checkout_session_token text,
    cart_snapshot jsonb,
    checkout_started_at timestamp with time zone,
    webhook_processed_at timestamp with time zone,
    idempotency_key text,
    tax_amount numeric(10,2) DEFAULT 0 NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    checkout_request_id text,
    cancelled_by text,
    cancelled_at timestamp with time zone,
    cancellation_reason text,
    internal_notes text,
    paypal_order_id text,
    tracking_id text,
    estimated_delivery timestamp with time zone,
    shipping_method text,
    courier text,
    courier_tracking_number text,
    email text,
    delivered_at timestamp with time zone,
    CONSTRAINT orders_discount_check CHECK ((discount >= (0)::numeric)),
    CONSTRAINT orders_shipping_cost_check CHECK ((shipping_cost >= (0)::numeric)),
    CONSTRAINT orders_subtotal_check CHECK ((subtotal >= (0)::numeric)),
    CONSTRAINT orders_total_check CHECK ((total >= (0)::numeric))
);


--
-- Name: payment_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    session_id uuid,
    user_id uuid,
    payment_intent_id text,
    order_id uuid,
    status text,
    message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    stripe_session_id text,
    stripe_payment_intent_id text,
    payment_method text,
    currency text DEFAULT 'usd'::text NOT NULL,
    amount numeric(10,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    transaction_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payment_records_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text, 'refunded'::text, 'partially_refunded'::text])))
);


--
-- Name: payment_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checkout_request_id text NOT NULL,
    user_id uuid,
    email text,
    status text DEFAULT 'created'::text NOT NULL,
    payment_intent_id text,
    payment_method text,
    currency text DEFAULT 'usd'::text,
    amount integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    processing_at timestamp with time zone,
    failed_at timestamp with time zone,
    browser text,
    ip_address text,
    device_type text,
    checkout_duration_seconds integer,
    user_agent text,
    CONSTRAINT payment_sessions_status_check CHECK ((status = ANY (ARRAY['created'::text, 'pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'expired'::text])))
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    image_url text NOT NULL,
    alt_text text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    sku text,
    price numeric(10,2),
    stock integer DEFAULT 0 NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    color_hex text,
    sizes text[],
    size_stock jsonb DEFAULT '{}'::jsonb,
    compare_price numeric(10,2),
    CONSTRAINT product_variants_compare_price_check CHECK (((compare_price IS NULL) OR (compare_price >= (0)::numeric))),
    CONSTRAINT product_variants_price_check CHECK (((price IS NULL) OR (price >= (0)::numeric))),
    CONSTRAINT product_variants_stock_check CHECK ((stock >= 0))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    compare_price numeric(10,2),
    sku text,
    stock integer DEFAULT 0 NOT NULL,
    badge text,
    fabric text,
    material text,
    color text DEFAULT 'Ivory'::text NOT NULL,
    sizes text[] DEFAULT '{}'::text[],
    size_stock jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    popularity_score numeric(10,2) DEFAULT 0 NOT NULL,
    total_sales integer DEFAULT 0 NOT NULL,
    total_revenue numeric(10,2) DEFAULT 0 NOT NULL,
    purchase_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    short_description text,
    low_stock_threshold integer DEFAULT 5 NOT NULL,
    is_new boolean DEFAULT false NOT NULL,
    is_best_seller boolean DEFAULT false NOT NULL,
    colors jsonb DEFAULT '[]'::jsonb NOT NULL,
    sale_active boolean DEFAULT false NOT NULL,
    discount_percent integer DEFAULT 0 NOT NULL,
    CONSTRAINT products_compare_price_check CHECK (((compare_price IS NULL) OR (compare_price >= (0)::numeric))),
    CONSTRAINT products_discount_percent_check CHECK (((discount_percent >= 0) AND (discount_percent <= 100))),
    CONSTRAINT products_low_stock_threshold_check CHECK ((low_stock_threshold >= 0)),
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT products_status_check CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text, 'out_of_stock'::text]))),
    CONSTRAINT products_stock_check CHECK ((stock >= 0))
);


--
-- Name: COLUMN products.short_description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.short_description IS 'Short description for product cards / listings';


--
-- Name: COLUMN products.low_stock_threshold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.low_stock_threshold IS 'Stock level at which product is considered low stock';


--
-- Name: COLUMN products.is_new; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_new IS 'New Arrival label flag';


--
-- Name: COLUMN products.is_best_seller; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_best_seller IS 'Best Seller label flag';


--
-- Name: COLUMN products.colors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.colors IS 'JSON array of {name, hex} objects for color variants';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    first_name text,
    last_name text,
    phone text,
    avatar_url text,
    role text DEFAULT 'customer'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone,
    last_login_ip text,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['customer'::text, 'admin'::text])))
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    metadata jsonb DEFAULT '{}'::jsonb,
    attachments text[] DEFAULT '{}'::text[],
    stripe_refund_id text,
    rejection_reason text,
    more_info_notes text,
    CONSTRAINT refunds_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT refunds_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'awaiting_return'::text, 'received'::text, 'inspection_passed'::text, 'processing'::text, 'completed'::text, 'rejected'::text])))
);


--
-- Name: COLUMN refunds.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refunds.description IS 'Customer-provided description for refund request';


--
-- Name: COLUMN refunds.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refunds.metadata IS 'Metadata to track partial/item-level details';


--
-- Name: COLUMN refunds.attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.refunds.attachments IS 'Array of file paths uploaded as refund request proofs';


--
-- Name: return_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.return_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid,
    reason text NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT return_requests_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'refunded'::text])))
);


--
-- Name: review_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.review_tokens (
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    email text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    user_id uuid,
    rating integer NOT NULL,
    title text,
    review_text text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    order_item_id uuid,
    is_verified boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    reviewer_name text NOT NULL,
    CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT reviews_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: security_overview; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.security_overview AS
 SELECT COALESCE(( SELECT count(*) AS count
           FROM public.failed_login_attempts
          WHERE ((failed_login_attempts.last_attempt_at > (now() - '24:00:00'::interval)) AND (failed_login_attempts.attempt_count >= 3))), (0)::bigint) AS failed_logins_24h,
    COALESCE(( SELECT count(*) AS count
           FROM public.device_sessions
          WHERE (device_sessions.is_active = true)), (0)::bigint) AS active_sessions,
    COALESCE(( SELECT count(*) AS count
           FROM public.failed_login_attempts
          WHERE ((failed_login_attempts.attempt_count >= 5) AND (failed_login_attempts.last_attempt_at > (now() - '00:15:00'::interval)))), (0)::bigint) AS locked_users,
    COALESCE(( SELECT count(*) AS count
           FROM public.audit_logs
          WHERE ((audit_logs.created_at > (now() - '24:00:00'::interval)) AND (audit_logs.action = 'deleted'::text))), (0)::bigint) AS deletions_24h,
    COALESCE(( SELECT count(*) AS count
           FROM public.admin_activity
          WHERE (admin_activity.created_at > (now() - '24:00:00'::interval))), (0)::bigint) AS admin_actions_24h;


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id integer DEFAULT 1 NOT NULL,
    hero_image text,
    hero_heading text,
    hero_sub_heading text,
    hero_button_text text,
    hero_button_link text,
    announcement_enabled boolean DEFAULT false NOT NULL,
    announcement_text text,
    announcement_button_text text,
    announcement_button_link text,
    instagram_url text,
    facebook_url text,
    whatsapp_url text,
    phone text,
    email text,
    address text,
    logo text,
    favicon text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hero_button_1_text text,
    hero_button_1_link text,
    hero_button_2_text text,
    hero_button_2_link text,
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.testimonials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    role text,
    avatar_url text,
    content text NOT NULL,
    rating integer,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT testimonials_rating_check CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5))))
);


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    order_id uuid,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    error_message text,
    CONSTRAINT webhook_events_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: website_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.website_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    value jsonb DEFAULT '{}'::jsonb NOT NULL,
    group_name text,
    type text DEFAULT 'text'::text,
    description text,
    is_public boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wishlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    variant_id uuid
);


--
-- Name: abandoned_cart_items abandoned_cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_cart_items
    ADD CONSTRAINT abandoned_cart_items_pkey PRIMARY KEY (id);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: admin_activity admin_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity
    ADD CONSTRAINT admin_activity_pkey PRIMARY KEY (id);


--
-- Name: admin_roles admin_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_pkey PRIMARY KEY (id);


--
-- Name: admin_roles admin_roles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_user_id_key UNIQUE (user_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: background_jobs background_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);


--
-- Name: blog_authors blog_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors
    ADD CONSTRAINT blog_authors_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_name_key UNIQUE (name);


--
-- Name: blog_categories blog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_slug_key UNIQUE (slug);


--
-- Name: blog_comments blog_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_pkey PRIMARY KEY (id);


--
-- Name: blog_tag_relation blog_tag_relation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tag_relation
    ADD CONSTRAINT blog_tag_relation_pkey PRIMARY KEY (blog_id, tag_id);


--
-- Name: blog_tags blog_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_name_key UNIQUE (name);


--
-- Name: blog_tags blog_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_pkey PRIMARY KEY (id);


--
-- Name: blog_tags blog_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_slug_key UNIQUE (slug);


--
-- Name: blog_views blog_views_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_views
    ADD CONSTRAINT blog_views_pkey PRIMARY KEY (id);


--
-- Name: blogs blogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_pkey PRIMARY KEY (id);


--
-- Name: blogs blogs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_slug_key UNIQUE (slug);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_code_key UNIQUE (code);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: dead_letter_jobs dead_letter_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dead_letter_jobs
    ADD CONSTRAINT dead_letter_jobs_pkey PRIMARY KEY (id);


--
-- Name: device_sessions device_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: failed_login_attempts failed_login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_login_attempts
    ADD CONSTRAINT failed_login_attempts_pkey PRIMARY KEY (id);


--
-- Name: faqs faqs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT faqs_pkey PRIMARY KEY (id);


--
-- Name: gift_card_transactions gift_card_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_pkey PRIMARY KEY (id);


--
-- Name: gift_cards gift_cards_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_code_key UNIQUE (code);


--
-- Name: gift_cards gift_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_pkey PRIMARY KEY (id);


--
-- Name: inventory_alerts inventory_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_pkey PRIMARY KEY (id);


--
-- Name: inventory_alerts inventory_alerts_product_id_alert_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_product_id_alert_type_key UNIQUE (product_id, alert_type);


--
-- Name: inventory_logs inventory_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_pkey PRIMARY KEY (id);


--
-- Name: inventory_reservations inventory_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: newsletters newsletters_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_email_key UNIQUE (email);


--
-- Name: newsletters newsletters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletters
    ADD CONSTRAINT newsletters_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: order_timeline order_timeline_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_timeline
    ADD CONSTRAINT order_timeline_pkey PRIMARY KEY (id);


--
-- Name: orders orders_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tracking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tracking_id_key UNIQUE (tracking_id);


--
-- Name: payment_audit_logs payment_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_audit_logs
    ADD CONSTRAINT payment_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: payment_records payment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_pkey PRIMARY KEY (id);


--
-- Name: payment_sessions payment_sessions_checkout_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_checkout_request_id_key UNIQUE (checkout_request_id);


--
-- Name: payment_sessions payment_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_pkey PRIMARY KEY (id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: return_requests return_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_pkey PRIMARY KEY (id);


--
-- Name: review_tokens review_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_tokens
    ADD CONSTRAINT review_tokens_pkey PRIMARY KEY (token);


--
-- Name: reviews reviews_order_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_item_id_key UNIQUE (order_item_id);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: webhook_events webhook_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_event_id_key UNIQUE (event_id);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: website_settings website_settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_settings
    ADD CONSTRAINT website_settings_key_key UNIQUE (key);


--
-- Name: website_settings website_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.website_settings
    ADD CONSTRAINT website_settings_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_user_id_product_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_id_product_id_variant_id_key UNIQUE (user_id, product_id, variant_id);


--
-- Name: idx_abandoned_cart_items_cart; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_cart_items_cart ON public.abandoned_cart_items USING btree (cart_id);


--
-- Name: idx_abandoned_carts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_created ON public.abandoned_carts USING btree (created_at DESC);


--
-- Name: idx_abandoned_carts_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_session ON public.abandoned_carts USING btree (session_id);


--
-- Name: idx_abandoned_carts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_status ON public.abandoned_carts USING btree (status);


--
-- Name: idx_abandoned_carts_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_updated ON public.abandoned_carts USING btree (updated_at DESC);


--
-- Name: idx_abandoned_carts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_user ON public.abandoned_carts USING btree (user_id);


--
-- Name: idx_addresses_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addresses_default ON public.addresses USING btree (user_id, is_default) WHERE (is_default = true);


--
-- Name: idx_addresses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addresses_user ON public.addresses USING btree (user_id);


--
-- Name: idx_admin_activity_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_action ON public.admin_activity USING btree (action);


--
-- Name: idx_admin_activity_admin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_admin ON public.admin_activity USING btree (admin_id);


--
-- Name: idx_admin_activity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_created ON public.admin_activity USING btree (created_at DESC);


--
-- Name: idx_admin_activity_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_activity_entity ON public.admin_activity USING btree (entity_type, entity_id);


--
-- Name: idx_admin_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_roles_role ON public.admin_roles USING btree (role);


--
-- Name: idx_admin_roles_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_roles_user ON public.admin_roles USING btree (user_id);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_entity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity_created ON public.audit_logs USING btree (entity_type, created_at DESC);


--
-- Name: idx_bg_jobs_next_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_next_retry ON public.background_jobs USING btree (next_retry_at) WHERE (status = 'failed'::text);


--
-- Name: idx_bg_jobs_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_order ON public.background_jobs USING btree (order_id);


--
-- Name: idx_bg_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_status ON public.background_jobs USING btree (status);


--
-- Name: idx_bg_jobs_type_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bg_jobs_type_order ON public.background_jobs USING btree (job_type, order_id);


--
-- Name: idx_blog_tag_relation_tag_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_tag_relation_tag_id ON public.blog_tag_relation USING btree (tag_id);


--
-- Name: idx_blogs_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_author_id ON public.blogs USING btree (author_id);


--
-- Name: idx_blogs_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_category_id ON public.blogs USING btree (category_id);


--
-- Name: idx_blogs_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_slug ON public.blogs USING btree (slug);


--
-- Name: idx_blogs_status_published_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blogs_status_published_at ON public.blogs USING btree (status, published_at);


--
-- Name: idx_cart_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_product ON public.cart_items USING btree (product_id);


--
-- Name: idx_cart_items_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_session ON public.cart_items USING btree (session_id);


--
-- Name: idx_cart_items_unique_owner_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_cart_items_unique_owner_item ON public.cart_items USING btree (COALESCE((user_id)::text, ''::text), COALESCE(session_id, ''::text), product_id, COALESCE((variant_id)::text, ''::text), COALESCE(size, ''::text));


--
-- Name: idx_cart_items_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_user ON public.cart_items USING btree (user_id);


--
-- Name: idx_cart_items_user_product_size; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cart_items_user_product_size ON public.cart_items USING btree (user_id, product_id, variant_id, size);


--
-- Name: idx_categories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_active ON public.categories USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.categories USING btree (parent_id);


--
-- Name: idx_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_slug ON public.categories USING btree (slug);


--
-- Name: idx_contact_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_created ON public.contact_messages USING btree (created_at DESC);


--
-- Name: idx_contact_messages_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_read ON public.contact_messages USING btree (is_read);


--
-- Name: idx_coupon_redemptions_coupon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions USING btree (coupon_id);


--
-- Name: idx_coupon_redemptions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_created ON public.coupon_redemptions USING btree (created_at DESC);


--
-- Name: idx_coupon_redemptions_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_order ON public.coupon_redemptions USING btree (order_id);


--
-- Name: idx_coupon_redemptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_user ON public.coupon_redemptions USING btree (user_id);


--
-- Name: idx_coupons_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_active ON public.coupons USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_coupons_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_code ON public.coupons USING btree (code);


--
-- Name: idx_coupons_valid_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_valid_period ON public.coupons USING btree (starts_at, expires_at) WHERE (is_active = true);


--
-- Name: idx_device_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sessions_active ON public.device_sessions USING btree (is_active);


--
-- Name: idx_device_sessions_last_activity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sessions_last_activity ON public.device_sessions USING btree (last_activity_at DESC);


--
-- Name: idx_device_sessions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sessions_session ON public.device_sessions USING btree (session_id);


--
-- Name: idx_device_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_sessions_user ON public.device_sessions USING btree (user_id);


--
-- Name: idx_dlq_failed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlq_failed_at ON public.dead_letter_jobs USING btree (failed_at DESC);


--
-- Name: idx_dlq_job_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlq_job_type ON public.dead_letter_jobs USING btree (job_type);


--
-- Name: idx_dlq_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dlq_order_id ON public.dead_letter_jobs USING btree (order_id);


--
-- Name: idx_email_logs_order_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_logs_order_type ON public.email_logs USING btree (order_id, email_type);


--
-- Name: idx_email_logs_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_retry ON public.email_logs USING btree (next_retry_at) WHERE ((status = 'retrying'::text) AND (next_retry_at IS NOT NULL));


--
-- Name: idx_email_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_status ON public.email_logs USING btree (status);


--
-- Name: idx_failed_login_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_login_email ON public.failed_login_attempts USING btree (email);


--
-- Name: idx_failed_login_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_login_ip ON public.failed_login_attempts USING btree (ip_address);


--
-- Name: idx_failed_login_last_attempt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_login_last_attempt ON public.failed_login_attempts USING btree (last_attempt_at DESC);


--
-- Name: idx_failed_login_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_login_user ON public.failed_login_attempts USING btree (user_id);


--
-- Name: idx_faqs_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_faqs_active ON public.faqs USING btree (is_active, sort_order);


--
-- Name: idx_gct_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gct_created ON public.gift_card_transactions USING btree (created_at DESC);


--
-- Name: idx_gct_gift_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gct_gift_card ON public.gift_card_transactions USING btree (gift_card_id);


--
-- Name: idx_gct_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gct_order ON public.gift_card_transactions USING btree (order_id);


--
-- Name: idx_gct_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gct_user ON public.gift_card_transactions USING btree (user_id);


--
-- Name: idx_gift_cards_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_code ON public.gift_cards USING btree (code);


--
-- Name: idx_gift_cards_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_created ON public.gift_cards USING btree (created_at DESC);


--
-- Name: idx_gift_cards_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_expires ON public.gift_cards USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_gift_cards_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gift_cards_status ON public.gift_cards USING btree (status);


--
-- Name: idx_inventory_alerts_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_alerts_product ON public.inventory_alerts USING btree (product_id);


--
-- Name: idx_inventory_alerts_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_alerts_resolved ON public.inventory_alerts USING btree (resolved) WHERE (resolved = false);


--
-- Name: idx_inventory_alerts_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_alerts_type ON public.inventory_alerts USING btree (alert_type);


--
-- Name: idx_inventory_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_logs_created ON public.inventory_logs USING btree (created_at DESC);


--
-- Name: idx_inventory_logs_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_logs_product ON public.inventory_logs USING btree (product_id);


--
-- Name: idx_inventory_logs_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_logs_reference ON public.inventory_logs USING btree (reference_id);


--
-- Name: idx_inventory_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_logs_type ON public.inventory_logs USING btree (change_type);


--
-- Name: idx_inventory_logs_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_logs_variant ON public.inventory_logs USING btree (variant_id);


--
-- Name: idx_inventory_reservations_checkout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_reservations_checkout ON public.inventory_reservations USING btree (checkout_request_id);


--
-- Name: idx_inventory_reservations_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_reservations_expires ON public.inventory_reservations USING btree (expires_at) WHERE (status = 'active'::text);


--
-- Name: idx_invoice_items_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items USING btree (invoice_id);


--
-- Name: idx_invoice_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_items_product_id ON public.invoice_items USING btree (product_id);


--
-- Name: idx_invoices_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_created_at ON public.invoices USING btree (created_at DESC);


--
-- Name: idx_invoices_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_customer_id ON public.invoices USING btree (customer_id);


--
-- Name: idx_invoices_issued_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_issued_at ON public.invoices USING btree (issued_at DESC);


--
-- Name: idx_invoices_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoices_number ON public.invoices USING btree (invoice_number);


--
-- Name: idx_invoices_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);


--
-- Name: idx_newsletter_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_active ON public.newsletters USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_newsletter_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_email ON public.newsletters USING btree (email);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product ON public.order_items USING btree (product_id);


--
-- Name: idx_order_items_product_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_items_product_order ON public.order_items USING btree (product_id, order_id);


--
-- Name: idx_order_timeline_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_timeline_created ON public.order_timeline USING btree (order_id, created_at DESC);


--
-- Name: idx_order_timeline_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_timeline_order ON public.order_timeline USING btree (order_id);


--
-- Name: idx_orders_checkout_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_checkout_request ON public.orders USING btree (checkout_request_id) WHERE (checkout_request_id IS NOT NULL);


--
-- Name: idx_orders_checkout_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_checkout_started ON public.orders USING btree (checkout_started_at) WHERE (checkout_started_at IS NOT NULL);


--
-- Name: idx_orders_checkout_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_checkout_token ON public.orders USING btree (checkout_session_token) WHERE (checkout_session_token IS NOT NULL);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_idempotency ON public.orders USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_orders_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_number ON public.orders USING btree (order_number);


--
-- Name: idx_orders_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_payment ON public.orders USING btree (payment_status);


--
-- Name: idx_orders_payment_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_payment_created ON public.orders USING btree (payment_status, created_at DESC);


--
-- Name: idx_orders_paypal_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_paypal_order_id ON public.orders USING btree (paypal_order_id);


--
-- Name: idx_orders_pi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_pi_id ON public.orders USING btree (stripe_payment_intent_id) WHERE ((stripe_payment_intent_id IS NOT NULL) AND (stripe_payment_intent_id <> ''::text));


--
-- Name: idx_orders_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_session_id ON public.orders USING btree (stripe_session_id) WHERE ((stripe_session_id IS NOT NULL) AND (stripe_session_id <> ''::text));


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status_created ON public.orders USING btree (status, created_at DESC);


--
-- Name: idx_orders_status_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status_payment ON public.orders USING btree (status, payment_status);


--
-- Name: idx_orders_stripe_payment_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_stripe_payment_intent_id ON public.orders USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_orders_stripe_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_stripe_session_id ON public.orders USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);


--
-- Name: idx_orders_tracking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_tracking_id ON public.orders USING btree (tracking_id);


--
-- Name: idx_orders_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);


--
-- Name: idx_orders_user_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_payment ON public.orders USING btree (user_id, payment_status);


--
-- Name: idx_osh_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_created ON public.order_status_history USING btree (order_id, created_at DESC);


--
-- Name: idx_osh_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_osh_order ON public.order_status_history USING btree (order_id);


--
-- Name: idx_pal_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pal_created ON public.payment_audit_logs USING btree (created_at DESC);


--
-- Name: idx_pal_event_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pal_event_type ON public.payment_audit_logs USING btree (event_type);


--
-- Name: idx_pal_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pal_order ON public.payment_audit_logs USING btree (order_id);


--
-- Name: idx_pal_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pal_session ON public.payment_audit_logs USING btree (session_id);


--
-- Name: idx_pal_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pal_user ON public.payment_audit_logs USING btree (user_id);


--
-- Name: idx_payment_records_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_records_order ON public.payment_records USING btree (order_id);


--
-- Name: idx_payment_records_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payment_records_payment_intent ON public.payment_records USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);


--
-- Name: idx_payment_records_session; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payment_records_session ON public.payment_records USING btree (stripe_session_id) WHERE (stripe_session_id IS NOT NULL);


--
-- Name: idx_payment_records_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_records_status ON public.payment_records USING btree (status);


--
-- Name: idx_payment_sessions_pi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_sessions_pi ON public.payment_sessions USING btree (payment_intent_id);


--
-- Name: idx_payment_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_sessions_status ON public.payment_sessions USING btree (status);


--
-- Name: idx_payment_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_sessions_user ON public.payment_sessions USING btree (user_id);


--
-- Name: idx_product_images_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_images_order ON public.product_images USING btree (product_id, sort_order);


--
-- Name: idx_product_images_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_images_product ON public.product_images USING btree (product_id);


--
-- Name: idx_product_variants_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_active ON public.product_variants USING btree (product_id, is_active) WHERE (is_active = true);


--
-- Name: idx_product_variants_attrs; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_attrs ON public.product_variants USING gin (attributes);


--
-- Name: idx_product_variants_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);


--
-- Name: idx_product_variants_size_stock_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_variants_size_stock_gin ON public.product_variants USING gin (size_stock);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_products_badge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_badge ON public.products USING btree (badge);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_id);


--
-- Name: idx_products_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_created ON public.products USING btree (created_at DESC);


--
-- Name: idx_products_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_featured ON public.products USING btree (featured) WHERE (featured = true);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name ON public.products USING btree (name);


--
-- Name: idx_products_popularity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_popularity ON public.products USING btree (popularity_score DESC);


--
-- Name: idx_products_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_price ON public.products USING btree (price);


--
-- Name: idx_products_size_stock_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_size_stock_gin ON public.products USING gin (size_stock);


--
-- Name: idx_products_sizes; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sizes ON public.products USING gin (sizes);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_products_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_status ON public.products USING btree (status);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);


--
-- Name: idx_refunds_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_refunds_active_unique ON public.refunds USING btree (order_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text, 'awaiting_return'::text, 'received'::text, 'inspection_passed'::text, 'processing'::text]));


--
-- Name: idx_refunds_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_order ON public.refunds USING btree (order_id);


--
-- Name: idx_refunds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_status ON public.refunds USING btree (status);


--
-- Name: idx_return_requests_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_requests_order ON public.return_requests USING btree (order_id);


--
-- Name: idx_return_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_return_requests_status ON public.return_requests USING btree (status);


--
-- Name: idx_review_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_review_tokens_token ON public.review_tokens USING btree (token);


--
-- Name: idx_reviews_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_created_at ON public.reviews USING btree (created_at DESC);


--
-- Name: idx_reviews_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_product_id ON public.reviews USING btree (product_id);


--
-- Name: idx_reviews_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_status ON public.reviews USING btree (status);


--
-- Name: idx_reviews_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reviews_user_id ON public.reviews USING btree (user_id);


--
-- Name: idx_settings_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_group ON public.website_settings USING btree (group_name);


--
-- Name: idx_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_key ON public.website_settings USING btree (key);


--
-- Name: idx_settings_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_public ON public.website_settings USING btree (is_public) WHERE (is_public = true);


--
-- Name: idx_testimonials_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_testimonials_active ON public.testimonials USING btree (is_active, sort_order);


--
-- Name: idx_webhook_events_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_event_id ON public.webhook_events USING btree (event_id);


--
-- Name: idx_webhook_events_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_order_id ON public.webhook_events USING btree (order_id);


--
-- Name: idx_wishlists_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wishlists_product ON public.wishlists USING btree (product_id);


--
-- Name: idx_wishlists_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wishlists_user ON public.wishlists USING btree (user_id);


--
-- Name: products flag_low_stock_on_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER flag_low_stock_on_products BEFORE UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.flag_low_stock_products();


--
-- Name: product_variants flag_low_stock_on_variants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER flag_low_stock_on_variants BEFORE UPDATE OF stock ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.flag_low_stock_variants();


--
-- Name: abandoned_carts set_abandoned_carts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_abandoned_carts_updated_at BEFORE UPDATE ON public.abandoned_carts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addresses set_addresses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: audit_logs set_audit_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_audit_logs_updated_at BEFORE UPDATE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cart_items set_cart_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories set_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: coupons set_coupons_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_coupons_updated_at BEFORE UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: email_logs set_email_logs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_email_logs_updated_at BEFORE UPDATE ON public.email_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: faqs set_faqs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_faqs_updated_at BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: gift_cards set_gift_cards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_gift_cards_updated_at BEFORE UPDATE ON public.gift_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: invoices set_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: orders set_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payment_records set_payment_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_payment_records_updated_at BEFORE UPDATE ON public.payment_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: product_variants set_product_variants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_product_variants_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products set_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: refunds set_refunds_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_refunds_updated_at BEFORE UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: return_requests set_return_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_return_requests_updated_at BEFORE UPDATE ON public.return_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: reviews set_reviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: website_settings set_website_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_website_settings_updated_at BEFORE UPDATE ON public.website_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: categories trg_audit_categories; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_categories AFTER INSERT OR DELETE OR UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: coupons trg_audit_coupons; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_coupons AFTER INSERT OR DELETE OR UPDATE ON public.coupons FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: gift_cards trg_audit_gift_cards; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_gift_cards AFTER INSERT OR DELETE OR UPDATE ON public.gift_cards FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: orders trg_audit_orders; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_orders AFTER INSERT OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: orders trg_audit_orders_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_orders_status AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();


--
-- Name: products trg_audit_products; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_products AFTER INSERT OR DELETE OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: refunds trg_audit_refunds; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_refunds AFTER INSERT OR DELETE OR UPDATE ON public.refunds FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: reviews trg_audit_reviews; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_reviews AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();


--
-- Name: products trg_calculate_product_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calculate_product_stock BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.trg_fn_calculate_product_stock();


--
-- Name: product_variants trg_calculate_variant_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_calculate_variant_stock BEFORE INSERT OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.trg_fn_calculate_variant_stock();


--
-- Name: orders trg_on_order_delivered; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_on_order_delivered AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_review_email();


--
-- Name: payment_sessions trg_payment_sessions_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_sessions_status BEFORE INSERT OR UPDATE OF status ON public.payment_sessions FOR EACH ROW EXECUTE FUNCTION public.check_payment_session_status();


--
-- Name: products trg_stock_change_alerts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_change_alerts AFTER UPDATE OF stock ON public.products FOR EACH ROW EXECUTE FUNCTION public.stock_change_alert_trigger();


--
-- Name: product_variants trg_sync_product_stock_from_variants; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_product_stock_from_variants AFTER INSERT OR DELETE OR UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.trg_fn_sync_product_stock_from_variants();


--
-- Name: orders trigger_set_order_tracking_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_set_order_tracking_id BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_tracking_id();


--
-- Name: abandoned_cart_items abandoned_cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_cart_items
    ADD CONSTRAINT abandoned_cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.abandoned_carts(id) ON DELETE CASCADE;


--
-- Name: abandoned_cart_items abandoned_cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_cart_items
    ADD CONSTRAINT abandoned_cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: abandoned_cart_items abandoned_cart_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_cart_items
    ADD CONSTRAINT abandoned_cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: abandoned_carts abandoned_carts_converted_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: abandoned_carts abandoned_carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_activity admin_activity_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_activity
    ADD CONSTRAINT admin_activity_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_roles admin_roles_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_roles admin_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_roles
    ADD CONSTRAINT admin_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: background_jobs background_jobs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.background_jobs
    ADD CONSTRAINT background_jobs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: blog_comments blog_comments_blog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_comments
    ADD CONSTRAINT blog_comments_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id) ON DELETE CASCADE;


--
-- Name: blog_tag_relation blog_tag_relation_blog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tag_relation
    ADD CONSTRAINT blog_tag_relation_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id) ON DELETE CASCADE;


--
-- Name: blog_tag_relation blog_tag_relation_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tag_relation
    ADD CONSTRAINT blog_tag_relation_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.blog_tags(id) ON DELETE CASCADE;


--
-- Name: blog_views blog_views_blog_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_views
    ADD CONSTRAINT blog_views_blog_id_fkey FOREIGN KEY (blog_id) REFERENCES public.blogs(id) ON DELETE CASCADE;


--
-- Name: blogs blogs_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.blog_authors(id) ON DELETE SET NULL;


--
-- Name: blogs blogs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blogs
    ADD CONSTRAINT blogs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: cart_items cart_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: categories categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: device_sessions device_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_sessions
    ADD CONSTRAINT device_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: failed_login_attempts failed_login_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_login_attempts
    ADD CONSTRAINT failed_login_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: gift_card_transactions gift_card_transactions_gift_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_gift_card_id_fkey FOREIGN KEY (gift_card_id) REFERENCES public.gift_cards(id) ON DELETE CASCADE;


--
-- Name: gift_card_transactions gift_card_transactions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: gift_card_transactions gift_card_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_card_transactions
    ADD CONSTRAINT gift_card_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: gift_cards gift_cards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_cards
    ADD CONSTRAINT gift_cards_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_alerts inventory_alerts_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_alerts
    ADD CONSTRAINT inventory_alerts_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: inventory_logs inventory_logs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: inventory_logs inventory_logs_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: inventory_reservations inventory_reservations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: inventory_reservations inventory_reservations_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_reservations
    ADD CONSTRAINT inventory_reservations_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id);


--
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;


--
-- Name: order_status_history order_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: order_status_history order_status_history_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_timeline order_timeline_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_timeline
    ADD CONSTRAINT order_timeline_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_records payment_records_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: payment_sessions payment_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_sessions
    ADD CONSTRAINT payment_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_images product_images_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: refunds refunds_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: return_requests return_requests_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: return_requests return_requests_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.return_requests
    ADD CONSTRAINT return_requests_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;


--
-- Name: review_tokens review_tokens_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_tokens
    ADD CONSTRAINT review_tokens_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: review_tokens review_tokens_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.review_tokens
    ADD CONSTRAINT review_tokens_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: reviews reviews_order_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: reviews reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reviews
    ADD CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: webhook_events webhook_events_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: wishlists wishlists_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wishlists wishlists_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: device_sessions Admins can manage device sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage device sessions" ON public.device_sessions USING (public.is_staff());


--
-- Name: admin_roles Admins can read admin_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read admin_roles" ON public.admin_roles FOR SELECT USING (public.is_admin());


--
-- Name: site_settings Allow admin write access to site_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow admin write access to site_settings" ON public.site_settings TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: blog_comments Allow public INSERT on blog_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public INSERT on blog_comments" ON public.blog_comments FOR INSERT WITH CHECK (true);


--
-- Name: blog_views Allow public INSERT on blog_views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public INSERT on blog_views" ON public.blog_views FOR INSERT WITH CHECK (true);


--
-- Name: blog_comments Allow public SELECT on approved blog_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on approved blog_comments" ON public.blog_comments FOR SELECT USING (((approved = true) OR ((auth.uid() IS NOT NULL) AND public.is_staff())));


--
-- Name: blog_authors Allow public SELECT on blog_authors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on blog_authors" ON public.blog_authors FOR SELECT USING (true);


--
-- Name: blog_categories Allow public SELECT on blog_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on blog_categories" ON public.blog_categories FOR SELECT USING (true);


--
-- Name: blog_tag_relation Allow public SELECT on blog_tag_relation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on blog_tag_relation" ON public.blog_tag_relation FOR SELECT USING (true);


--
-- Name: blog_tags Allow public SELECT on blog_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on blog_tags" ON public.blog_tags FOR SELECT USING (true);


--
-- Name: blogs Allow public SELECT on published blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public SELECT on published blogs" ON public.blogs FOR SELECT USING (((status = 'published'::text) OR ((auth.uid() IS NOT NULL) AND public.is_staff())));


--
-- Name: site_settings Allow public read access to site_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to site_settings" ON public.site_settings FOR SELECT USING (true);


--
-- Name: blog_authors Allow staff ALL on blog_authors; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blog_authors" ON public.blog_authors TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blog_categories Allow staff ALL on blog_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blog_categories" ON public.blog_categories TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blog_comments Allow staff ALL on blog_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blog_comments" ON public.blog_comments TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blog_tag_relation Allow staff ALL on blog_tag_relation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blog_tag_relation" ON public.blog_tag_relation TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blog_tags Allow staff ALL on blog_tags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blog_tags" ON public.blog_tags TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blogs Allow staff ALL on blogs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff ALL on blogs" ON public.blogs TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());


--
-- Name: blog_views Allow staff SELECT on blog_views; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow staff SELECT on blog_views" ON public.blog_views FOR SELECT TO authenticated USING (public.is_staff());


--
-- Name: faqs Anyone can read active FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active FAQs" ON public.faqs FOR SELECT USING (((is_active = true) OR public.is_staff()));


--
-- Name: categories Anyone can read active categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active categories" ON public.categories FOR SELECT USING (((is_active = true) OR public.is_staff()));


--
-- Name: coupons Anyone can read active coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active coupons" ON public.coupons FOR SELECT USING ((((is_active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((expires_at IS NULL) OR (expires_at > now()))) OR public.is_staff()));


--
-- Name: gift_cards Anyone can read active gift_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active gift_cards" ON public.gift_cards FOR SELECT USING ((((status = 'active'::text) AND ((expires_at IS NULL) OR (expires_at > now()))) OR (auth.uid() = created_by) OR public.is_staff()));


--
-- Name: products Anyone can read active products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active products" ON public.products FOR SELECT USING (((is_active = true) OR public.is_staff()));


--
-- Name: testimonials Anyone can read active testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active testimonials" ON public.testimonials FOR SELECT USING (((is_active = true) OR public.is_staff()));


--
-- Name: product_variants Anyone can read active variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active variants" ON public.product_variants FOR SELECT USING (((is_active = true) OR public.is_staff()));


--
-- Name: reviews Anyone can read approved reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read approved reviews" ON public.reviews FOR SELECT USING (((status = 'approved'::text) OR public.is_staff()));


--
-- Name: newsletters Anyone can read own subscription (by email); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read own subscription (by email)" ON public.newsletters FOR SELECT USING (((email = current_setting('request.email'::text, true)) OR public.is_staff()));


--
-- Name: product_images Anyone can read product images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read product images" ON public.product_images FOR SELECT USING (true);


--
-- Name: website_settings Anyone can read public settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read public settings" ON public.website_settings FOR SELECT USING (((is_public = true) OR public.is_staff()));


--
-- Name: review_tokens Anyone can select review_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can select review_tokens" ON public.review_tokens FOR SELECT USING (true);


--
-- Name: contact_messages Anyone can submit contact messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can submit contact messages" ON public.contact_messages FOR INSERT WITH CHECK (true);


--
-- Name: newsletters Anyone can subscribe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can subscribe" ON public.newsletters FOR INSERT WITH CHECK (true);


--
-- Name: reviews Customers can create own reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can create own reviews" ON public.reviews FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: reviews Customers can update own pending reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can update own pending reviews" ON public.reviews FOR UPDATE USING (((auth.uid() = user_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'pending'::text)));


--
-- Name: email_logs Customers can view own email_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own email_logs" ON public.email_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = email_logs.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: invoice_items Customers can view own invoice items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own invoice items" ON public.invoice_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND ((i.customer_id = auth.uid()) OR public.is_staff())))));


--
-- Name: invoices Customers can view own invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own invoices" ON public.invoices FOR SELECT USING (((auth.uid() = customer_id) OR public.is_staff()));


--
-- Name: order_status_history Customers can view own order_status_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own order_status_history" ON public.order_status_history FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_status_history.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: order_timeline Customers can view own order_timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own order_timeline" ON public.order_timeline FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_timeline.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: payment_records Customers can view own payment_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own payment_records" ON public.payment_records FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = payment_records.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: payment_sessions Customers can view own payment_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Customers can view own payment_sessions" ON public.payment_sessions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: faqs Editors and above can delete FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors and above can delete FAQs" ON public.faqs FOR DELETE USING ((public.has_admin_role('editor'::text) OR public.has_admin_role('admin'::text) OR public.has_admin_role('manager'::text)));


--
-- Name: faqs Editors and above can manage FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors and above can manage FAQs" ON public.faqs FOR INSERT WITH CHECK ((public.has_admin_role('editor'::text) OR public.has_admin_role('admin'::text) OR public.has_admin_role('manager'::text)));


--
-- Name: faqs Editors and above can update FAQs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Editors and above can update FAQs" ON public.faqs FOR UPDATE USING ((public.has_admin_role('editor'::text) OR public.has_admin_role('admin'::text) OR public.has_admin_role('manager'::text))) WITH CHECK ((public.has_admin_role('editor'::text) OR public.has_admin_role('admin'::text) OR public.has_admin_role('manager'::text)));


--
-- Name: admin_roles Only admins can delete admin_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete admin_roles" ON public.admin_roles FOR DELETE USING (public.is_admin());


--
-- Name: profiles Only admins can delete profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can delete profiles" ON public.profiles FOR DELETE USING (public.is_admin());


--
-- Name: admin_roles Only admins can manage admin_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can manage admin_roles" ON public.admin_roles FOR INSERT WITH CHECK (public.is_admin());


--
-- Name: admin_roles Only admins can update admin_roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can update admin_roles" ON public.admin_roles FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: orders Only staff can delete orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only staff can delete orders" ON public.orders FOR DELETE USING (public.is_staff());


--
-- Name: background_jobs Server inserts background jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Server inserts background jobs" ON public.background_jobs FOR INSERT WITH CHECK (true);


--
-- Name: background_jobs Server updates background jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Server updates background jobs" ON public.background_jobs FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: notifications Staff can create notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can create notifications" ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: contact_messages Staff can delete contact messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete contact messages" ON public.contact_messages FOR DELETE USING (public.is_staff());


--
-- Name: notifications Staff can delete notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can delete notifications" ON public.notifications FOR DELETE USING (public.is_staff());


--
-- Name: review_tokens Staff can do all on review_tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can do all on review_tokens" ON public.review_tokens USING (public.is_staff());


--
-- Name: reviews Staff can manage all reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage all reviews" ON public.reviews USING (public.is_staff());


--
-- Name: categories Staff can manage categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage categories" ON public.categories USING (public.is_staff());


--
-- Name: coupon_redemptions Staff can manage coupon_redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage coupon_redemptions" ON public.coupon_redemptions USING (public.is_staff());


--
-- Name: coupons Staff can manage coupons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage coupons" ON public.coupons USING (public.is_staff());


--
-- Name: dead_letter_jobs Staff can manage dead_letter_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage dead_letter_jobs" ON public.dead_letter_jobs USING (public.is_staff());


--
-- Name: email_logs Staff can manage email_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage email_logs" ON public.email_logs USING (public.is_staff());


--
-- Name: gift_card_transactions Staff can manage gift_card_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage gift_card_transactions" ON public.gift_card_transactions USING (public.is_staff());


--
-- Name: gift_cards Staff can manage gift_cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage gift_cards" ON public.gift_cards USING (public.is_staff());


--
-- Name: inventory_alerts Staff can manage inventory_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage inventory_alerts" ON public.inventory_alerts USING (public.is_staff());


--
-- Name: invoice_items Staff can manage invoice items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage invoice items" ON public.invoice_items USING (public.is_staff());


--
-- Name: invoices Staff can manage invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage invoices" ON public.invoices USING (public.is_staff());


--
-- Name: newsletters Staff can manage newsletters; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage newsletters" ON public.newsletters USING (public.is_staff());


--
-- Name: order_items Staff can manage order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage order items" ON public.order_items USING (public.is_staff());


--
-- Name: order_status_history Staff can manage order_status_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage order_status_history" ON public.order_status_history USING (public.is_staff());


--
-- Name: order_timeline Staff can manage order_timeline; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage order_timeline" ON public.order_timeline USING (public.is_staff());


--
-- Name: payment_audit_logs Staff can manage payment_audit_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage payment_audit_logs" ON public.payment_audit_logs USING (public.is_staff());


--
-- Name: payment_records Staff can manage payment_records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage payment_records" ON public.payment_records USING (public.is_staff());


--
-- Name: payment_sessions Staff can manage payment_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage payment_sessions" ON public.payment_sessions USING (public.is_staff());


--
-- Name: product_images Staff can manage product images; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage product images" ON public.product_images USING (public.is_staff());


--
-- Name: products Staff can manage products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage products" ON public.products USING (public.is_staff());


--
-- Name: refunds Staff can manage refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage refunds" ON public.refunds USING (public.is_staff());


--
-- Name: return_requests Staff can manage return_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage return_requests" ON public.return_requests USING (public.is_staff());


--
-- Name: website_settings Staff can manage settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage settings" ON public.website_settings USING (public.is_staff());


--
-- Name: testimonials Staff can manage testimonials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage testimonials" ON public.testimonials USING (public.is_staff());


--
-- Name: product_variants Staff can manage variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage variants" ON public.product_variants USING (public.is_staff());


--
-- Name: webhook_events Staff can manage webhook_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can manage webhook_events" ON public.webhook_events USING (public.is_staff());


--
-- Name: abandoned_cart_items Staff can read abandoned cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read abandoned cart items" ON public.abandoned_cart_items FOR SELECT USING (public.is_staff());


--
-- Name: abandoned_carts Staff can read abandoned carts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read abandoned carts" ON public.abandoned_carts FOR SELECT USING (public.is_staff());


--
-- Name: admin_activity Staff can read admin activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read admin activity" ON public.admin_activity FOR SELECT USING (public.is_staff());


--
-- Name: contact_messages Staff can read and manage contact messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read and manage contact messages" ON public.contact_messages FOR SELECT USING (public.is_staff());


--
-- Name: audit_logs Staff can read audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read audit logs" ON public.audit_logs FOR SELECT USING (public.is_staff());


--
-- Name: background_jobs Staff can read background jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read background jobs" ON public.background_jobs FOR SELECT USING (public.is_staff());


--
-- Name: failed_login_attempts Staff can read failed login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read failed login attempts" ON public.failed_login_attempts FOR SELECT USING (public.is_staff());


--
-- Name: inventory_logs Staff can read inventory logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read inventory logs" ON public.inventory_logs FOR SELECT USING (public.is_staff());


--
-- Name: abandoned_carts Staff can update abandoned carts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update abandoned carts" ON public.abandoned_carts FOR UPDATE USING (public.is_staff());


--
-- Name: contact_messages Staff can update contact messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can update contact messages" ON public.contact_messages FOR UPDATE USING (public.is_staff());


--
-- Name: abandoned_cart_items System can insert abandoned cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert abandoned cart items" ON public.abandoned_cart_items FOR INSERT WITH CHECK (true);


--
-- Name: abandoned_carts System can insert abandoned carts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert abandoned carts" ON public.abandoned_carts FOR INSERT WITH CHECK (true);


--
-- Name: admin_activity System can insert admin activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert admin activity" ON public.admin_activity FOR INSERT WITH CHECK (true);


--
-- Name: failed_login_attempts System can insert failed login attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert failed login attempts" ON public.failed_login_attempts FOR INSERT WITH CHECK (true);


--
-- Name: audit_logs Triggers and RPCs insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Triggers and RPCs insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);


--
-- Name: wishlists Users can add to own wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add to own wishlist" ON public.wishlists FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: order_items Users can create items on own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create items on own orders" ON public.order_items FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND (orders.user_id = auth.uid())))));


--
-- Name: orders Users can create own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own orders" ON public.orders FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: return_requests Users can create return_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create return_requests" ON public.return_requests FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = return_requests.order_id) AND (orders.user_id = auth.uid())))));


--
-- Name: addresses Users can delete own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own addresses" ON public.addresses FOR DELETE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: cart_items Users can delete own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own cart items" ON public.cart_items FOR DELETE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: addresses Users can insert own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own addresses" ON public.addresses FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: cart_items Users can insert own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own cart items" ON public.cart_items FOR INSERT WITH CHECK (((auth.uid() = user_id) OR (session_id IS NOT NULL)));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: notifications Users can mark own notifications as read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can mark own notifications as read" ON public.notifications FOR UPDATE USING (((auth.uid() = user_id) OR public.is_staff())) WITH CHECK (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: addresses Users can read own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own addresses" ON public.addresses FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: admin_roles Users can read own admin role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own admin role" ON public.admin_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: cart_items Users can read own cart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own cart" ON public.cart_items FOR SELECT USING (((auth.uid() = user_id) OR ((session_id IS NOT NULL) AND (session_id = current_setting('request.session_id'::text, true))) OR public.is_staff()));


--
-- Name: notifications Users can read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own notifications" ON public.notifications FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: order_items Users can read own order items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own order items" ON public.order_items FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = order_items.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: orders Users can read own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own orders" ON public.orders FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: profiles Users can read own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (((auth.uid() = id) OR public.is_staff()));


--
-- Name: refunds Users can read own refunds; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own refunds" ON public.refunds FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = refunds.order_id) AND (orders.user_id = auth.uid())))));


--
-- Name: return_requests Users can read own return_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own return_requests" ON public.return_requests FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.orders
  WHERE ((orders.id = return_requests.order_id) AND ((orders.user_id = auth.uid()) OR public.is_staff())))));


--
-- Name: device_sessions Users can read own sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own sessions" ON public.device_sessions FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: wishlists Users can read own wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own wishlist" ON public.wishlists FOR SELECT USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: wishlists Users can remove from own wishlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove from own wishlist" ON public.wishlists FOR DELETE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: addresses Users can update own addresses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own addresses" ON public.addresses FOR UPDATE USING (((auth.uid() = user_id) OR public.is_staff())) WITH CHECK (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: cart_items Users can update own cart items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own cart items" ON public.cart_items FOR UPDATE USING (((auth.uid() = user_id) OR public.is_staff()));


--
-- Name: orders Users can update own pending orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own pending orders" ON public.orders FOR UPDATE USING (((auth.uid() = user_id) OR public.is_staff())) WITH CHECK ((((auth.uid() = user_id) AND (status = ANY (ARRAY['pending'::public.order_status, 'confirmed'::public.order_status]))) OR public.is_staff()));


--
-- Name: profiles Users can update own profile (non-role fields); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile (non-role fields)" ON public.profiles FOR UPDATE USING (((auth.uid() = id) OR public.is_staff())) WITH CHECK ((((auth.uid() = id) AND (role = ( SELECT profiles_1.role
   FROM public.profiles profiles_1
  WHERE (profiles_1.id = auth.uid())))) OR public.is_staff()));


--
-- Name: coupon_redemptions Users can view own coupon_redemptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own coupon_redemptions" ON public.coupon_redemptions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: gift_card_transactions Users can view own gift_card_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own gift_card_transactions" ON public.gift_card_transactions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: abandoned_cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: abandoned_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: background_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_authors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_tag_relation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_tag_relation ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_tags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_views; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_views ENABLE ROW LEVEL SECURITY;

--
-- Name: blogs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;

--
-- Name: cart_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: dead_letter_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_logs decrement_stock function inserts logs (bypass RLS); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "decrement_stock function inserts logs (bypass RLS)" ON public.inventory_logs FOR INSERT WITH CHECK (true);


--
-- Name: device_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: failed_login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: faqs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_card_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_card_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: gift_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: inventory_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: newsletters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: order_timeline; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: product_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

--
-- Name: product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: return_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: review_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.review_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: testimonials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: website_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict rYgJQh4ZKwPiGyjkDZIpFIYgfcqtqhqwPfl663zmCatWL48fCgy66gi2q4kqxbQ

