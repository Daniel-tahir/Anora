# Wishlist Architecture & State

This document outlines the secure wishlist state machinery, database sync mechanisms, and toast notification event flows.

## Wishlist Storage Modes

### Local Caching
- **LocalStorage Storage**: Unauthenticated guest wishlist item UUIDs are saved locally under the key `anora.customer.wishlist.v2`.
- **Pre-Fetching & Hydration**: On initialization, the store's `hydrate()` loop collects all `wishIds` alongside `cartItems` to detect any unregistered UUIDs. It then triggers `loadProductsByIds()` to retrieve the dynamic product objects from Supabase.

### Database Row Sync (`wishlists` table)
- **Supabase Sync on Login**:
  - `syncWishlistOnLogin(userId)` merges local cached product IDs with the user's remote `wishlists` table records.
  - Inserts missing entries on the remote DB using an atomic `.upsert()` with constraint handling (`onConflict: "user_id,product_id"`).
  - Triggers database queries for any missing product registry models so that they render immediately.

## Wishlist Page Render Pipeline
- **Dynamic Lookup**: Rather than relying on a static mock array, the Wishlist page component maps current ID arrays dynamically:
  ```typescript
  const items = wish.ids.map(id => wish.getProduct(id)).filter((p): p is Product => !!p);
  ```
- **Safety Guards**: Automatically filters out any deleted, null, or invalid product configurations, guarding layout renders from unexpected crashes.

## Interactive Toast & Status Synchronization
- **Inactivity/Race Protection**: The system captures the wish state (`const wasWishlisted = wish.has(product.id)`) *prior* to initiating database updates or local toggling.
- **Success Feedback**: Triggered toasts strictly match the action:
  - Adding to wishlist triggers: `Added to Wishlist` (with active heart styling).
  - Removing from wishlist triggers: `Removed from Wishlist` (reverting to empty heart outline).
