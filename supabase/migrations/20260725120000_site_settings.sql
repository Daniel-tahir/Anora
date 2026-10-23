-- Migration 059: Site Settings Table and RLS Policies

CREATE TABLE IF NOT EXISTS public.site_settings (
  id INT PRIMARY KEY DEFAULT 1,
  hero_image TEXT,
  hero_heading TEXT,
  hero_sub_heading TEXT,
  hero_button_text TEXT,
  hero_button_link TEXT,
  announcement_enabled BOOLEAN NOT NULL DEFAULT false,
  announcement_text TEXT,
  announcement_button_text TEXT,
  announcement_button_link TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  whatsapp_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  logo TEXT,
  favicon TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default settings row if not present
INSERT INTO public.site_settings (
  id, hero_image, hero_heading, hero_sub_heading, hero_button_text, hero_button_link,
  announcement_enabled, announcement_text, announcement_button_text, announcement_button_link,
  instagram_url, facebook_url, whatsapp_url, phone, email, address, logo, favicon
) VALUES (
  1,
  NULL, -- Fallback image
  'A STUDY IN SILK & GOLD',
  '慢裁剪 — slow tailored ceremonial dress and hand-finished 18k jewellery.',
  'THE COLLECTION',
  '/shop',
  true,
  'Complimentary shipping on orders over $500.',
  'Shop New',
  '/shop',
  'https://instagram.com',
  'https://facebook.com',
  'https://whatsapp.com',
  '+1 (234) 567-890',
  'atelier@anora.com',
  'Atelier ANORA, Paris',
  NULL,
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Select policy (everyone)
DROP POLICY IF EXISTS "Allow public read access to site_settings" ON public.site_settings;
CREATE POLICY "Allow public read access to site_settings"
  ON public.site_settings FOR SELECT
  USING (true);

-- Write policies (admin only)
DROP POLICY IF EXISTS "Allow admin write access to site_settings" ON public.site_settings;
CREATE POLICY "Allow admin write access to site_settings"
  ON public.site_settings FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
