-- Migration 043: Fix Missing Schema Objects
--
-- Audit revealed that migration 001 was partially applied to production.
-- The CREATE TYPE inventory_change_type was skipped, causing runtime errors:
--   "type inventory_change_type does not exist"
--
-- This migration creates ONLY the missing schema objects.
-- It does NOT modify business logic or recreate existing objects.
-- All CREATE statements use IF NOT EXISTS for idempotency.

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_change_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.inventory_change_type AS ENUM (
      'order',
      'restock',
      'adjustment',
      'return',
      'cancellation'
    );
  END IF;
END;
$$;

-- Ensure 'returned' was added to order_status (migration 011)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned' AFTER 'delivered';

-- ============================================================================
-- TABLES (created with IF NOT EXISTS to handle partial migration state)
-- ============================================================================

-- Migration 012
CREATE TABLE IF NOT EXISTS public.return_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id   UUID        REFERENCES public.order_items(id) ON DELETE SET NULL,
  reason          TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'requested'
                              CHECK (status IN ('requested', 'approved', 'rejected', 'refunded')),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID            NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount          NUMERIC(10,2)   NOT NULL CHECK (amount >= 0),
  reason          TEXT,
  status          TEXT            NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  processed_by    UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Migration 014
CREATE TABLE IF NOT EXISTS public.inventory_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  alert_type      TEXT        NOT NULL CHECK (alert_type IN ('critical', 'low', 'overstock')),
  threshold       INT         NOT NULL,
  current_stock   INT         NOT NULL,
  resolved        BOOLEAN     NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, alert_type)
);

-- Migration 015
CREATE TABLE IF NOT EXISTS public.reviews (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID          NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id     UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      INT           NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title       TEXT,
  review_text TEXT,
  status      TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note  TEXT,
  approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Migration 016
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       UUID            NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id         UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id        UUID            NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  discount_amount NUMERIC(10,2)   NOT NULL CHECK (discount_amount >= 0),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gift_cards (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT            NOT NULL UNIQUE,
  initial_balance NUMERIC(10,2)   NOT NULL CHECK (initial_balance > 0),
  current_balance NUMERIC(10,2)   NOT NULL CHECK (current_balance >= 0),
  status          TEXT            NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'inactive', 'expired', 'depleted')),
  expires_at      TIMESTAMPTZ,
  created_by      UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gift_card_transactions (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id    UUID            NOT NULL REFERENCES public.gift_cards(id) ON DELETE CASCADE,
  order_id        UUID            REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id         UUID            REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_type TEXT           NOT NULL CHECK (transaction_type IN ('redemption', 'refund', 'adjustment', 'expiration', 'activation')),
  amount          NUMERIC(10,2)   NOT NULL CHECK (amount > 0),
  balance_before  NUMERIC(10,2)   NOT NULL,
  balance_after   NUMERIC(10,2)   NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- Migration 018
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.invoices (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT          NOT NULL,
  order_id        UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id     UUID          NOT NULL REFERENCES public.profiles(id),
  customer_name   TEXT          NOT NULL,
  customer_email  TEXT          NOT NULL,
  subtotal        NUMERIC(10,2) NOT NULL,
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(10,2) NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid', 'cancelled', 'refunded')),
  notes           TEXT,
  issued_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID          NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id    UUID          REFERENCES public.products(id),
  product_name  TEXT          NOT NULL,
  quantity      INT           NOT NULL,
  unit_price    NUMERIC(10,2) NOT NULL,
  total_price   NUMERIC(10,2) NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Migration 020
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT        NOT NULL,
  record_id       UUID,
  action          TEXT        NOT NULL,
  old_data        JSONB,
  new_data        JSONB,
  changed_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 021
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL,
  ip_address      TEXT,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.device_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT        NOT NULL,
  device_name     TEXT,
  last_active     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_activity (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action          TEXT        NOT NULL,
  target_type     TEXT,
  target_id       UUID,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 022
CREATE TABLE IF NOT EXISTS public.abandoned_carts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id      TEXT,
  email           TEXT,
  cart_data       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  notified_at     TIMESTAMPTZ,
  recovered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.abandoned_cart_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  abandoned_cart_id UUID     NOT NULL REFERENCES public.abandoned_carts(id) ON DELETE CASCADE,
  product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id      UUID        REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity        INT         NOT NULL,
  price           NUMERIC(10,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 035
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.order_timeline (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  description     TEXT,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_records (
  id                    UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID            NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stripe_session_id     TEXT,
  stripe_payment_intent_id TEXT,
  payment_method        TEXT,
  currency              TEXT            NOT NULL DEFAULT 'usd',
  amount                NUMERIC(10,2)   NOT NULL,
  status                TEXT            NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        TEXT        NOT NULL UNIQUE,
  type            TEXT        NOT NULL,
  data            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  processed       BOOLEAN     NOT NULL DEFAULT false,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 036
CREATE TABLE IF NOT EXISTS public.email_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient       TEXT        NOT NULL,
  subject         TEXT        NOT NULL,
  template        TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
  error           TEXT,
  sent_at         TIMESTAMPTZ,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 038
CREATE TABLE IF NOT EXISTS public.background_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID        REFERENCES public.orders(id) ON DELETE CASCADE,
  job_type        TEXT        NOT NULL,
  sequence        INT         NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying')),
  attempts        INT         NOT NULL DEFAULT 0,
  max_attempts    INT         NOT NULL DEFAULT 3,
  error           TEXT,
  payload         JSONB       DEFAULT '{}'::jsonb,
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 039
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id     TEXT        NOT NULL UNIQUE,
  user_id                 UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email                   TEXT        NOT NULL,
  amount                  NUMERIC(10,2) NOT NULL,
  currency                TEXT        NOT NULL DEFAULT 'usd',
  items                   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  stripe_payment_intent_id TEXT,
  paypal_order_id         TEXT,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'expired')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour'),
  checkout_duration_seconds INT
);

-- Migration 040
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID,
  job_type        TEXT        NOT NULL,
  order_id        UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  payload         JSONB       DEFAULT '{}'::jsonb,
  error           TEXT        NOT NULL,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_audit_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT        NOT NULL,
  session_id      UUID        REFERENCES public.payment_sessions(id) ON DELETE SET NULL,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_intent_id TEXT,
  order_id        UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  message         TEXT,
  metadata        JSONB       DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 041
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id      UUID        REFERENCES public.product_variants(id) ON DELETE CASCADE,
  size            TEXT,
  quantity        INT         NOT NULL CHECK (quantity > 0),
  session_id      TEXT,
  user_id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
