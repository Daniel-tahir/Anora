-- REDEFINE create_category
CREATE OR REPLACE FUNCTION public.create_category(
  p_name        TEXT,
  p_slug        TEXT,
  p_parent_id   UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_image_url   TEXT DEFAULT NULL,
  p_sort_order  INT DEFAULT 0,
  p_is_active   BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = p_slug) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this slug already exists');
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE name = p_name) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists');
  END IF;

  INSERT INTO public.categories (name, slug, parent_id, description, image_url, sort_order, is_active)
  VALUES (p_name, p_slug, p_parent_id, p_description, p_image_url, p_sort_order, p_is_active)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

-- REDEFINE update_category
CREATE OR REPLACE FUNCTION public.update_category(
  p_id          UUID,
  p_name        TEXT,
  p_slug        TEXT,
  p_parent_id   UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_image_url   TEXT DEFAULT NULL,
  p_sort_order  INT DEFAULT 0,
  p_is_active   BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.categories WHERE slug = p_slug AND id != p_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this slug already exists');
  END IF;
  IF EXISTS (SELECT 1 FROM public.categories WHERE name = p_name AND id != p_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'A category with this name already exists');
  END IF;

  UPDATE public.categories
  SET name = p_name, slug = p_slug, parent_id = p_parent_id, description = p_description,
      image_url = p_image_url, sort_order = p_sort_order, is_active = p_is_active,
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- REDEFINE get_parent_categories
CREATE OR REPLACE FUNCTION public.get_parent_categories()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
    ORDER BY c.sort_order, c.name
  ), '[]'::jsonb)
  FROM public.categories c
  WHERE c.is_active = true;
$$;

-- REDEFINE get_products_by_category_slug with recursive category tree search
CREATE OR REPLACE FUNCTION public.get_products_by_category_slug(
  p_slug       TEXT,
  p_page       INT DEFAULT 1,
  p_page_size  INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE category_tree AS (
    SELECT id, parent_id 
    FROM public.categories 
    WHERE slug = p_slug AND is_active = true
    
    UNION ALL
    
    SELECT c.id, c.parent_id
    FROM public.categories c
    JOIN category_tree ct ON c.parent_id = ct.id
    WHERE c.is_active = true
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'slug', p.slug,
      'price', p.price,
      'compare_price', p.compare_price,
      'description', p.description,
      'badge', p.badge,
      'is_active', p.is_active,
      'created_at', p.created_at,
      'category_slug', c.slug,
      'category_name', c.name,
      'category_id', c.id,
      'sizes', p.sizes,
      'sku', p.sku,
      'stock', p.stock,
      'size_stock', p.size_stock,
      'color', p.color,
      'sale_active', p.sale_active,
      'discount_percent', p.discount_percent,
      'images', COALESCE(
        (SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order)
         FROM public.product_images pi
         WHERE pi.product_id = p.id),
        '[]'::jsonb
      )
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  FROM public.products p
  JOIN public.categories c ON c.id = p.category_id
  WHERE c.id IN (SELECT id FROM category_tree) AND p.is_active = true;
$$;

-- REDEFINE get_active_categories as flat active categories query
CREATE OR REPLACE FUNCTION public.get_active_categories()
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'description', c.description,
      'image_url', c.image_url,
      'sort_order', c.sort_order,
      'parent_id', c.parent_id,
      'product_count', (SELECT COUNT(*) FROM public.products p WHERE p.category_id = c.id AND p.is_active = true)
    ) ORDER BY c.sort_order, c.name
  ), '[]'::jsonb)
  FROM public.categories c
  WHERE c.is_active = true;
$$;
