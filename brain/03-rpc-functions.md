# Database RPC Functions

This document lists the main PostgreSQL Database Functions (RPCs) deployed on the Supabase database. These functions process core business actions atomically on the database server.

## Core RPC Mappings

### 1. `create_order_from_payment`
- **Purpose**: Creates an order and order items atomically, validates coupon codes, records payment info, registers queue jobs, and decrements stock.
- **Parameters**:
  - `p_payment_intent_id` (TEXT)
  - `p_email` (TEXT)
  - `p_shipping_address` (JSONB)
  - `p_billing_address` (JSONB)
  - `p_items` (JSONB) -- Array of order items
  - `p_coupon_code` (TEXT, DEFAULT NULL)
  - `p_shipping_method` (TEXT)
- **Returns**: `SETOF public.orders`
- **Side Effects**: Decrements inventory stock counts. Inserts 7 jobs into `background_jobs` for the post-checkout email pipeline.
- **Called From**: `order-lifecycle.ts` (Stripe redirect success handler & Webhook processor).

### 2. `get_order_by_tracking` / `get_order_by_tracking_id`
- **Purpose**: Securely retrieves order status history, shipping details, and invoice rows for guest tracking using only order reference inputs (Tracking ID or Email + Order Number).
- **Parameters**:
  - `p_tracking_id` (TEXT)
  - `p_email` (TEXT, DEFAULT NULL)
  - `p_order_number` (TEXT, DEFAULT NULL)
- **Returns**: JSON object including order rows, items, timeline history, and return/refund statuses.
- **Called From**: `src/routes/track.tsx` via `getOrderByTracking` API helper.

### 3. `cancel_order`
- **Purpose**: Marks an order as cancelled, records who cancelled it (customer vs admin) and releases the items back into product inventory stock.
- **Parameters**:
  - `p_order_id` (UUID)
  - `p_cancelled_by` (TEXT) -- 'customer' or 'admin'
  - `p_reason` (TEXT, DEFAULT NULL)
- **Returns**: `VOID`
- **Called From**: `src/routes/account.tsx` via `cancelOrder` dialog.

### 4. `request_refund`
- **Purpose**: Submits a formal refund request on a delivered order, creating entries in the `refunds` table.
- **Parameters**:
  - `p_order_id` (UUID)
  - `p_reason` (TEXT) -- Damaged Product, Wrong Product, Quality Issue, Late Delivery, Other
  - `p_description` (TEXT, DEFAULT NULL)
- **Returns**: `VOID`
- **Called From**: `src/routes/account.tsx` via `RequestRefundDialog` component.

### 5. `reserve_inventory`
- **Purpose**: Atomically locks requested item inventory configurations with an expiration timestamp. Prevents other concurrent guest users from taking items that are in checkout.
- **Parameters**:
  - `p_session_id` (TEXT)
  - `p_items` (JSONB) -- Items to lock
- **Returns**: BOOLEAN (TRUE if successfully locked, FALSE otherwise)
- **Called From**: Checkout initialization phase.

### 6. `release_expired_reservations`
- **Purpose**: Scheduled maintenance trigger that releases inventory locks back into public stock counts once their session lock has expired.
- **Parameters**: None.
- **Returns**: `VOID`
- **Called From**: Cron/Database trigger scheduler.

### 7. `get_order_details`
- **Purpose**: Comprehensive join query that aggregates order meta, profile fields, returns, refunds, status logs, and invoice details.
- **Parameters**:
  - `p_order_id` (UUID)
- **Returns**: JSON structure representing the complete details of an order.
- **Called From**: Admin panel & customer portal.

### 8. `update_order_status`
- **Purpose**: Atomically updates the state transitions of an order, registers a timeline entry, and generates invoices when moving to confirmed status.
- **Parameters**:
  - `p_order_id` (UUID)
  - `p_status` (order_status)
  - `p_note` (TEXT)
- **Returns**: `VOID`
- **Called From**: Admin Order Manager dashboard.
