\pset format unaligned
\pset tuples_only on
SET ROLE service_role;
SELECT 'coupon uses: '||public.increment_coupon_usage('once')||','||public.increment_coupon_usage('ONCE')||','||public.increment_coupon_usage('once')||' (limit 2 -> expect true,true,false)';
SELECT 'used_count='||used_count FROM public.coupons WHERE code='ONCE';
INSERT INTO public.paypal_checkout_sessions(paypal_order_id,email,items,shipping_address,total_cents) VALUES ('ORD12345','a@b.c','[]','{}',1000);
SELECT 'service can read session: '||count(*) FROM public.paypal_checkout_sessions;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN PERFORM count(*) FROM public.paypal_checkout_sessions; RAISE NOTICE 'B2 anon read sessions: ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B2 anon read sessions: denied (good)'; END $$;
DO $$ BEGIN PERFORM public.increment_coupon_usage('ONCE'); RAISE NOTICE 'B2 anon increment coupon: ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B2 anon increment coupon: denied (good)'; END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN PERFORM count(*) FROM public.paypal_checkout_sessions; RAISE NOTICE 'B2 customer read sessions: ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B2 customer read sessions: denied (good)'; END $$;
DO $$ BEGIN INSERT INTO public.paypal_checkout_sessions(paypal_order_id,email,items,shipping_address,total_cents) VALUES ('FAKE1','x@y.z','[]','{}',1); RAISE NOTICE 'B2 customer forge session: ALLOWED (BAD)'; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B2 customer forge session: denied (good)'; END $$;
