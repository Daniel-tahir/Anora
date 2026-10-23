-- Migration 060: Add double Hero CTA button fields to site_settings

ALTER TABLE public.site_settings 
  ADD COLUMN IF NOT EXISTS hero_button_1_text TEXT,
  ADD COLUMN IF NOT EXISTS hero_button_1_link TEXT,
  ADD COLUMN IF NOT EXISTS hero_button_2_text TEXT,
  ADD COLUMN IF NOT EXISTS hero_button_2_link TEXT;

-- Move or populate initial defaults
UPDATE public.site_settings
SET 
  hero_button_1_text = COALESCE(hero_button_1_text, 'Shop Clothing'),
  hero_button_1_link = COALESCE(hero_button_1_link, '/shop/clothing'),
  hero_button_2_text = COALESCE(hero_button_2_text, 'Shop Jewellery'),
  hero_button_2_link = COALESCE(hero_button_2_link, '/shop/jewellery')
WHERE id = 1;
