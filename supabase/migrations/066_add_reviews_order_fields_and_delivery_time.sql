-- Migration 066: Reviews Verified Purchase Extensions & Auto Job Enqueue
-- Add order_id, order_item_id, is_verified, published_at, reviewer_name to reviews table
-- Add delivered_at to orders table and automatic 2-day queue trigger

-- 1. Create review tokens table for guest checkout validation
CREATE TABLE IF NOT EXISTS public.review_tokens (
  token       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID        NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  email       TEXT          NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL DEFAULT now() + INTERVAL '30 days',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_tokens_token ON public.review_tokens(token);

-- Enable RLS for review_tokens
ALTER TABLE public.review_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can do all on review_tokens"
  ON public.review_tokens FOR ALL
  USING (public.is_staff());

CREATE POLICY "Anyone can select review_tokens"
  ON public.review_tokens FOR SELECT
  USING (true);

-- 2. Alter reviews table structure
ALTER TABLE public.reviews ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reviewer_name TEXT;

-- Update existing reviews to have a default reviewer name and verify them
UPDATE public.reviews SET reviewer_name = 'Customer' WHERE reviewer_name IS NULL;
ALTER TABLE public.reviews ALTER COLUMN reviewer_name SET NOT NULL;

-- Enforce unique reviews per order item
ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_order_item_id_key;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_order_item_id_key UNIQUE (order_item_id);

-- 3. Alter orders table structure to store delivery timestamp
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- 4. Alter background_jobs table to support scheduled runs
ALTER TABLE public.background_jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- 5. Recreate update_order_status to capture delivered_at automatically
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_status   TEXT,
  p_note     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_valid          BOOLEAN;
BEGIN
  SELECT status::TEXT INTO v_current_status
  FROM public.orders WHERE id = p_order_id;

  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM (VALUES
      ('pending', 'confirmed'), ('pending', 'cancelled'),
      ('confirmed', 'processing'), ('confirmed', 'cancelled'),
      ('processing', 'packed'), ('processing', 'cancelled'),
      ('packed', 'shipped'), ('packed', 'cancelled'),
      ('shipped', 'out_for_delivery'),
      ('out_for_delivery', 'delivered'),
      ('delivered', 'returned'),
      ('cancelled', 'refunded'),
      ('returned', 'refunded')
    ) AS t(from_status, to_status)
    WHERE t.from_status = v_current_status AND t.to_status = p_status
  ) INTO v_valid;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Invalid status transition from %s to %s', v_current_status, p_status)
    );
  END IF;

  UPDATE public.orders
  SET status = p_status::public.order_status, 
      updated_at = now(),
      delivered_at = CASE WHEN p_status = 'delivered' THEN now() ELSE delivered_at END
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, previous_status, new_status, changed_by, note)
  VALUES (p_order_id, v_current_status, p_status, auth.uid(), p_note);

  INSERT INTO public.order_timeline (order_id, event_type, description, metadata)
  VALUES (p_order_id, 'status_change',
    CASE
      WHEN p_status = 'cancelled' THEN 'Order cancelled'
      ELSE 'Status changed from ' || v_current_status || ' to ' || p_status
    END,
    jsonb_build_object('from_status', v_current_status, 'to_status', p_status));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. Create trigger on orders table to automatically enqueue review email after 2 days
CREATE OR REPLACE FUNCTION public.trg_enqueue_review_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    -- Check if review email job is already enqueued to prevent duplicate schedules
    IF NOT EXISTS (
      SELECT 1 FROM public.background_jobs 
      WHERE order_id = NEW.id AND job_type = 'send_review_email'
    ) THEN
      INSERT INTO public.background_jobs (job_type, order_id, status, scheduled_at, payload)
      VALUES (
        'send_review_email',
        NEW.id,
        'pending',
        now() + INTERVAL '2 days',
        jsonb_build_object('email', NEW.email)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_order_delivered ON public.orders;
CREATE TRIGGER trg_on_order_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enqueue_review_email();

-- 7. Recreate get_pending_jobs to respect scheduled_at
CREATE OR REPLACE FUNCTION public.get_pending_jobs(
  p_limit INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub), '[]'::JSONB) INTO v_jobs
  FROM (
    SELECT id, job_type, order_id, payload, retry_count, max_retries, created_at, sequence
    FROM background_jobs
    WHERE status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
    ORDER BY order_id, sequence ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) sub;

  RETURN v_jobs;
END;
$$;

-- 8. Redefine review moderation functions to handle guest checkouts gracefully (LEFT JOIN profiles)
CREATE OR REPLACE FUNCTION public.get_review_details(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'id',              r.id,
      'product_id',      r.product_id,
      'product_name',    pr.name,
      'user_id',         r.user_id,
      'customer_name',   COALESCE(p.first_name || ' ' || p.last_name, r.reviewer_name),
      'customer_email',  COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)),
      'rating',          r.rating,
      'title',           r.title,
      'review_text',     r.review_text,
      'status',          r.status,
      'is_verified',     r.is_verified,
      'admin_note',      r.admin_note,
      'approved_at',     r.approved_at,
      'created_at',      r.created_at
    )
    FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id
    WHERE r.id = p_review_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reviews_management(
  p_page          INT DEFAULT 1,
  p_page_size     INT DEFAULT 20,
  p_search        TEXT DEFAULT NULL,
  p_sort_by       TEXT DEFAULT 'created_at',
  p_sort_dir      TEXT DEFAULT 'desc',
  p_status_filter TEXT DEFAULT NULL,
  p_rating_filter INT DEFAULT NULL
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
  v_where  TEXT := ' WHERE 1=1';
BEGIN
  v_offset := (p_page - 1) * p_page_size;

  IF p_search IS NOT NULL AND p_search != '' THEN
    v_where := v_where || format(
      ' AND (pr.name ILIKE %1$L OR COALESCE(p.first_name || '' '' || p.last_name, r.reviewer_name) ILIKE %1$L OR COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)) ILIKE %1$L OR r.review_text ILIKE %1$L)',
      '%' || p_search || '%'
    );
  END IF;

  IF p_status_filter IS NOT NULL AND p_status_filter != '' AND p_status_filter != 'all' THEN
    v_where := v_where || format(' AND r.status = %L', p_status_filter);
  END IF;

  IF p_rating_filter IS NOT NULL AND p_rating_filter BETWEEN 1 AND 5 THEN
    v_where := v_where || format(' AND r.rating = %L', p_rating_filter);
  END IF;

  EXECUTE 'SELECT COUNT(*) FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id'
    || v_where INTO v_total;

  EXECUTE 'SELECT jsonb_build_object(
    ''reviews'', COALESCE(jsonb_agg(sub ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'rating'   THEN 'sub.rating'
      WHEN p_sort_by = 'status'   THEN 'sub.status'
      WHEN p_sort_by = 'created_at' THEN 'sub.created_at'
      ELSE 'sub.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    '), ''[]''::jsonb),
    ''total'', $1
  )
  FROM (
    SELECT
      r.id,
      r.rating,
      r.title,
      r.review_text,
      r.status,
      r.is_verified,
      r.admin_note,
      r.approved_at,
      r.created_at,
      r.updated_at,
      pr.id AS product_id,
      pr.name AS product_name,
      pr.slug AS product_slug,
      (SELECT pi.image_url FROM public.product_images pi WHERE pi.product_id = pr.id ORDER BY pi.sort_order ASC LIMIT 1) AS product_image,
      p.id AS user_id,
      COALESCE(p.first_name || '' '' || p.last_name, r.reviewer_name) AS customer_name,
      COALESCE(p.email, (SELECT o.email FROM public.orders o WHERE o.id = r.order_id)) AS customer_email
    FROM public.reviews r
    JOIN public.products pr ON pr.id = r.product_id
    LEFT JOIN public.profiles p ON p.id = r.user_id'
    || v_where ||
    ' ORDER BY ' ||
    CASE
      WHEN p_sort_by = 'rating'   THEN 'r.rating'
      WHEN p_sort_by = 'status'   THEN 'r.status'
      WHEN p_sort_by = 'created_at' THEN 'r.created_at'
      ELSE 'r.created_at'
    END ||
    CASE WHEN p_sort_dir = 'asc' THEN ' ASC' ELSE ' DESC' END ||
    ' LIMIT ' || p_page_size || ' OFFSET ' || v_offset || '
  ) sub'
  INTO v_result
  USING v_total;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_review(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.reviews
  SET status = 'approved', approved_at = now(), published_at = now(), updated_at = now()
  WHERE id = p_review_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
