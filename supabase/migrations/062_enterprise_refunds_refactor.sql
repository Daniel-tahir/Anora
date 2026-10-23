-- ============================================================================
-- ANORA — Enterprise Refund Module Refactor
-- Migration 062: Schema, RLS, storage and indexes optimization
-- ============================================================================

-- 1. Update refunds table status check constraint
ALTER TABLE public.refunds
  DROP CONSTRAINT IF EXISTS refunds_status_check;

ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_status_check CHECK (status IN (
    'pending', 'approved', 'awaiting_return', 'received', 'inspection_passed', 'processing', 'completed', 'rejected'
  ));

-- 2. Add composite partial unique index to prevent duplicate active refund requests per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_active_unique ON public.refunds (order_id)
  WHERE (status IN ('pending', 'approved', 'awaiting_return', 'received', 'inspection_passed', 'processing'));

-- 3. RLS policy to allow customers to read their own refunds
DROP POLICY IF EXISTS "Users can read own refunds" ON public.refunds;
CREATE POLICY "Users can read own refunds" ON public.refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = refunds.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- 4. Secure the refund attachments storage uploads to validate order ownership
DROP POLICY IF EXISTS "Users can upload refund attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own order refund attachments" ON storage.objects;

CREATE POLICY "Users can upload own order refund attachments" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'refund-attachments'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id::text = (storage.foldername(name))[1]
      AND orders.user_id = auth.uid()
    )
  );

-- 5. Add Gin indexes on JSONB stock mappings
CREATE INDEX IF NOT EXISTS idx_products_size_stock_gin ON public.products USING gin (size_stock);
CREATE INDEX IF NOT EXISTS idx_product_variants_size_stock_gin ON public.product_variants USING gin (size_stock);
