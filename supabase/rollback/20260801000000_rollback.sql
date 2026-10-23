-- Rollback for 20260801000000_security_hardening_rpc_and_rls.sql
-- Restores the previous (INSECURE) behaviour. Use only if the hardening breaks a flow you cannot fix forward.
DO $rb$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ia
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc LIKE '%app_private.assert_staff()%'
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s)', r.proname, r.ia);
    EXECUTE format('ALTER FUNCTION app_private.%I(%s) SET SCHEMA public', r.proname, r.ia);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated, service_role', r.proname, r.ia);
  END LOOP;
END $rb$;
-- get_order_details: drop wrapper, restore original
DROP FUNCTION IF EXISTS public.get_order_details(uuid);
ALTER FUNCTION app_private.get_order_details(uuid) SET SCHEMA public;
GRANT EXECUTE ON FUNCTION public.get_order_details(uuid) TO anon, authenticated, service_role;
-- previously server-only functions: re-open (only if you really must)
DO $rb2$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ia FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prosecdef AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
             AND has_function_privilege('service_role', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', r.proname, r.ia);
  END LOOP;
END $rb2$;
-- policies: recreate the originals
CREATE POLICY "Users can create own orders" ON public.orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pending orders" ON public.orders FOR UPDATE
  USING ((auth.uid() = user_id) OR public.is_staff())
  WITH CHECK (((auth.uid() = user_id) AND status IN ('pending','confirmed')) OR public.is_staff());
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
CREATE POLICY "Anyone can select review_tokens" ON public.review_tokens FOR SELECT USING (true);
DROP POLICY IF EXISTS "Staff can read gift_cards" ON public.gift_cards;
CREATE POLICY "Anyone can read active gift_cards" ON public.gift_cards FOR SELECT
  USING ((status = 'active' AND (expires_at IS NULL OR expires_at > now())) OR auth.uid() = created_by OR public.is_staff());
DROP POLICY IF EXISTS "Staff can read coupons" ON public.coupons;
CREATE POLICY "Anyone can read active coupons" ON public.coupons FOR SELECT
  USING ((is_active AND (starts_at IS NULL OR starts_at <= now()) AND (expires_at IS NULL OR expires_at > now())) OR public.is_staff());
