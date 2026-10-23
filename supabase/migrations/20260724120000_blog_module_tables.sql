-- Migration: Reusable Blog Module Schema and Policies
-- Date: 2026-07-24

-- 1. blog_authors
CREATE TABLE IF NOT EXISTS public.blog_authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. blog_categories
CREATE TABLE IF NOT EXISTS public.blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. blog_tags
CREATE TABLE IF NOT EXISTS public.blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. blogs (Posts)
DROP TABLE IF EXISTS public.blogs CASCADE;
CREATE TABLE IF NOT EXISTS public.blogs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  excerpt TEXT,
  cover_image TEXT,
  gallery_images TEXT[] NOT NULL DEFAULT '{}',
  author_id UUID REFERENCES public.blog_authors(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.blog_categories(id) ON DELETE SET NULL,
  reading_time INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'scheduled')),
  featured BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta_title TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  canonical_url TEXT
);

-- 5. blog_tag_relation
CREATE TABLE IF NOT EXISTS public.blog_tag_relation (
  blog_id UUID REFERENCES public.blogs(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (blog_id, tag_id)
);

-- 6. blog_views (Optional detailed tracking)
CREATE TABLE IF NOT EXISTS public.blog_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID REFERENCES public.blogs(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. blog_comments (Future-ready)
CREATE TABLE IF NOT EXISTS public.blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_id UUID REFERENCES public.blogs(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON public.blogs(slug);
CREATE INDEX IF NOT EXISTS idx_blogs_category_id ON public.blogs(category_id);
CREATE INDEX IF NOT EXISTS idx_blogs_author_id ON public.blogs(author_id);
CREATE INDEX IF NOT EXISTS idx_blogs_status_published_at ON public.blogs(status, published_at);
CREATE INDEX IF NOT EXISTS idx_blog_tag_relation_tag_id ON public.blog_tag_relation(tag_id);

-- Enable RLS on all tables
ALTER TABLE public.blog_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tag_relation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

-- 1. Policies for blog_authors
CREATE POLICY "Allow public SELECT on blog_authors" ON public.blog_authors
  FOR SELECT USING (true);

CREATE POLICY "Allow staff ALL on blog_authors" ON public.blog_authors
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 2. Policies for blog_categories
CREATE POLICY "Allow public SELECT on blog_categories" ON public.blog_categories
  FOR SELECT USING (true);

CREATE POLICY "Allow staff ALL on blog_categories" ON public.blog_categories
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 3. Policies for blog_tags
CREATE POLICY "Allow public SELECT on blog_tags" ON public.blog_tags
  FOR SELECT USING (true);

CREATE POLICY "Allow staff ALL on blog_tags" ON public.blog_tags
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 4. Policies for blogs
CREATE POLICY "Allow public SELECT on published blogs" ON public.blogs
  FOR SELECT USING (status = 'published' OR (auth.uid() IS NOT NULL AND public.is_staff()));

CREATE POLICY "Allow staff ALL on blogs" ON public.blogs
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 5. Policies for blog_tag_relation
CREATE POLICY "Allow public SELECT on blog_tag_relation" ON public.blog_tag_relation
  FOR SELECT USING (true);

CREATE POLICY "Allow staff ALL on blog_tag_relation" ON public.blog_tag_relation
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- 6. Policies for blog_views
CREATE POLICY "Allow public INSERT on blog_views" ON public.blog_views
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow staff SELECT on blog_views" ON public.blog_views
  FOR SELECT TO authenticated USING (public.is_staff());

-- 7. Policies for blog_comments
CREATE POLICY "Allow public SELECT on approved blog_comments" ON public.blog_comments
  FOR SELECT USING (approved = true OR (auth.uid() IS NOT NULL AND public.is_staff()));

CREATE POLICY "Allow public INSERT on blog_comments" ON public.blog_comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow staff ALL on blog_comments" ON public.blog_comments
  FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ─── SEED INITIAL DATA ───────────────────────────────────────────────────────

-- Seed Authors
INSERT INTO public.blog_authors (id, name, bio)
VALUES ('00000000-0000-0000-0000-000000000001', 'ANORA Atelier', 'Stories from the atelier — craft, material, and the quiet pleasures of dress.')
ON CONFLICT (id) DO NOTHING;

-- Seed Categories
INSERT INTO public.blog_categories (id, name, slug)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'Editorial', 'editorial'),
  ('00000000-0000-0000-0000-000000000003', 'Craft', 'craft'),
  ('00000000-0000-0000-0000-000000000004', 'Material', 'material')
ON CONFLICT (id) DO NOTHING;

-- Seed Tags
INSERT INTO public.blog_tags (id, name, slug)
VALUES
  ('00000000-0000-0000-0000-000000000005', 'Design', 'design'),
  ('00000000-0000-0000-0000-000000000006', 'Atelier', 'atelier'),
  ('00000000-0000-0000-0000-000000000007', 'Mulberry Silk', 'mulberry-silk'),
  ('00000000-0000-0000-0000-000000000008', 'Gold', 'gold')
ON CONFLICT (id) DO NOTHING;

-- Seed Blogs (Static data transformed to DB rows)
INSERT INTO public.blogs (id, title, slug, content, excerpt, cover_image, author_id, category_id, reading_time, status, featured, published_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000009',
    'The Quiet Language of Gold',
    'the-language-of-gold',
    'There is a particular kind of luxury that doesn''t ask to be noticed. It arrives slowly, in the way a piece of jewellery catches the morning light on a bedside table, in the soft sound of a clasp closing at the back of the neck.

Gold has carried meaning for almost as long as we have made meaning. It has been currency, vow, devotion, inheritance. In our atelier, we think of it less as material and more as memory — something poured carefully into the shape of a life.

The Aurelia solitaire began as a single sketch on tracing paper. The Celeste necklace, as a single sentence. Every ANORA piece begins this way: with restraint, with reverence, with the quiet hope that one day it will be worn so often it disappears into a wardrobe and becomes part of someone.',
    'A meditation on why the most precious things we own rarely announce themselves.',
    'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?q=80&w=1000',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    6,
    'published',
    true,
    '2026-03-12T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000010',
    'Inside the Atelier',
    'inside-the-atelier',
    'Light enters our atelier at an angle most rooms never receive. It falls across the cutting tables in long, considered bands, and the day begins.

Every garment we make passes through the same eleven hands. We do not believe in haste. We believe in the time it takes a needle to find the exact right grain of a silk, and in the conversations that happen quietly across a table while it does.

When you receive an ANORA piece, you are also receiving a particular morning of work — a slow, careful morning that is itself a kind of gift.',
    'A morning with the artisans behind our Luxury Pret collection.',
    'https://images.unsplash.com/photo-1558603668-6570496b66f8?q=80&w=1000',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000003',
    8,
    'published',
    false,
    '2026-02-28T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000011',
    'Fabric Stories — Mulberry Silk',
    'fabric-stories-silk',
    'A great silk does not lie still. It moves with the body, catches the room, holds heat in winter and releases it in summer. It feels, against the skin, like very little at all — which is exactly the point.

We source our silks from a single mill in Lyon that has been weaving since 1842. The water there is soft. The looms are old enough to remember a slower kind of luxury.

Caring for a fine silk is its own ritual. Cool water. Gentle hands. The patience to lay it flat in the sun. Done well, a piece will outlast its first owner and find a second.',
    'Why our silks are sourced from a single mill in Lyon.',
    'https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?q=80&w=1000',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000004',
    5,
    'published',
    false,
    '2026-02-04T00:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- Seed Tag Relations
INSERT INTO public.blog_tag_relation (blog_id, tag_id)
VALUES
  ('00000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000008'),
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000006'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000007')
ON CONFLICT (blog_id, tag_id) DO NOTHING;
