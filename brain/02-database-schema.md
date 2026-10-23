# Database Schema

This document lists all active database tables in the Supabase schema, including columns, keys, foreign relationships, triggers, indexes, and Row Level Security (RLS) constraints.

## Core Schema Tables

### 1. `profiles`
- **Purpose**: Extends auth.users with profile and access roles.
- **Columns**:
  - `id` (UUID, PRIMARY KEY, references auth.users.id)
  - `email` (TEXT, NOT NULL)
  - `first_name` (TEXT)
  - `last_name` (TEXT)
  - `phone` (TEXT)
  - `avatar_url` (TEXT)
  - `role` (TEXT, DEFAULT 'customer', CHECK role IN ('customer', 'admin'))
  - `metadata` (JSONB)
  - `created_at` / `updated_at` (TIMESTAMPTZ)
- **RLS**: Enabled. Selectable by authenticated owner. Managed via `handle_new_user` trigger.

### 2. `categories`
- **Purpose**: Defines category taxonomy hierarchy (e.g., clothing, jewellery).
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `parent_id` (UUID, references categories.id)
  - `name` (TEXT)
  - `slug` (TEXT, UNIQUE)
  - `description` (TEXT)
  - `image_url` (TEXT)
  - `sort_order` (INT)
  - `is_active` (BOOLEAN)
- **Indexes**: `idx_categories_slug`, `idx_categories_parent`

### 3. `products`
- **Purpose**: Stores core product detail rows.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `category_id` (UUID, references categories.id)
  - `name` (TEXT, NOT NULL)
  - `slug` (TEXT, UNIQUE)
  - `price` (NUMERIC(10,2))
  - `compare_price` (NUMERIC(10,2))
  - `sku` (TEXT, UNIQUE)
  - `stock` (INT)
  - `sizes` (TEXT[] GIN indexed)
  - `size_stock` (JSONB)
  - `fabric` / `material` / `color` (TEXT)
  - `is_active` / `featured` (BOOLEAN)
- **Indexes**: `idx_products_slug`, `idx_products_sizes`, `idx_products_active`

### 4. `product_variants`
- **Purpose**: Detailed stock and color overrides for product options.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `product_id` (UUID, references products.id)
  - `color` (TEXT)
  - `sizes` (TEXT[])
  - `size_stock` (JSONB)
  - `stock` (INT)
  - `sku` (TEXT, UNIQUE)
  - `price_override` (NUMERIC(10,2))

### 5. `orders`
- **Purpose**: Records buyer purchases, payment IDs, addresses, and tracking.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `user_id` (UUID, references auth.users.id, OPTIONAL for Guest Checkout)
  - `order_number` (TEXT, UNIQUE)
  - `tracking_id` (TEXT, UNIQUE) -- 8-character uppercase alphanumeric Guest Tracking ID
  - `paypal_order_id` (TEXT) -- Store PayPal capturing identifier
  - `status` (order_status enum) -- pending, confirmed, processing, packed, out_for_delivery, shipped, delivered, cancelled, refunded
  - `payment_status` (payment_status enum)
  - `payment_intent_id` (TEXT)
  - `email` (TEXT)
  - `shipping_address` / `billing_address` (JSONB)
  - `subtotal` / `shipping` / `tax` / `discount` / `total` (NUMERIC)
  - `cancelled_by` (TEXT, customer/admin)
  - `cancelled_at` / `cancellation_reason` (TEXT)
- **Indexes**: `idx_orders_tracking_id`, `idx_orders_paypal_id`, `idx_orders_number`

### 6. `order_items`
- **Purpose**: Mapping order products to details, selected colors, and sizes.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `order_id` (UUID, references orders.id)
  - `product_id` (UUID, references products.id)
  - `variant_id` (UUID, references product_variants.id)
  - `quantity` (INT)
  - `price` (NUMERIC)
  - `size` / `color` (TEXT)

### 7. `wishlists`
- **Purpose**: User persistent save lists.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `user_id` (UUID, references auth.users.id)
  - `product_id` (UUID, references products.id)
- **Constraints**: UNIQUE (user_id, product_id)

### 8. `cart_items`
- **Purpose**: Persistent user shopping carts.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `user_id` (UUID, references auth.users.id)
  - `product_id` (UUID, references products.id)
  - `variant_id` (UUID)
  - `size` (TEXT)
  - `quantity` (INT)

### 9. `background_jobs`
- **Purpose**: Atomic job polling queue for backend serial workers.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `job_type` (TEXT)
  - `payload` (JSONB)
  - `status` (TEXT, DEFAULT 'pending') -- pending, processing, completed, failed
  - `attempts` (INT, DEFAULT 0)
  - `max_attempts` (INT, DEFAULT 3)
  - `run_at` / `locked_at` / `completed_at` (TIMESTAMPTZ)
  - `error` (TEXT)

### 10. `email_logs`
- **Purpose**: Enforces email idempotency logs.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `order_id` (UUID, references orders.id)
  - `email_type` (TEXT) -- thank_you, invoice, admin_alert
  - `recipient` (TEXT)
  - `status` (TEXT)
  - `sent_at` (TIMESTAMPTZ)
- **Constraints**: UNIQUE (order_id, email_type)

### 11. `webhook_events`
- **Purpose**: Stripe/PayPal webhook transaction tombstoning (idempotency checks).
- **Columns**:
  - `id` (TEXT, PRIMARY KEY) -- Stores stripe `evt_...` or paypal webhook message ID
  - `source` (TEXT) -- stripe, paypal
  - `processed_at` (TIMESTAMPTZ)

### 12. `refunds`
- **Purpose**: Tracks customer return and payment refund details.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `order_id` (UUID, references orders.id)
  - `amount` (NUMERIC)
  - `status` (TEXT) -- pending, approved, completed, rejected
  - `reason` (TEXT)
  - `description` (TEXT)
  - `processed_at` (TIMESTAMPTZ)

### 13. `order_status_history`
- **Purpose**: Audit timelines for state transitions.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `order_id` (UUID, references orders.id)
  - `from_status` / `to_status` (order_status)
  - `note` (TEXT)
  - `changed_by` (UUID)

### 14. `inventory_reservations`
- **Purpose**: Holds stock locks during session checkouts to prevent overselling.
- **Columns**:
  - `id` (UUID, PRIMARY KEY)
  - `session_id` (TEXT)
  - `product_id` (UUID)
  - `variant_id` (UUID)
  - `size` (TEXT)
  - `quantity` (INT)
  - `expires_at` (TIMESTAMPTZ)
