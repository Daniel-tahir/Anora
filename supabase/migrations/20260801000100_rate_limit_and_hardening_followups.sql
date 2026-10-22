-- Fixed-window, cross-instance rate limiter used by the server (service_role only).
CREATE SCHEMA IF NOT EXISTS app_private;

CREATE TABLE IF NOT EXISTS app_private.rate_limits (
  bucket       text        NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_start timestamptz;
  v_hits  integer;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds < 1 THEN p_window_seconds := 60; END IF;
  v_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO app_private.rate_limits AS rl (bucket, window_start, hits)
  VALUES (left(p_bucket, 200), v_start, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = rl.hits + 1
  RETURNING rl.hits INTO v_hits;

  -- opportunistic cleanup (≈1% of calls)
  IF random() < 0.01 THEN
    DELETE FROM app_private.rate_limits WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer) TO service_role;
