-- Migration 052: Add product sale fields and update RPCs

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sale_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS discount_percent INT NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100);

-- Update get_products_by_category_slug
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
  WITH target_ids AS (
    SELECT id FROM public.categories WHERE slug = p_slug AND is_active = true
    UNION
    SELECT ch.id FROM public.categories ch JOIN public.categories p ON p.id = ch.parent_id WHERE p.slug = p_slug AND ch.is_active = true
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
  WHERE c.id IN (SELECT id FROM target_ids) AND p.is_active = true;
$$;

-- Update get_products_by_category_and_subcategory
CREATE OR REPLACE FUNCTION public.get_products_by_category_and_subcategory(
  p_category_slug     TEXT,
  p_subcategory_slug  TEXT,
  p_page              INT DEFAULT 1,
  p_page_size         INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
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
  JOIN public.categories pc ON pc.id = c.parent_id
  WHERE c.slug = p_subcategory_slug
    AND pc.slug = p_category_slug
    AND p.is_active = true;
$$;

-- Update get_product_by_slug
CREATE OR REPLACE FUNCTION public.get_product_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_product JSONB;
  v_images JSONB;
  v_category JSONB;
  v_parent_category JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'sku', p.sku,
    'description', p.description,
    'short_description', p.short_description,
    'price', p.price,
    'compare_price', p.compare_price,
    'stock', p.stock,
    'low_stock_threshold', p.low_stock_threshold,
    'sizes', p.sizes,
    'size_stock', COALESCE(p.size_stock, '{}'::jsonb),
    'colors', COALESCE(p.colors, '[]'::jsonb),
    'fabric', p.fabric,
    'material', p.material,
    'badge', p.badge,
    'is_new', p.is_new,
    'is_best_seller', p.is_best_seller,
    'featured', p.featured,
    'is_active', p.is_active,
    'status', p.status,
    'sale_active', p.sale_active,
    'discount_percent', p.discount_percent,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_product
  FROM public.products p
  WHERE p.slug = p_slug AND p.is_active = true;

  IF v_product IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'image_url', pi.image_url,
      'alt_text', pi.alt_text,
      'sort_order', pi.sort_order
    ) ORDER BY pi.sort_order, pi.created_at
  ), '[]'::jsonb)
  INTO v_images
  FROM public.product_images pi
  WHERE pi.product_id = (v_product->>'id')::UUID;

  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
  INTO v_category
  FROM public.categories c
  WHERE c.id = (v_product->>'category_id')::UUID;

  SELECT jsonb_build_object('id', pc.id, 'name', pc.name, 'slug', pc.slug)
  INTO v_parent_category
  FROM public.categories c
  JOIN public.categories pc ON pc.id = c.parent_id
  WHERE c.id = (v_product->>'category_id')::UUID;

  RETURN jsonb_build_object(
    'product', v_product,
    'images', v_images,
    'category', v_category,
    'parent_category', v_parent_category
  );
END;
$$;

-- Update get_admin_product
CREATE OR REPLACE FUNCTION public.get_admin_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product JSONB;
  v_images JSONB;
BEGIN
  PERFORM public.require_admin();

  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'sku', p.sku,
    'description', p.description,
    'short_description', p.short_description,
    'price', p.price,
    'compare_price', p.compare_price,
    'stock', p.stock,
    'low_stock_threshold', p.low_stock_threshold,
    'sizes', p.sizes,
    'size_stock', COALESCE(p.size_stock, '{}'::jsonb),
    'colors', COALESCE(p.colors, '[]'::jsonb),
    'fabric', p.fabric,
    'material', p.material,
    'badge', p.badge,
    'is_new', p.is_new,
    'is_best_seller', p.is_best_seller,
    'featured', p.featured,
    'is_active', p.is_active,
    'status', p.status,
    'category_id', p.category_id,
    'sale_active', p.sale_active,
    'discount_percent', p.discount_percent,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_product
  FROM public.products p
  WHERE p.id = p_product_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pi.id,
      'image_url', pi.image_url,
      'alt_text', pi.alt_text,
      'sort_order', pi.sort_order
    ) ORDER BY pi.sort_order, pi.created_at
  ), '[]'::jsonb)
  INTO v_images
  FROM public.product_images pi
  WHERE pi.product_id = p_product_id;

  RETURN jsonb_build_object(
    'product', v_product,
    'images', v_images
  );
END;
$$;

-- Update get_products_management
CREATE OR REPLACE FUNCTION public.get_products_management(
  p_page         INT DEFAULT 1,
  p_page_size    INT DEFAULT 20,
  p_sort_by      TEXT DEFAULT 'created_at',
  p_sort_dir     TEXT DEFAULT 'desc',
  p_search       TEXT DEFAULT NULL,
  p_status       TEXT DEFAULT NULL,
  p_category_id  UUID DEFAULT NULL,
  p_stock_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_offset INT;
  v_total  INT;
  v_result JSONB;
  v_order  TEXT;
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  PERFORM public.require_admin();

  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.name ILIKE %L OR p.sku ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%');
  END IF;

  IF p_status IS NOT NULL AND p_status != '' THEN
    IF p_status = 'out_of_stock' THEN
      v_where := v_where || ' AND p.stock = 0';
    ELSE
      v_where := v_where || format(' AND p.status = %L', p_status);
    END IF;
  END IF;

  IF p_category_id IS NOT NULL THEN
    v_where := v_where || format(' AND p.category_id = %L', p_category_id);
  END IF;

  IF p_stock_status IS NOT NULL AND p_stock_status != '' THEN
    IF p_stock_status = 'in_stock' THEN
      v_where := v_where || ' AND p.stock > 0';
    ELSIF p_stock_status = 'low_stock' THEN
      v_where := v_where || ' AND p.stock > 0 AND p.stock <= p.low_stock_threshold';
    ELSIF p_stock_status = 'out_of_stock' THEN
      v_where := v_where || ' AND p.stock = 0';
    END IF;
  END IF;

  v_order := CASE p_sort_by
    WHEN 'name' THEN 'p.name'
    WHEN 'sku' THEN 'p.sku'
    WHEN 'price' THEN 'p.price'
    WHEN 'stock' THEN 'p.stock'
    WHEN 'status' THEN 'p.status'
    WHEN 'category_name' THEN 'c.name'
    WHEN 'created_at' THEN 'p.created_at'
    ELSE 'p.created_at'
  END;
  v_order := v_order || CASE WHEN p_sort_dir = 'desc' THEN ' DESC NULLS LAST' ELSE ' ASC NULLS LAST' END;

  EXECUTE format(
    'SELECT jsonb_build_object(
      ''total'', (SELECT COUNT(*) FROM public.products p %s),
      ''products'', COALESCE(
        (SELECT jsonb_agg(item) FROM (
          SELECT jsonb_build_object(
            ''id'', p.id,
            ''name'', p.name,
            ''sku'', p.sku,
            ''price'', p.price,
            ''compare_price'', p.compare_price,
            ''stock'', p.stock,
            ''status'', p.status,
            ''is_active'', p.is_active,
            ''sale_active'', p.sale_active,
            ''discount_percent'', p.discount_percent,
            ''created_at'', p.created_at,
            ''updated_at'', p.updated_at,
            ''category_name'', COALESCE(c.name, ''—''),
            ''category_id'', p.category_id,
            ''subcategory_name'', COALESCE(c.name, ''—''),
            ''thumbnail'', (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.created_at LIMIT 1)
          ) AS item
          FROM public.products p
          LEFT JOIN public.categories c ON c.id = p.category_id
          %s
          ORDER BY %s
          OFFSET %L LIMIT %L
        ) sub),
        ''[]''::jsonb
      )
    )',
    v_where, v_where, v_order, v_offset, p_page_size
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_products_by_category_slug TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_products_by_category_and_subcategory TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_product_by_slug TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_products_management TO authenticated;
