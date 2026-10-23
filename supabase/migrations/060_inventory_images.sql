-- Migration 060: Include images in get_inventory_management RPC

DROP FUNCTION IF EXISTS public.get_inventory_management(integer, integer, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.get_inventory_management(
  p_page         INT DEFAULT 1,
  p_page_size    INT DEFAULT 20,
  p_sort_by      TEXT DEFAULT 'name',
  p_sort_dir     TEXT DEFAULT 'asc',
  p_search       TEXT DEFAULT NULL,
  p_stock_status TEXT DEFAULT NULL,
  p_category_id  UUID DEFAULT NULL
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

  v_offset := (p_page - 1) * p_page_size;

  -- Build filters
  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(' AND (p.name ILIKE %L OR p.sku ILIKE %L)', '%' || p_search || '%', '%' || p_search || '%');
  END IF;
  IF p_stock_status = 'low' THEN
    v_where := v_where || ' AND p.stock > 0 AND p.stock <= 10';
  ELSIF p_stock_status = 'out' THEN
    v_where := v_where || ' AND p.stock = 0';
  ELSIF p_stock_status = 'overstock' THEN
    v_where := v_where || ' AND p.stock > 100';
  END IF;
  IF p_category_id IS NOT NULL THEN
    v_where := v_where || format(' AND p.category_id = %L', p_category_id);
  END IF;

  v_order := CASE p_sort_by
    WHEN 'stock' THEN 'p.stock'
    WHEN 'updated_at' THEN 'p.updated_at'
    WHEN 'category' THEN 'c.name'
    ELSE 'p.name'
  END;
  v_order := v_order || CASE WHEN p_sort_dir = 'desc' THEN ' DESC' ELSE ' ASC' END;

  EXECUTE format(
    'SELECT jsonb_build_object(
      ''total'', (SELECT COUNT(*) FROM public.products p %s),
      ''products'', COALESCE(jsonb_agg(sub), ''[]''::jsonb)
    )
    FROM (
      SELECT
        p.id, p.name, p.sku, p.stock, p.is_active, p.updated_at,
        p.sizes, p.size_stock, p.colors,
        COALESCE(
          (SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order) FROM public.product_images pi WHERE pi.product_id = p.id AND pi.variant_id IS NULL),
          ''[]''::jsonb
        ) AS images,
        COALESCE(c.name, ''Uncategorized'') AS category_name,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            ''id'', pv.id,
            ''product_id'', pv.product_id,
            ''name'', pv.name,
            ''sku'', pv.sku,
            ''price'', pv.price,
            ''stock'', pv.stock,
            ''sizes'', pv.sizes,
            ''size_stock'', pv.size_stock,
            ''color_hex'', pv.color_hex,
            ''is_active'', pv.is_active,
            ''images'', COALESCE(
              (SELECT jsonb_agg(pvi.image_url ORDER BY pvi.sort_order) FROM public.product_images pvi WHERE pvi.variant_id = pv.id),
              ''[]''::jsonb
            )
          ) ORDER BY pv.sort_order ASC)
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
        ), ''[]''::jsonb) AS variants
      FROM public.products p
      LEFT JOIN public.categories c ON c.id = p.category_id
      %s
      ORDER BY %s
      LIMIT %s OFFSET %s
    ) sub',
    v_where, v_where, v_order, p_page_size, v_offset
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inventory_management TO authenticated;
