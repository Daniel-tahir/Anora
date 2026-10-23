-- Migration 059: Auto-calculating Inventory Totals and Triggers
-- Enforces one source of truth for stocks.

-- 1. Helper function to sum values in a JSONB map
CREATE OR REPLACE FUNCTION public.sum_jsonb_values(size_stock JSONB)
RETURNS INT AS $$
DECLARE
  val INT;
  total INT := 0;
  k TEXT;
BEGIN
  IF size_stock IS NULL OR size_stock = '{}'::jsonb THEN
    RETURN 0;
  END IF;
  FOR k IN SELECT jsonb_object_keys(size_stock) LOOP
    val := (size_stock->>k)::INT;
    IF val IS NOT NULL THEN
      total := total + val;
    END IF;
  END LOOP;
  RETURN total;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Trigger function for product variants
CREATE OR REPLACE FUNCTION public.trg_fn_calculate_variant_stock()
RETURNS TRIGGER AS $$
BEGIN
  NEW.stock := public.sum_jsonb_values(NEW.size_stock);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_variant_stock ON public.product_variants;
CREATE TRIGGER trg_calculate_variant_stock
BEFORE INSERT OR UPDATE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_calculate_variant_stock();

-- 3. Trigger function for syncing products stock from variants
CREATE OR REPLACE FUNCTION public.trg_fn_sync_product_stock_from_variants()
RETURNS TRIGGER AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  
  UPDATE public.products
  SET stock = (
    SELECT COALESCE(SUM(stock), 0)
    FROM public.product_variants
    WHERE product_id = v_product_id AND is_active = true
  )
  WHERE id = v_product_id;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_stock_from_variants ON public.product_variants;
CREATE TRIGGER trg_sync_product_stock_from_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_sync_product_stock_from_variants();

-- 4. Trigger function for products (single product stock calculation)
CREATE OR REPLACE FUNCTION public.trg_fn_calculate_product_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = NEW.id) THEN
    NEW.stock := (
      SELECT COALESCE(SUM(stock), 0)
      FROM public.product_variants
      WHERE product_id = NEW.id AND is_active = true
    );
  ELSE
    NEW.stock := public.sum_jsonb_values(NEW.size_stock);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_product_stock ON public.products;
CREATE TRIGGER trg_calculate_product_stock
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_calculate_product_stock();

-- 5. Backfill existing data
UPDATE public.product_variants
SET stock = public.sum_jsonb_values(size_stock);

UPDATE public.products p
SET stock = COALESCE((
  SELECT SUM(stock)
  FROM public.product_variants
  WHERE product_id = p.id AND is_active = true
), public.sum_jsonb_values(size_stock));

-- 6. Re-create get_inventory_management to return sizes, size_stock, colors, and variants
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
            ''is_active'', pv.is_active
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
