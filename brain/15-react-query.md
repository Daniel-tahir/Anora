# React Query Cache Management

This document maps TanStack Query hooks, query cache keys, mutation strategies, and cache invalidation workflows.

## Query Keys Registry

### 1. `["active-categories"]`
- **Hook**: `useActiveCategories()` inside `src/lib/categories.ts`
- **Data**: Array of active parent and child categories.
- **Cache Strategy**: Long-lived lookup tables, stable cache.

### 2. `["category-products", slug]`
- **Hook**: `useCategoryProducts(slug)` inside `src/lib/categories.ts`
- **Data**: Product rows filtered by category.
- **Cache Strategy**: Cached per category slug routing. Re-fetches on route transitions.

### 3. `["subcategory-products", categorySlug, subcategorySlug]`
- **Hook**: `useSubcategoryProducts(...)` inside `src/lib/categories.ts`
- **Data**: Products matching both category and subcategory criteria.
- **Cache Strategy**: Dynamic cache indexed by both slugs.

### 4. `["order", trackingId, email, orderNumber]`
- **Hook**: `useQuery` inside `src/routes/track.tsx`
- **Data**: Aggregate order tracking history data.
- **Cache Strategy**: Refetches on demand or manually via the "Refresh Status" action.

## Mutation & Invalidation Rules
- **Optimistic Caching**: Carts and wishlists avoid React Query caches, using the `useSyncExternalStore` listener model to bypass HTTP roundtrips.
- **Invalidation**: Submitting order checkouts invalidates dynamic inventory states. Updating category mappings triggers queries invalidation to keep client navigation fresh.
