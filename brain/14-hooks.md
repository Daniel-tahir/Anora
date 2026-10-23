# Custom Hooks

This document catalogs custom React hooks, their parameters, return parameters, and visual/state dependencies.

## Custom Hooks Registry

### 1. `useAuth`
- **Path**: `src/lib/auth-context.tsx`
- **Purpose**: Exposes current authenticated session state, profiles role levels, and inactivity timers.
- **Returns**:
  - `user` (Supabase User or null)
  - `loading` (Boolean)
  - `isAdmin` (Boolean)
  - `signIn` / `signUp` / `signOut` / `resetPassword` / `refreshUser` (Functions)

### 2. `useCart`
- **Path**: `src/lib/store.tsx`
- **Purpose**: Controls client cart states, updates item counts, subtotals, and handles stock validation.
- **Returns**:
  - `items` (Array of items in the bag)
  - `add(productId, size, qty, variantId)` / `remove(productId, size)` / `setQty(productId, size, quantity)` / `clear()` (Functions)
  - `count` (Total items quantity)
  - `subtotal` (Price totals sum)
  - `detailed` (Validation detailed statuses map)

### 3. `useWishlist`
- **Path**: `src/lib/store.tsx`
- **Purpose**: Connects heart state buttons to local storage save lists and user profile databases.
- **Returns**:
  - `ids` (List of saved product UUIDs)
  - `toggle(id)` / `remove(id)` (State helpers)
  - `has(id)` (Fast checking lookup function)
  - `count` (Total items)
  - `getProduct(id)` (Fetches current Product structure from registry)

### 4. `useMobile`
- **Path**: `src/hooks/use-mobile.tsx`
- **Purpose**: Viewport width checking helper, helping header layouts adjust dynamically.
- **Returns**: Boolean (true if screen width <= 768px).
