-- ============================================================================
-- ANORA — Stripe Refund Module Setup
-- Migration 061: Extra columns for refunds & storage bucket configuration
-- ============================================================================

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS more_info_notes TEXT;

COMMENT ON COLUMN public.refunds.metadata IS 'Metadata to track partial/item-level details';
COMMENT ON COLUMN public.refunds.attachments IS 'Array of file paths uploaded as refund request proofs';

-- Create the refund-attachments storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'refund-attachments',
  'refund-attachments',
  true,
  52428800, -- 50MB
  '{image/jpeg,image/png,image/webp,video/mp4,video/quicktime}'
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for storage bucket
DROP POLICY IF EXISTS "Anyone can read refund attachments" ON storage.objects;
CREATE POLICY "Anyone can read refund attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'refund-attachments');

DROP POLICY IF EXISTS "Users can upload refund attachments" ON storage.objects;
CREATE POLICY "Users can upload refund attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'refund-attachments'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Staff can manage refund attachments" ON storage.objects;
CREATE POLICY "Staff can manage refund attachments"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'refund-attachments'
    AND is_staff()
  );
