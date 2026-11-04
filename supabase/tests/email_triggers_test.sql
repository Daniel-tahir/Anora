\pset format unaligned
\pset tuples_only on
INSERT INTO auth.users(id,email) VALUES ('22222222-2222-2222-2222-222222222222','alice@t.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles(id,email,first_name,last_name) VALUES ('22222222-2222-2222-2222-222222222222','alice@t.com','Alice','A') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.orders(id,user_id,email,order_number,subtotal,total,payment_status,status,shipping_address,billing_address)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','alice@t.com','ANR-T1',100,100,'completed','confirmed','{"firstName":"Alice"}','{}') ON CONFLICT DO NOTHING;
INSERT INTO public.orders(id,email,order_number,subtotal,total,payment_status,status,shipping_address,billing_address)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','guest@t.com','ANR-G1',50,50,'completed','confirmed','{"firstName":"Guest"}','{}') ON CONFLICT DO NOTHING;
DELETE FROM public.background_jobs;
UPDATE public.orders SET status='shipped' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.orders SET status='shipped' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.orders SET status='delivered' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.orders SET status='cancelled' WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
UPDATE public.orders SET status='processing' WHERE id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT 'EMAILJOBS order status jobs: '||count(*)||' [expect 3: shipped, delivered, cancelled; no duplicate for repeated shipped, none for processing]' FROM public.background_jobs WHERE job_type='send_order_status_email';
SELECT 'EMAILJOBS statuses: '||string_agg(payload->>'status', ',' ORDER BY payload->>'status') FROM public.background_jobs WHERE job_type='send_order_status_email';
SET ROLE anon;
INSERT INTO public.contact_messages(name,email,message) VALUES ('A','a@b.c','hello');
INSERT INTO public.newsletters(email,source) VALUES ('n@x.com','homepage');
RESET ROLE;
SELECT 'EMAILJOBS contact jobs: '||count(*)||' [expect 1]' FROM public.background_jobs WHERE job_type='send_contact_emails';
SELECT 'EMAILJOBS newsletter jobs: '||count(*)||' [expect 1]' FROM public.background_jobs WHERE job_type='send_newsletter_welcome';
SELECT 'EMAILJOBS unsubscribe token set: '||(unsubscribe_token IS NOT NULL) FROM public.newsletters WHERE email='n@x.com';
SET ROLE service_role;
SELECT 'EMAILJOBS get_pending_jobs returns: '||count(*)||' [expect 5 new email jobs]' FROM jsonb_array_elements(public.get_pending_jobs(50)) j WHERE j->>'job_type' IN ('send_order_status_email','send_contact_emails','send_newsletter_welcome');
RESET ROLE;
SET ROLE anon;
DO $$ DECLARE n int; BEGIN SELECT count(*) INTO n FROM public.background_jobs; RAISE NOTICE 'EMAILJOBS anon sees % job rows [expect 0]', n; END $$;
DO $$ DECLARE n int; BEGIN SELECT count(*) INTO n FROM public.newsletters; RAISE NOTICE 'EMAILJOBS anon sees % subscriber rows incl. tokens [expect 0]', n; END $$;
RESET ROLE;
