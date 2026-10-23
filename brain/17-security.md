# Security Architecture & Policies

This document documents the security models, Row Level Security (RLS) configurations, API validations, and data integrity practices.

## Core Security Framework

### 1. Database Row Level Security (RLS)
- **Tables**: `profiles`, `orders`, `order_items`, `wishlists`, `cart_items`, `background_jobs`, `email_logs`, `webhook_events`.
- **Policies**:
  - `products` and `categories` are publicly queryable (`TO anon, authenticated`). Write operations are strictly blocked for non-admin accounts.
  - User records (`cart_items`, `wishlists`, `profiles`) are protected: rows can only be accessed or modified if `auth.uid() = user_id`.
  - Views are qualified using `security_invoker = true` to inherit query role constraints.

### 2. Transaction Verification & Webhooks
- **Stripe Signatures**: Checked at entry boundaries inside the post webhook handler using Stripe SDK signature checks.
- **PayPal Verification**: Verified by submitting details back to PayPal's verification endpoint.
- **Idempotency Locks**: Webhook IDs are saved to `webhook_events` inside a database transaction. If the ID is already present, the transaction rolls back, preventing double order creation.

### 3. Guest Order Tracking Security
- Guest tracking does not expose personal profile settings.
- The `get_order_by_tracking_id` RPC returns order statuses only if the user provides the correct Tracking ID or combining order number and buyer email.
- Tracking IDs are generated randomly as 8-character uppercase alphanumeric strings, preventing ID guessing attacks.

### 4. Inventory Integrity
- Checks stock configurations atomically during order transactions via database functions.
- Prevents double-purchases by locking stock configurations during active checkout sessions using the `inventory_reservations` table.
