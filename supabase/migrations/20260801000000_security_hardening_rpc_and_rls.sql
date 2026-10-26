-- =============================================================================
-- Security hardening, batch 1  (additive + reversible; see docs/SECURITY_HARDENING.md)
--
-- 1. Server-only RPCs (order creation, job queue, refunds ...) -> service_role only.
-- 2. Every other exposed SECURITY DEFINER RPC that had no caller check is moved to the
--    private schema `app_private` and re-published under the SAME name/signature behind a
--    staff-or-service guard. Existing callers (admin panel with an admin JWT, server with
--    the service key) keep working; anonymous and ordinary customers are rejected.
-- 3. Customer-facing RPCs get real ownership checks.
-- 4. Over-permissive RLS policies are tightened.
-- Rollback: see supabase/rollback/20260801000000_rollback.sql
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Guards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.is_privileged_session()
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) = 'service_role'
      -- direct DB sessions (SQL editor, pg_cron, migrations). PostgREST connects as `authenticator`,
      -- so API callers can never match this.
      OR session_user IN ('postgres', 'supabase_admin', 'service_role')
$$;

CREATE OR REPLACE FUNCTION app_private.assert_staff()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF app_private.is_privileged_session() OR public.is_staff() THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION app_private.is_privileged_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.assert_staff() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1 + 2. Lock down / wrap every exposed SECURITY DEFINER function
-- -----------------------------------------------------------------------------
DO $mig$
DECLARE
  r              RECORD;
  server_only    text[] := ARRAY[
    'create_order_from_payment','get_pending_jobs','get_retryable_jobs','move_to_dead_letter',
    'recover_from_dead_letter','next_order_number','next_invoice_number',
    'complete_refund_transaction','log_payment_event','reserve_inventory',
    'release_expired_reservations','check_payment_session_status','cleanup_expired_sessions',
    'check_and_generate_alerts','get_admin_dashboard_stats'];
  -- intentionally public or implemented with their own check below
  keep_public    text[] := ARRAY[
    'has_admin_role','is_admin','is_staff','owns_profile','require_admin',
    'get_success_order_details','get_order_by_tracking','get_order_by_tracking_id',
    'check_login_lockout','record_failed_login',
    'get_order_details','cancel_order','request_refund','create_return_request','end_user_session'];
  arg_defs       text;
  call_args      text;
  ident_args     text;
  vol            text;
  ret            text;
  body           text;
  n_locked       int := 0;
  n_wrapped      int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, p.proretset, p.provolatile, p.proargnames, p.pronargs,
           p.prorettype IN ('trigger'::regtype, 'event_trigger'::regtype) AS is_trigger,
           pg_get_function_arguments(p.oid)        AS arg_defs,
           pg_get_function_identity_arguments(p.oid) AS ident_args,
           pg_get_function_result(p.oid)           AS ret
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND p.prosrc NOT LIKE '%app_private.assert_staff()%'   -- idempotent: skip already-wrapped functions
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  LOOP
    IF r.proname = ANY (keep_public) THEN
      CONTINUE;
    END IF;

    -- trigger functions never need EXECUTE for API roles; server-only RPCs -> service_role
    IF r.is_trigger OR r.proname = ANY (server_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.ident_args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', r.proname, r.ident_args);
      n_locked := n_locked + 1;
      CONTINUE;
    END IF;

    BEGIN  -- sub-transaction: if one function cannot be wrapped, it is rolled back, closed to anon and reported
      -- wrap: move implementation to app_private, republish behind the staff guard
      IF r.pronargs > 0 AND r.proargnames IS NULL THEN
        RAISE EXCEPTION 'cannot wrap % (unnamed arguments)', r.proname;
      END IF;

      SELECT coalesce(string_agg(format('%1$I => %1$I', nm), ', '), '')
        INTO call_args
        FROM unnest(coalesce(r.proargnames, ARRAY[]::text[])) AS nm;

      vol := CASE r.provolatile WHEN 'i' THEN 'IMMUTABLE' WHEN 's' THEN 'STABLE' ELSE 'VOLATILE' END;

      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA app_private', r.proname, r.ident_args);
      EXECUTE format('REVOKE ALL ON FUNCTION app_private.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.ident_args);

      IF r.proretset THEN
        body := format('PERFORM app_private.assert_staff(); RETURN QUERY SELECT * FROM app_private.%I(%s);', r.proname, call_args);
      ELSE
        body := format('PERFORM app_private.assert_staff(); RETURN app_private.%I(%s);', r.proname, call_args);
      END IF;

      EXECUTE format(
        'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql %s SECURITY DEFINER SET search_path = '''' AS $f$ BEGIN %s END; $f$',
        r.proname, r.arg_defs, r.ret, vol, body);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.ident_args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.ident_args);
      n_wrapped := n_wrapped + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'hardening: could not wrap public.%(%): % -- revoked from anon only, REVIEW MANUALLY', r.proname, r.ident_args, SQLERRM;
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.ident_args);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', r.proname, r.ident_args);
    END;
  END LOOP;
  RAISE NOTICE 'hardening: % functions locked to service_role, % wrapped behind staff guard', n_locked, n_wrapped;
END
$mig$;

-- -----------------------------------------------------------------------------
-- 3. Customer-facing RPCs with real ownership checks
-- -----------------------------------------------------------------------------

-- get_order_details: owner, staff, service, or a GUEST order (UUID is the capability used by the
-- success page). internal_notes are never returned to non-staff.
DO $x$
BEGIN
  IF to_regprocedure('app_private.get_order_details(uuid)') IS NULL THEN
    ALTER FUNCTION public.get_order_details(uuid) SET SCHEMA app_private;
  END IF;
END
$x$;
REVOKE ALL ON FUNCTION app_private.get_order_details(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_order_details(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner   uuid;
  v_found   boolean;
  v_staff   boolean;
  v_result  jsonb;
BEGIN
  SELECT true, o.user_id INTO v_found, v_owner FROM public.orders o WHERE o.id = p_order_id;
  IF NOT coalesce(v_found, false) THEN
    RETURN NULL;
  END IF;
  v_staff := app_private.is_privileged_session() OR public.is_staff();
  IF NOT v_staff
     AND NOT (v_owner IS NULL OR (auth.uid() IS NOT NULL AND v_owner = auth.uid())) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;
  v_result := app_private.get_order_details(p_order_id);
  IF NOT v_staff AND v_result IS NOT NULL THEN
    v_result := v_result #- '{order,internal_notes}';
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_order_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_details(uuid) TO anon, authenticated, service_role;

-- cancel_order: 'staff' can no longer be claimed by the caller
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id uuid, p_reason text, p_cancelled_by text DEFAULT 'customer')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_current_status TEXT;
  v_order_owner_id UUID;
  v_is_staff       BOOLEAN := app_private.is_privileged_session() OR public.is_staff();
BEGIN
  SELECT status::TEXT, user_id INTO v_current_status, v_order_owner_id
  FROM public.orders WHERE id = p_order_id;
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF NOT v_is_staff AND (auth.uid() IS NULL OR v_order_owner_id IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to cancel this order');
  END IF;
  IF v_current_status NOT IN ('pending', 'confirmed', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order cannot be cancelled in its current status');
  END IF;
  -- trust the verified identity, not the caller-supplied label
  p_cancelled_by := CASE WHEN v_is_staff AND p_cancelled_by <> 'customer' THEN p_cancelled_by
                         WHEN v_is_staff AND v_order_owner_id IS DISTINCT FROM auth.uid() THEN 'staff'
                         ELSE 'customer' END;
  UPDATE public.orders
  SET status = 'cancelled'::public.order_status, cancelled_by = p_cancelled_by,
      cancelled_at = now(), cancellation_reason = p_reason, updated_at = now()
  WHERE id = p_order_id;
  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (p_order_id, v_current_status, 'cancelled', auth.uid(), p_reason);
  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'cancellation',
    CASE WHEN p_cancelled_by = 'customer' THEN 'Cancelled by customer: ' || p_reason
         ELSE 'Cancelled by staff: ' || p_reason END,
    jsonb_build_object('reason', p_reason, 'cancelled_by', p_cancelled_by));
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text, text) TO authenticated, service_role;

-- request_refund: previous `user_id != auth.uid()` evaluated to NULL (= allowed) for guests/anon
CREATE OR REPLACE FUNCTION public.request_refund(p_order_id uuid, p_reason text, p_description text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_status      TEXT;
  v_total       NUMERIC;
  v_user_id     UUID;
  v_has_pending BOOLEAN;
BEGIN
  SELECT status::TEXT, total, user_id INTO v_status, v_total, v_user_id
  FROM public.orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF NOT (app_private.is_privileged_session() OR public.is_staff())
     AND (auth.uid() IS NULL OR v_user_id IS DISTINCT FROM auth.uid()) THEN
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
REVOKE ALL ON FUNCTION public.request_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text, text) TO authenticated, service_role;

-- create_return_request: owner or staff only
CREATE OR REPLACE FUNCTION public.create_return_request(p_order_id uuid, p_reason text, p_order_item_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_owner uuid;
  v_found boolean;
  v_id    uuid;
BEGIN
  SELECT true, user_id INTO v_found, v_owner FROM public.orders WHERE id = p_order_id;
  IF NOT coalesce(v_found, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;
  IF NOT (app_private.is_privileged_session() OR public.is_staff())
     AND (auth.uid() IS NULL OR v_owner IS DISTINCT FROM auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  INSERT INTO public.return_requests (order_id, order_item_id, reason)
  VALUES (p_order_id, p_order_item_id, p_reason)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_return_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_return_request(uuid, text, uuid) TO authenticated, service_role;

-- end_user_session: own session or staff
CREATE OR REPLACE FUNCTION public.end_user_session(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  UPDATE device_sessions
  SET is_active = false, ended_at = now()
  WHERE id = p_session_id
    AND (user_id = auth.uid() OR app_private.is_privileged_session() OR public.is_staff());
  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION public.end_user_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_user_session(uuid) TO authenticated, service_role;

-- latent bug: create_order_from_payment passes a TEXT session id to log_payment_event(uuid) on the
-- out-of-stock path, which raised "function does not exist" instead of the intended message.
CREATE OR REPLACE FUNCTION public.log_payment_event(
  p_event_type text, p_session_id text, p_user_id uuid DEFAULT NULL, p_payment_intent_id text DEFAULT NULL,
  p_order_id uuid DEFAULT NULL, p_status text DEFAULT NULL, p_message text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v_sid uuid;
BEGIN
  BEGIN v_sid := p_session_id::uuid; EXCEPTION WHEN OTHERS THEN v_sid := NULL; END;
  PERFORM public.log_payment_event(p_event_type, v_sid, p_user_id, p_payment_intent_id,
                                   p_order_id, p_status, p_message, p_metadata);
END;
$$;
REVOKE ALL ON FUNCTION public.log_payment_event(text, text, uuid, text, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_payment_event(text, text, uuid, text, uuid, text, text, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. RLS tightening (all legitimate writers use the service key or SECURITY DEFINER code)
-- -----------------------------------------------------------------------------
-- customers must not create or edit order rows directly (price / payment_status tampering)
DROP POLICY IF EXISTS "Users can create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update own pending orders" ON public.orders;
CREATE POLICY "Staff can update orders" ON public.orders FOR UPDATE
  USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "Users can create items on own orders" ON public.order_items;

-- open INSERT/UPDATE (true) policies: only the server / definer functions write these
DROP POLICY IF EXISTS "Triggers and RPCs insert audit logs"        ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert admin activity"            ON public.admin_activity;
DROP POLICY IF EXISTS "System can insert failed login attempts"     ON public.failed_login_attempts;
DROP POLICY IF EXISTS "Server inserts background jobs"              ON public.background_jobs;
DROP POLICY IF EXISTS "Server updates background jobs"              ON public.background_jobs;
DROP POLICY IF EXISTS "System can insert abandoned carts"           ON public.abandoned_carts;
DROP POLICY IF EXISTS "System can insert abandoned cart items"      ON public.abandoned_cart_items;

-- staff-only writes (admin panel writes inventory_logs directly with the admin session)
DROP POLICY IF EXISTS "decrement_stock function inserts logs (bypass RLS)" ON public.inventory_logs;
CREATE POLICY "Staff can insert inventory logs" ON public.inventory_logs FOR INSERT WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "Staff can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications" ON public.notifications FOR INSERT WITH CHECK (public.is_staff());

-- secrets that were world-readable
DROP POLICY IF EXISTS "Anyone can select review_tokens" ON public.review_tokens;      -- lets anyone post "verified" reviews
DROP POLICY IF EXISTS "Anyone can read active gift_cards" ON public.gift_cards;       -- exposed every gift card code + balance
CREATE POLICY "Staff can read gift_cards" ON public.gift_cards FOR SELECT USING (public.is_staff());
DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;             -- exposed every private coupon code
CREATE POLICY "Staff can read coupons" ON public.coupons FOR SELECT USING (public.is_staff());

-- users could write reviews straight to the table, bypassing moderation
DROP POLICY IF EXISTS "Customers can create own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Customers can update own pending reviews" ON public.reviews;

-- public blog comments must start unapproved
DROP POLICY IF EXISTS "Allow public INSERT on blog_comments" ON public.blog_comments;
CREATE POLICY "Allow public INSERT on blog_comments" ON public.blog_comments
  FOR INSERT WITH CHECK (approved = false);

-- make PostgREST pick up the new/changed functions immediately
NOTIFY pgrst, 'reload schema';
