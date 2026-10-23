-- Add paypal_order_id column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paypal_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON public.orders(paypal_order_id);
