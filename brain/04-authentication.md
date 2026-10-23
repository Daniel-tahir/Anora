# Authentication & Session Lifecycle

This document describes the user authentication structure, session tracking, inactivity timeouts, and route guard boundaries inside ANORA.

## Authentication Flows

### Customer Signup & Sign-in
- **Supabase Auth**: Credentials (email and password) are validated directly through the `supabase.auth` client SDK.
- **Provider Wrapper**:
  - `src/lib/auth-context.tsx` provides the `<AuthProvider>` context wrapper at the root of the routing layout tree.
  - Sign-in actions load user info and query the user's role status via the database profile registry.
  - On sign-up, the system inserts profile rows mapped to the authenticated user ID.

### Admin Privilege Guard
- **`has_admin_role` RPC**: Admin rights are checked on the server database using the RPC helper function, preventing fake client claims from overriding permissions.
- **Inactivity Timeout**:
  - If a logged-in user is determined to be an `admin`, the browser registers user event listeners (`mousedown`, `mousemove`, `keydown`, `touchstart`).
  - If there is no activity for **15 minutes** (`INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000`), the inactivity timer triggers a `supabase.auth.signOut()` and redirects the browser back to `/login`.

### Guest State Cache
- Users who do not register can check out as guests.
- Guest sessions are tracked using a local identifier stored in `localStorage` under `anora.customer.session.v1`.
- Carts and wishlists are persisted locally and synchronized with their customer profile accounts once they choose to sign up or log in.

## Protected vs. Public Routes

- **Public Routes**:
  - `/` (Home/Landing)
  - `/shop` (Catalog browser)
  - `/product/$slug` (Individual details page)
  - `/cart` (Bag review page)
  - `/track` (Secure tracking terminal)
  - `/login`, `/register`, `/forgot-password`, `/reset-password`
- **Protected Routes** (Requires customer authentication via `ProtectedRoute` check):
  - `/account` (User profile details, order histories, refund requests)
  - `/checkout` (Purchase billing and payments)
- **Admin Specific Routes** (Requires `isAdmin` verification via `<AdminGuard>` check):
  - `/admin/*` (Analytics, Product/Category editors, Order status managers, Finance trackers)
