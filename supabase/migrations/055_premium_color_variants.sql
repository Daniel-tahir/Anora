-- Migration 055: Premium Color Variant System
-- Add sizes, size_stock, compare_price, and color_hex to product_variants.
-- Add variant_id to product_images.
-- Add variant_id to wishlists.

ALTER TABLE public.product_variants
ADD COLUMN IF NOT EXISTS color_hex TEXT,
ADD COLUMN IF NOT EXISTS sizes TEXT[],
ADD COLUMN IF NOT EXISTS size_stock JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS compare_price NUMERIC(10,2) CHECK (compare_price IS NULL OR compare_price >= 0);

ALTER TABLE public.product_images
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE;

ALTER TABLE public.wishlists
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE;

-- Update wishlists unique constraint to support color variants
ALTER TABLE public.wishlists DROP CONSTRAINT IF EXISTS wishlists_user_id_product_id_key;
ALTER TABLE public.wishlists DROP CONSTRAINT IF EXISTS wishlists_user_id_product_id_variant_id_key;
ALTER TABLE public.wishlists ADD CONSTRAINT wishlists_user_id_product_id_variant_id_key UNIQUE (user_id, product_id, variant_id);

-- Backfill product variants from existing product colors and images
DO $$
DECLARE
  v_prod RECORD;
  v_color JSONB;
  v_var_id UUID;
BEGIN
  FOR v_prod IN SELECT id, name, sku, price, compare_price, stock, sizes, size_stock, colors FROM public.products LOOP
    -- If product already has variants in product_variants, skip
    IF EXISTS (SELECT 1 FROM public.product_variants WHERE product_id = v_prod.id) THEN
      CONTINUE;
    END IF;

    IF v_prod.colors IS NOT NULL AND jsonb_array_length(v_prod.colors) > 0 THEN
      FOR v_color IN SELECT * FROM jsonb_array_elements(v_prod.colors) LOOP
        INSERT INTO public.product_variants (
          product_id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active
        ) VALUES (
          v_prod.id,
          v_color->>'name',
          COALESCE(v_prod.sku, 'SKU') || '-' || upper(substring(v_color->>'name' from 1 for 3)),
          v_prod.price,
          v_prod.compare_price,
          v_prod.stock,
          v_prod.sizes,
          COALESCE(v_prod.size_stock, '{}'::jsonb),
          v_color->>'hex',
          true
        ) RETURNING id INTO v_var_id;

        -- Link existing images to this variant
        UPDATE public.product_images
        SET variant_id = v_var_id
        WHERE product_id = v_prod.id;
      END LOOP;
    ELSE
      -- Create a default variant based on product name/color
      INSERT INTO public.product_variants (
        product_id, name, sku, price, compare_price, stock, sizes, size_stock, color_hex, is_active
      ) VALUES (
        v_prod.id,
        'Default',
        v_prod.sku,
        v_prod.price,
        v_prod.compare_price,
        v_prod.stock,
        v_prod.sizes,
        COALESCE(v_prod.size_stock, '{}'::jsonb),
        '#FFFFFF',
        true
      ) RETURNING id INTO v_var_id;

      UPDATE public.product_images
      SET variant_id = v_var_id
      WHERE product_id = v_prod.id;
    END IF;
  END LOOP;
END;
$$;


-- Update get_product_by_slug RPC to fetch variants
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
  v_variants JSONB;
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
  WHERE pi.product_id = (v_product->>'id')::UUID AND pi.variant_id IS NULL;

  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
  INTO v_category
  FROM public.categories c
  WHERE c.id = (v_product->>'category_id')::UUID;

  SELECT jsonb_build_object('id', pc.id, 'name', pc.name, 'slug', pc.slug)
  INTO v_parent_category
  FROM public.categories c
  JOIN public.categories pc ON pc.id = c.parent_id
  WHERE c.id = (v_product->>'category_id')::UUID;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pv.id,
      'name', pv.name,
      'sku', pv.sku,
      'price', pv.price,
      'compare_price', pv.compare_price,
      'stock', pv.stock,
      'sizes', pv.sizes,
      'size_stock', pv.size_stock,
      'color_hex', pv.color_hex,
      'is_active', pv.is_active,
      'images', COALESCE((
        SELECT jsonb_agg(pi.image_url ORDER BY pi.sort_order)
        FROM public.product_images pi
        WHERE pi.variant_id = pv.id
      ), '[]'::jsonb)
    ) ORDER BY pv.sort_order, pv.created_at
  ), '[]'::jsonb)
  INTO v_variants
  FROM public.product_variants pv
  WHERE pv.product_id = (v_product->>'id')::UUID AND pv.is_active = true;

  RETURN jsonb_build_object(
    'product', v_product,
    'images', v_images,
    'category', v_category,
    'parent_category', v_parent_category,
    'variants', v_variants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_by_slug TO anon, authenticated;


-- Update decrement_checkout_stock to decrement variant size_stock
CREATE OR REPLACE FUNCTION public.decrement_checkout_stock(
  p_product_id UUID,
  p_quantity   INT,
  p_size       TEXT DEFAULT NULL,
  p_variant_id UUID DEFAULT NULL,
  p_reference  TEXT DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_stock INT;
  v_variant_stock  INT;
  v_size_stock     INT;
  v_size_stock_map JSONB;
  v_is_size_tracked BOOLEAN;
  v_updated_sizes  JSONB;
  v_change_type    inventory_change_type := 'order';
  v_var_size_stock_map JSONB;
  v_var_is_size_tracked BOOLEAN;
  v_var_updated_sizes JSONB;
  v_var_size_stock INT;
BEGIN
  SELECT stock, size_stock INTO v_product_stock, v_size_stock_map
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product_stock IS NULL OR v_product_stock < p_quantity THEN
    RETURN FALSE;
  END IF;

  v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
  v_updated_sizes := v_size_stock_map;

  -- Only check/update size stock if the product actually has per-size tracking
  IF p_size IS NOT NULL AND p_size <> '' AND v_is_size_tracked THEN
    v_size_stock := COALESCE((v_updated_sizes ->> p_size)::INT, 0);
    IF v_size_stock < p_quantity THEN
      RETURN FALSE;
    END IF;
    v_updated_sizes := jsonb_set(
      COALESCE(v_updated_sizes, '{}'::jsonb),
      ARRAY[p_size],
      to_jsonb(GREATEST(v_size_stock - p_quantity, 0)),
      true
    );
  END IF;

  IF p_variant_id IS NOT NULL THEN
    SELECT stock, size_stock INTO v_variant_stock, v_var_size_stock_map
    FROM public.product_variants
    WHERE id = p_variant_id
    FOR UPDATE;

    IF v_variant_stock IS NULL OR v_variant_stock < p_quantity THEN
      RETURN FALSE;
    END IF;

    v_var_is_size_tracked := v_var_size_stock_map IS NOT NULL AND v_var_size_stock_map != '{}'::jsonb;
    v_var_updated_sizes := v_var_size_stock_map;

    IF p_size IS NOT NULL AND p_size <> '' AND v_var_is_size_tracked THEN
      v_var_size_stock := COALESCE((v_var_updated_sizes ->> p_size)::INT, 0);
      IF v_var_size_stock < p_quantity THEN
        RETURN FALSE;
      END IF;
      v_var_updated_sizes := jsonb_set(
        COALESCE(v_var_updated_sizes, '{}'::jsonb),
        ARRAY[p_size],
        to_jsonb(GREATEST(v_var_size_stock - p_quantity, 0)),
        true
      );
    END IF;

    UPDATE public.product_variants
    SET stock = stock - p_quantity,
        size_stock = COALESCE(v_var_updated_sizes, size_stock)
    WHERE id = p_variant_id;
  END IF;

  UPDATE public.products
  SET stock = stock - p_quantity,
      size_stock = COALESCE(v_updated_sizes, size_stock)
  WHERE id = p_product_id;

  INSERT INTO public.inventory_logs (
    product_id, variant_id, change_type, quantity_change,
    quantity_after, reference_id, notes
  ) VALUES (
    p_product_id, p_variant_id, v_change_type, -p_quantity,
    GREATEST(v_product_stock - p_quantity, 0),
    p_reference, p_notes
  );

  RETURN TRUE;
END;
$$;


-- Update create_order_from_payment validations
CREATE OR REPLACE FUNCTION public.create_order_from_payment(
  p_user_id               UUID,
  p_order_number          TEXT,
  p_subtotal              NUMERIC,
  p_total                 NUMERIC,
  p_shipping_address      TEXT,
  p_billing_address       TEXT,
  p_stripe_session_id     TEXT,
  p_stripe_payment_intent_id TEXT,
  p_payment_method        TEXT,
  p_currency              TEXT,
  p_items                 JSONB,
  p_coupon_code           TEXT DEFAULT NULL,
  p_shipping_method       TEXT DEFAULT 'standard'
)
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_order_id        UUID;
  v_item            JSONB;
  v_prod_id         UUID;
  v_qty             INT;
  v_size            TEXT;
  v_var_id          UUID;
  v_product_stock   INT;
  v_variant_stock    INT;
  v_size_stock_map   JSONB;
  v_is_size_tracked  BOOLEAN;
  v_session_id      TEXT := COALESCE(p_stripe_session_id, 'manual');
  v_parsed_items    JSONB;
  v_order           RECORD;
BEGIN
  -- Parse items array
  v_parsed_items := COALESCE(p_items, '[]'::jsonb);

  -- === VALIDATION PASS 1: Lock all items & verify stock ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Lock parent product row
    PERFORM 1 FROM products
    WHERE id = v_prod_id AND stock >= v_qty
    FOR UPDATE;

    IF NOT FOUND THEN
      PERFORM log_payment_event('insufficient_stock',
        p_session_id := v_session_id,
        p_user_id := p_user_id,
        p_status := 'failed',
        p_message := 'Insufficient product stock: ' || v_prod_id,
        p_metadata := jsonb_build_object('product_id', v_prod_id, 'requested', v_qty)
      );
      RAISE EXCEPTION 'Insufficient stock for product %', v_prod_id;
    END IF;

    -- Lock and verify variant row if specified
    IF v_var_id IS NOT NULL THEN
      SELECT stock, size_stock INTO v_variant_stock, v_size_stock_map
      FROM product_variants
      WHERE id = v_var_id
      FOR UPDATE;

      IF v_variant_stock IS NULL OR v_variant_stock < v_qty THEN
        PERFORM log_payment_event('insufficient_variant_stock',
          p_session_id := v_session_id,
          p_user_id := p_user_id,
          p_status := 'failed',
          p_message := 'Insufficient variant stock: ' || v_var_id
        );
        RAISE EXCEPTION 'Insufficient variant stock for variant %', v_var_id;
      END IF;

      -- If variant has size stock, validate size stock
      IF v_size != '' THEN
        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            PERFORM log_payment_event('insufficient_size_stock',
              p_session_id := v_session_id,
              p_user_id := p_user_id,
              p_status := 'failed',
              p_message := 'Insufficient variant size stock: ' || v_size || ' for variant ' || v_var_id
            );
            RAISE EXCEPTION 'Insufficient stock for size % of variant %', v_size, v_var_id;
          END IF;
        END IF;
      END IF;
    ELSE
      -- Fall back to parent product's size stock validation
      IF v_size != '' THEN
        SELECT size_stock INTO v_size_stock_map
        FROM products
        WHERE id = v_prod_id;

        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            PERFORM log_payment_event('insufficient_size_stock',
              p_session_id := v_session_id,
              p_user_id := p_user_id,
              p_status := 'failed',
              p_message := 'Insufficient size stock: ' || v_size || ' for ' || v_prod_id
            );
            RAISE EXCEPTION 'Insufficient stock for size % of product %', v_size, v_prod_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- === VALIDATION PASS 2: Double-check stock after locks ===
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_prod_id AND stock >= v_qty) THEN
      RAISE EXCEPTION 'Double-check failed: insufficient stock for product %', v_prod_id;
    END IF;

    IF v_var_id IS NOT NULL THEN
      SELECT stock, size_stock INTO v_variant_stock, v_size_stock_map
      FROM product_variants
      WHERE id = v_var_id;

      IF v_variant_stock < v_qty THEN
        RAISE EXCEPTION 'Double-check failed: insufficient variant stock for variant %', v_var_id;
      END IF;

      IF v_size != '' THEN
        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;
        IF v_is_size_tracked AND COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
          RAISE EXCEPTION 'Double-check failed: insufficient size stock for variant % of size %', v_var_id, v_size;
        END IF;
      END IF;
    ELSE
      IF v_size != '' THEN
        SELECT size_stock INTO v_size_stock_map
        FROM products
        WHERE id = v_prod_id;

        v_is_size_tracked := v_size_stock_map IS NOT NULL AND v_size_stock_map != '{}'::jsonb;

        IF v_is_size_tracked THEN
          IF COALESCE((v_size_stock_map ->> v_size)::INT, 0) < v_qty THEN
            RAISE EXCEPTION 'Double-check failed: insufficient size stock for % of %', v_size, v_prod_id;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- Create order record
  INSERT INTO orders (
    user_id, order_number, subtotal, total, shipping_address,
    billing_address, payment_intent_id, payment_status, status
  ) VALUES (
    p_user_id, p_order_number, p_subtotal, p_total,
    p_shipping_address::jsonb, p_billing_address::jsonb,
    p_stripe_payment_intent_id, 'paid', 'confirmed'
  ) RETURNING id INTO v_order_id;

  -- Insert order items & decrement stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_parsed_items) LOOP
    v_prod_id := (v_item.value->>'product_id')::UUID;
    v_qty := (v_item.value->>'quantity')::INT;
    v_size := COALESCE(v_item.value->>'size', '');
    v_var_id := NULLIF(v_item.value->>'variant_id', '')::UUID;

    -- Decrement checkout stock (updates parent and variant stock + size stock)
    IF NOT public.decrement_checkout_stock(
      v_prod_id,
      v_qty,
      v_size,
      v_var_id,
      v_order_id::TEXT,
      'order_checkout'
    ) THEN
      RAISE EXCEPTION 'Post-lock decrement failed for %', v_prod_id;
    END IF;

    -- Add order item row
    INSERT INTO order_items (
      order_id, product_id, variant_id, quantity, price, size, color
    ) VALUES (
      v_order_id,
      v_prod_id,
      v_var_id,
      v_qty,
      (v_item.value->>'price')::NUMERIC,
      v_size,
      COALESCE(v_item.value->>'color', '')
    );
  END LOOP;

  -- Trigger background queue jobs for emails
  INSERT INTO background_jobs (job_type, payload) VALUES
    ('generate_invoice', jsonb_build_object('order_id', v_order_id)),
    ('generate_invoice_pdf', jsonb_build_object('order_id', v_order_id)),
    ('send_thank_you_email', jsonb_build_object('order_id', v_order_id)),
    ('send_invoice_email', jsonb_build_object('order_id', v_order_id)),
    ('send_admin_email', jsonb_build_object('order_id', v_order_id)),
    ('analytics_events', jsonb_build_object('order_id', v_order_id)),
    ('application_logs', jsonb_build_object('order_id', v_order_id));

  RETURN QUERY SELECT * FROM orders WHERE id = v_order_id;
END;
$$;
