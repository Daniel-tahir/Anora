# Known Issues & Mitigation Logs

This document tracks known issues, their status, causes, and workarounds.

| Bug / Warning | Component / Files | Status | Priority | Cause & Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **CLI docker image caching warnings** | `supabase/config.toml` | **Warning Only** | Low | Local Supabase CLI environment warning relating to Docker Desktop container caching. Database migrations push and function executions are unaffected. |
| **Deprecated Inbucket config warning** | `supabase/config.toml` | **Warning Only** | Low | Supabase warning showing `WARN: config section [inbucket] is deprecated`. Can be resolved by updating the section to `[local_smtp]` in config.toml. |
| **Wishlist dynamic load mapping** | `src/routes/wishlist.tsx` | **RESOLVED** | High | Dynamic wishlist elements loaded from the database were not rendering because the page mapped items against a static mock array. Fixed by querying using the `wish.getProduct(id)` registry helper. |
| **Wishlist Toast Message Inversion**| `src/routes/product.$slug.tsx`, `ProductCard.tsx` | **RESOLVED** | Medium | Event callbacks triggered notifications by checking asynchronous states *after* mutators completed. Fixed by capturing previous status prior to executing the state toggle. |
