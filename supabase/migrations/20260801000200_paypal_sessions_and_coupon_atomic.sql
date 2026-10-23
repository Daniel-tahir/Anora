-- Server-side record of what a PayPal checkout was FOR (validated items, prices, addresses).
-- Lets the verified PayPal webhook create the order even if the customer's browser never returns.
CREATE TABLE IF NOT EXISTS public.paypal_checkout_sessions (
  paypal_order_id  text PRIMARY KEY,
  user_id          uuid,
  email            text NOT NULL,
  items            jsonb NOT NULL,
  shipping_address jsonb NOT NULL,
  billing_address  jsonb,
  payment_method   text NOT NULL DEFAULT 'paypal',
  coupon_code      text,
  discount_amount  numeric NOT NULL DEFAULT 0,
  total_cents      integer NOT NULL CHECK (total_cents >= 0),
  created_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.paypal_checkout_sessions ENABLE ROW LEVEL SECURITY;  -- no policies: service_role only
REVOKE ALL ON public.paypal_checkout_sessions FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_paypal_checkout_sessions_created ON public.paypal_checkout_sessions (created_at);

-- Atomic coupon redemption: no lost updates, and max_uses can never be exceeded by the counter.
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.coupons
     SET used_count = coalesce(used_count, 0) + 1
   WHERE code = upper(p_code)
     AND is_active
     AND (max_uses IS NULL OR coalesce(used_count, 0) < max_uses)
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.increment_coupon_usage(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Guest tracking ids were 8 chars (~40 bits) from random(), and get_order_by_tracking_id is public.
-- New ids: 16 hex chars (64 bits) from the CSPRNG behind gen_random_uuid(). Existing ids keep working.
CREATE OR REPLACE FUNCTION public.generate_unique_tracking_id()
RETURNS text LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id text;
BEGIN
  LOOP
    v_id := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE tracking_id = v_id) THEN
      RETURN v_id;
    END IF;
  END LOOP;
END;
$$;
