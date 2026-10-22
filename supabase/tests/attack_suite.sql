\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
CREATE TEMP TABLE IF NOT EXISTS _r(test text, who text, outcome text);
CREATE OR REPLACE FUNCTION pg_temp.try(t text, who text, sql text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', CASE who WHEN 'anon' THEN '' WHEN 'admin' THEN '11111111-1111-1111-1111-111111111111' WHEN 'alice' THEN '22222222-2222-2222-2222-222222222222' WHEN 'mallory' THEN '33333333-3333-3333-3333-333333333333' ELSE '' END, true);
  PERFORM set_config('request.jwt.claim.role', CASE who WHEN 'anon' THEN 'anon' WHEN 'service' THEN 'service_role' ELSE 'authenticated' END, true);
  EXECUTE 'SET LOCAL ROLE ' || CASE who WHEN 'anon' THEN 'anon' WHEN 'service' THEN 'service_role' ELSE 'authenticated' END;
  BEGIN
    EXECUTE sql INTO r;
    RESET ROLE;
    IF r ~ '"success": false' OR r = '0' OR r IS NULL AND t LIKE 'C%' THEN
      INSERT INTO _r VALUES (t, who, 'denied: (functional) '||left(coalesce(r,'null'),50));
    ELSE
      INSERT INTO _r VALUES (t, who, 'ALLOWED: '||left(coalesce(r,'null'),70));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO _r VALUES (t, who, 'denied: '||left(SQLERRM,60));
  END;
END $$;
GRANT ALL ON _r TO PUBLIC;
-- C-1 fake paid order
SELECT pg_temp.try('C1 create_order_from_payment($0.01)','anon',$q$select create_order_from_payment(NULL,'ANR-HACK',0.01,0.01,'{}','{}','','pi_fake','card','usd',0.01,'INV-HACK','[{"product_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","variant_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","size":"M","quantity":1,"price":0.01,"name":"x"}]')$q$);
SELECT pg_temp.try('C1 create_order_from_payment($0.01)','mallory',$q$select create_order_from_payment(NULL,'ANR-HACK2',0.01,0.01,'{}','{}','','pi_fake2','card','usd',0.01,'INV-HACK2','[{"product_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","variant_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","size":"M","quantity":1,"price":0.01,"name":"x"}]')$q$);
SELECT pg_temp.try('C3 get_order_details(alice order)','anon',$q$select (get_order_details('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->'order'->'customer'->>'email'$q$);
SELECT pg_temp.try('C3 get_order_details(alice order)','mallory',$q$select (get_order_details('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->'order'->'customer'->>'email'$q$);
SELECT pg_temp.try('C3 update_order_status(shipped)','mallory',$q$select update_order_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','shipped','x')::text$q$);
SELECT pg_temp.try('C3 adjust_stock(0)','mallory',$q$select adjust_stock('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',0,'x')::text$q$);
SELECT pg_temp.try('C3 cancel_order as "staff"','mallory',$q$select cancel_order('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x','staff')::text$q$);
SELECT pg_temp.try('C3 request_refund (no owner)','anon',$q$select request_refund('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x')::text$q$);
SELECT pg_temp.try('C3 create_return_request','mallory',$q$select create_return_request('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x')::text$q$);
SELECT pg_temp.try('C3 get_customers_management (PII)','anon',$q$select get_customers_management(1,5,'','created_at','desc','all','all')::text$q$);
SELECT pg_temp.try('C3 get_revenue_report','mallory',$q$select get_revenue_report(current_date-30,current_date)::text$q$);
SELECT pg_temp.try('C3 delete_coupon','anon',$q$select delete_coupon(gen_random_uuid())::text$q$);
SELECT pg_temp.try('C3 create_gift_card($9999)','mallory',$q$select create_gift_card(9999,NULL,'x')::text$q$);
SELECT pg_temp.try('C3 generate_invoice','mallory',$q$select generate_invoice('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text$q$);
SELECT pg_temp.try('C3 update_invoice_status(paid)','anon',$q$select update_invoice_status(gen_random_uuid(),'paid')::text$q$);
SELECT pg_temp.try('C6 read device_sessions','anon',$q$select count(*)::text from device_sessions$q$);
SELECT pg_temp.try('C6 forge audit_logs','anon',$q$with i as (insert into audit_logs(action,entity_type) values ('forged','x') returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 forge notification','anon',$q$with i as (insert into notifications(user_id,title,message) values ('22222222-2222-2222-2222-222222222222','t','m') returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 read orders table','mallory',$q$select count(*)::text from orders$q$);
SELECT pg_temp.try('C6 self-promote admin_roles','mallory',$q$with i as (insert into admin_roles(user_id,role) values ('33333333-3333-3333-3333-333333333333','admin') returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 self-update profiles.role','mallory',$q$with u as (update profiles set role='admin' where id='33333333-3333-3333-3333-333333333333' returning 1) select count(*)::text from u$q$);
SELECT pg_temp.try('C6 redeem_gift_card','mallory',$q$select redeem_gift_card(gen_random_uuid(),1)::text$q$);
-- sanity: legit flows
SELECT pg_temp.try('OK admin get_review_stats','admin',$q$select left(get_review_stats()::text,30)$q$);
SELECT pg_temp.try('OK admin update_order_status','admin',$q$select update_order_status('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','processing','x')::text$q$);
SELECT pg_temp.try('OK alice get_order_details own','alice',$q$select (get_order_details('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->'order'->'customer'->>'email'$q$);
SELECT pg_temp.try('OK service create_order_from_payment','service',$q$select create_order_from_payment(NULL,'ANR-SVC',100,100,'{}','{}','','pi_svc','card','usd',100,'INV-SVC','[{"product_id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","variant_id":"dddddddd-dddd-dddd-dddd-dddddddddddd","size":"M","quantity":1,"price":100,"name":"Test Dress"}]')::text$q$);
SELECT pg_temp.try('OK service get_admin_dashboard_stats','service',$q$select left(get_admin_dashboard_stats()::text,30)$q$);
SELECT pg_temp.try('OK service next_order_number','service',$q$select next_order_number()$q$);
SELECT pg_temp.try('OK service get_pending_jobs','service',$q$select count(*)::text from get_pending_jobs(5)$q$);
SELECT pg_temp.try('OK alice cancel own order','alice',$q$select cancel_order('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','changed mind','customer')::text$q$);
SELECT pg_temp.try('OK anon catalog get_product_by_slug','anon',$q$select left(get_product_by_slug('test-dress')::text,30)$q$);
SELECT pg_temp.try('OK anon get_active_categories','anon',$q$select count(*)::text from get_active_categories()$q$);
SELECT pg_temp.try('OK anon has_admin_role','anon',$q$select has_admin_role('admin')::text$q$);
SELECT pg_temp.try('OK anon tracking by number+email','anon',$q$select left(coalesce(get_order_by_tracking('ANR-T1','alice@t.com')::text,'null'),30)$q$);
SELECT pg_temp.try('OK anon check_login_lockout','anon',$q$select check_login_lockout('a@b.com')::text$q$);
SELECT pg_temp.try('OK admin record_admin_activity','admin',$q$select record_admin_activity('test')::text$q$);
SELECT pg_temp.try('C3 bulk_delete_products','anon',$q$select bulk_delete_products(ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']::uuid[])::text$q$);

SELECT pg_temp.try('C6 insert order row directly','mallory',$q$with i as (insert into orders(user_id,email,order_number,subtotal,total,payment_status,status) values ('33333333-3333-3333-3333-333333333333','m@t.com','ANR-DIRECT',1,1,'completed','confirmed') returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 tamper own order total','alice',$q$with u as (update orders set total=0.01 where id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1) select count(*)::text from u$q$);
SELECT pg_temp.try('C6 list gift card codes','anon',$q$select count(*)::text from gift_cards$q$);
SELECT pg_temp.try('C6 list coupon codes','anon',$q$select count(*)::text from coupons$q$);
SELECT pg_temp.try('C6 read review_tokens','anon',$q$select count(*)::text from review_tokens$q$);
SELECT pg_temp.try('C6 pre-approved blog comment','anon',$q$with i as (insert into blog_comments(blog_id,author_name,content,approved) select id,'x','spam',true from blogs limit 1 returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 write review directly','mallory',$q$with i as (insert into reviews(product_id,user_id,rating,status) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','33333333-3333-3333-3333-333333333333',5,'approved') returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('C6 pause background_jobs','anon',$q$with u as (update background_jobs set status='completed' returning 1) select count(*)::text from u$q$);
SELECT pg_temp.try('OK admin reads gift_cards','admin',$q$select count(*)::text from gift_cards$q$);
SELECT pg_temp.try('OK admin reads coupons','admin',$q$select count(*)::text from coupons$q$);
SELECT pg_temp.try('OK admin inventory_logs insert (panel)','admin',$q$with i as (insert into inventory_logs(product_id,change_type,quantity_change,quantity_after) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','adjustment',1,1) returning 1) select count(*)::text from i$q$);
SELECT pg_temp.try('OK admin get_order_details has internal_notes key','admin',$q$select ((get_order_details('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->'order') ? 'internal_notes'$q$);
SELECT pg_temp.try('OK alice details hides internal_notes','alice',$q$select ((get_order_details('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'))->'order') ? 'internal_notes'$q$);
SELECT pg_temp.try('OK anon sees GUEST order via uuid','anon',$q$select (get_order_details('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'))->'order'->>'order_number'$q$);
SELECT pg_temp.try('OK alice request_refund own (not delivered => functional)','alice',$q$select request_refund('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','x')::text$q$);
SELECT test || ' [' || who || '] -> ' || outcome FROM _r;
