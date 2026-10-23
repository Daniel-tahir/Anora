INSERT INTO public.orders(id,user_id,email,order_number,subtotal,total,payment_status,status,shipping_address,billing_address,internal_notes)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',NULL,'guest@t.com','ANR-GUEST',50,50,'completed','confirmed','{"firstName":"Guest"}','{}','secret staff note') ON CONFLICT DO NOTHING;
UPDATE public.orders SET internal_notes='secret staff note' WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.blogs(id,title,slug,status) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff','T','t','published') ON CONFLICT DO NOTHING;
INSERT INTO public.coupons(code,discount_type,discount_value,max_uses,used_count,is_active) VALUES ('ONCE','fixed',5,2,0,true) ON CONFLICT DO NOTHING;
