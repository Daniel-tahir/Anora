-- Migration 054: Fix get_product_by_slug images return type

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

GRANT EXECUTE ON FUNCTION public.get_product_by_slug TO anon, authenticated;
