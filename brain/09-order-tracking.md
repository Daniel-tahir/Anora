# Order Tracking System

This document explains the architecture of the guest and authenticated order tracking systems, Tracking ID generation rules, and visual timeline updates.

## Tracking ID Generation
- **Format**: An 8-character uppercase alphanumeric string (e.g. `AK7X9PLQ`, `N4Q8LK7M`, `PX82MAQ1`).
- **Generation Logic**: Built database-side via trigger using the `generate_unique_tracking_id()` function on insert. It selects character tokens excluding confusing letters/numbers, verifying uniqueness in the `orders` table before returning.
- **Backwards Compatibility**: Legacy orders with 6-character tracking IDs continue to resolve correctly via lookup query definitions.

## Tracking Flow & Security

### Guest Tracking
- **Public Terminal (`/track` route)**:
  - Customers navigate to `/track` to retrieve order information.
  - The page accepts either the Tracking ID directly, or an Email address and Order Number combination.
  - The query calls `get_order_by_tracking_id` which retrieves order timelines, return request logs, and shipping histories.
  - It bypasses user login credentials, making checkout and post-purchase support frictionless.

### Authenticated Customer Portal
- Users with an account see their list of orders inside the `/account` route (queries order history filtered by the authenticated user's `auth.uid()`).
- Links to individual items open details directly inside the tracking screen.

## Status Timeline & UI Display
- Timelines are rendered visually using progress bars, active icons, and status descriptions.
- State progressions:
  1. **Placed (Pending/Confirmed)**: Order received, payment verified.
  2. **Packed**: Inventory gathered, packed, and labeled in the atelier.
  3. **Out for Delivery**: Handed over to shipping carriers.
  4. **Delivered**: Customer delivery confirmed.
  - Cancelled or refunded states render prominent warning indicators with reasons.
- **Copy tracking ID**: The UI provides a one-click copy tracker with feedback messages.
