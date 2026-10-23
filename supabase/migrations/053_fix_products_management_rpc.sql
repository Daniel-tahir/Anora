-- Migration 053: Fix get_products_management RPC jsonb return structure

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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied for role admin';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.get_products_management TO authenticated;
