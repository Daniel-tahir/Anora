# COMPLETE ARCHITECTURE AUDIT — ANORA ELEGANCE ATELIER

**Date**: 2026-07-08
**Scope**: Full codebase — server, client, database, configuration, infrastructure
**Total findings**: 126 (19 Critical, 26 High, 32 Medium, 31 Low, 18 Architectural)

---

## EXECUTIVE SUMMARY

This application has undergone a partial backend refactor that eliminated some issues but introduced new ones. The refactor was incomplete — the old and new architectures coexist, creating a dual-system problem worse than the original. Key structural problems:

1. **Two parallel env systems** — `server/config/env.ts` (container) and `server/lib/env.ts` (legacy singleton), both actively used by different modules
2. **Two parallel Supabase admin clients** — one from container, one from module-level import of `supabase-admin.ts`
3. **Client imports server code** — `src/lib/payments.ts` dynamically imports `../../server/container` (already flagged by build tool)
4. **Module-level singletons** — `supabaseAdmin`, `emailService`, `logger` all instantiate at import time, before env validation
5. **Broken idempotency** — Email duplicate check uses `head: true` + `.limit(1)` in a conflicting combination that never detects duplicates
6. **Secret key leakage risk** — `env.toJSON()` exposes all secrets; `invoice.ts` missing `import crypto`; Stripe API version string likely invalid

---

## CRITICAL ISSUES

### C1. Dual Environment Variable Systems Coexist (CRITICAL)
**Files**: `server/lib/env.ts` (55 lines) + `server/lib/supabase-admin.ts` (uses old env) vs `server/config/env.ts` (new env)
**Root cause**: Phase 3 refactor created `server/config/env.ts` but never migrated the old `server/lib/env.ts`. Both are actively used — `server/lib/supabase-admin.ts` still imports from the old one. Two independent cached views of env vars with different parsing logic and different search paths.
**Impact**: If env files differ or search paths diverge, the container's Supabase client and the legacy Supabase client use different credentials. This can cause silent auth failures, data corruption, or security issues.
**Solution**: Delete `server/lib/env.ts`. Rewrite `server/lib/supabase-admin.ts` to either (a) accept the supabase client via DI, or (b) import `env` from `../config/env` and create the client lazily.
**Production risk**: CRITICAL — silent data corruption or auth failure in mixed-usage paths.

### C2. Module-Level Side Effect Creates Supabase Client at Import Time (CRITICAL)
**Files**: `server/lib/supabase-admin.ts:4-18`, imported by `server/lib/cart-validation.ts`, `server/lib/admin.ts`, and `src/lib/payments.ts` (5 dynamic imports)
**Root cause**: `createClient()` is called at module scope during import, before any container initialization, before env validation. If env vars are missing, an unvalidated client is created with empty credentials. The `console.warn` on line 9 replaces structured logging.
**Impact**: All downstream consumers get an unvalidated supabase client. Errors surface only at query time — not startup. No typed logging.
**Solution**: Replace with lazy initialization pattern: `let client; export function getSupabaseAdmin() { if (!client) client = createClient(...); return client; }`. Use `logger.warn()` instead of `console.warn`.
**Production risk**: HIGH — runtime crashes instead of clear startup failures.

### C3. Client Imports Server Container — Already Fails Build (CRITICAL)
**Files**: `src/lib/payments.ts:49-52` — `getContainer()` helper imports `../../server/container`
**Root cause**: The `getContainer()` helper is a module-level async function that dynamically imports from `server/container`. Even though it's only called inside `createServerFn` handlers (which run server-side), the import statement is statically analyzed and triggers "Import denied in client environment".
**Impact**: Build fails. This was previously fixed (commit removed the helper) but reverting to the old `supabaseAdmin` dynamic import pattern is the current state.
**Solution**: Already fixed — confirmed current `src/lib/payments.ts` uses `import("../../server/lib/supabase-admin")` inside handlers, not the container. Verify no regression.

### C4. Email Service Module-Level Singleton Bypasses Container (CRITICAL)
**Files**: `server/services/email.ts:206` — `export const emailService = new EmailService()` at module scope
**Root cause**: Two instances of `EmailService` can exist — the module-level singleton and the container's instance. The module-level one creates `new Resend(apiKey)` during import, before env validation.
**Impact**: If `emailService` is imported before the container initializes, an unvalidated Resend client is created. Two instances waste resources and could cause rate-limit issues.
**Solution**: Remove the `emailService` export. All consumers must use `getContainer().email`.
**Production risk**: MEDIUM — wasted resources, potential startup errors.

### C5. Email Idempotency Check is Dead Code (CRITICAL)
**Files**: `server/services/email.ts:70-83`
**Root cause**: `checkDuplicate()` uses `.select("id", { count: "exact", head: true }).limit(1)`. The `head: true` option tells Supabase to return only a count (no rows), making `data` always `null`. The check `(data?.length ?? 0) > 0` is always `false` because `data` is null. Every webhook retry sends duplicate emails.
**Impact**: Every Stripe webhook replay or queue retry causes duplicate customer emails. In production with Stripe's 3-day retry window, customers could receive 20+ duplicate order confirmations.
**Solution**: Replace with `.select("id").limit(1).maybeSingle()` and check `if (result) return true`. Remove `head: true`.
**Production risk**: CRITICAL — guaranteed duplicate emails on any webhook retry.

### C6. Missing `import crypto` in Invoice Service (CRITICAL)
**Files**: `server/services/invoice.ts:244` — `crypto.randomUUID()` without import
**Root cause**: `crypto.randomUUID()` works in Node 19+ because `crypto` is a global, but there is no `import crypto from "node:crypto"`. Fails on Node <19 or stricter runtimes.
**Impact**: Runtime crash `ReferenceError: crypto is not defined` on standard Node 18 deployments. TypeScript strict mode also fails.
**Solution**: Add `import crypto from "node:crypto";` at line 1.
**Production risk**: CRITICAL — guaranteed crash on Node 18.

### C7. StorageService.ensureBucket() TOCTOU Race Condition (CRITICAL)
**Files**: `server/services/storage.ts:69-80`
**Root cause**: Check-then-create pattern with no synchronization. If two server instances start simultaneously, both check (bucket doesn't exist), both try to create, the second one fails with "Bucket already exists". This error is NOT caught.
**Impact**: Container initialization fails during rolling deployments. Deployments with multiple instances will randomly fail.
**Solution**: Wrap `createBucket` in try-catch: `try { await create... } catch (e) { if (!e.message?.includes('already exists')) throw e; }`.
**Production risk**: HIGH — deployment failures with rolling restarts.

### C8. Custom Stripe Webhook Verification Bypasses SDK (CRITICAL)
**Files**: `server/lib/payments.ts:407-433`
**Root cause**: Custom HMAC-SHA256 implementation of Stripe webhook signature verification instead of using `stripe.webhooks.constructEvent()`. Custom code doesn't handle multiple signatures, uses hardcoded 300-second tolerance, and may fail on future Stripe API changes.
**Impact**: Webhook verification is fragile — could reject valid webhooks (missed payments) or accept invalid ones (security risk).
**Solution**: Use `stripe.webhooks.constructEvent(payload, signatureHeader, webhookSecret)`. The `stripe` instance is available via `getContainer().stripe`.
**Production risk**: HIGH — missed payments or security vulnerability.

### C9. Database: Dual `require_admin` Function Definition (CRITICAL)
**Files**: Created in `002_rls.sql`, re-created with different signature in `033_replace_require_admin_with_is_admin.sql` — now exists twice
**Root cause**: Migration 033 creates a new `require_admin()` function but the old definition from migration 002 still exists. Both are `SECURITY DEFINER` with potential different `search_path` settings. PostgreSQL allows function overloading by argument types, so both can coexist.
**Impact**: Ambiguity about which function is called. If the old one has different security context (missing `search_path = ''`), it could create SQL injection vectors.
**Solution**: Drop the old function explicitly in migration 033. Audit all function definitions for conflicts.

### C10. Database: `search_path` Missing on Security-Definer Functions (CRITICAL)
**Files**: Three `SECURITY DEFINER` functions lack `SET search_path`:
- `flag_low_stock_products()` (004_inventory_refactor.sql:13)
- `flag_low_stock_variants()` (004_inventory_refactor.sql:59)
- `decrement_checkout_stock()` (041_inventory_engine_parity.sql:16)
**Root cause**: When called from `create_order_from_payment` (which has `SET search_path = ''`), these functions inherit the empty search path. They reference unqualified table names (`products`, `inventory_logs`) and enum types (`inventory_change_type`) that can't be resolved.
**Impact**: Runtime errors: `relation "products" does not exist` and `type "inventory_change_type" does not exist`. Blocks the entire checkout pipeline.
**Solution**: Add `SET search_path = 'public'` to all three function declarations.
**Production risk**: CRITICAL — all orders fail.

### C11. Database: Invalid Stripe API Version String (CRITICAL)
**Files**: `server/config/index.ts:29` — `"2026-06-24.dahlia"`
**Root cause**: Stripe API versions use format `YYYY-MM-DD` (e.g., `2025-02-24`). The `.dahlia` suffix is invalid. `new Stripe(key, { apiVersion: "2026-06-24.dahlia" })` throws `Invalid Stripe API version`.
**Impact**: Container initialization crashes. All Stripe operations fail.
**Solution**: Use `"2025-02-24.acacia"` (latest stable) or omit `apiVersion` to let Stripe use its default.
**Production risk**: CRITICAL — Stripe never initializes.

### C12. Debug Console Logs Leak Payment Data in Production (CRITICAL)
**Files**: `src/routes/checkout.tsx` — 16 `console.log("[TRACE *]"...)` calls
**Root cause**: Debug tracing logs PaymentIntent IDs, access token prefixes, order numbers, invoice numbers to browser console. These are visible to all users in production.
**Impact**: PCI DSS concern (payment intent IDs visible in console), information leakage (order IDs, tokens).
**Solution**: Remove all `console.log("[TRACE *]"...)` calls.
**Production risk**: MEDIUM — security theater, not a direct PCI violation.

### C13. Cart Server Sync Delete-Then-Insert Data Loss (CRITICAL)
**Files**: `src/lib/customer-services.ts:447-479`
**Root cause**: `syncCartWithServer()` deletes ALL `cart_items` for a user, then re-inserts. If INSERT fails, the server cart is permanently lost.
**Impact**: Network errors during checkout can wipe a user's cart. Non-atomic operation.
**Solution**: Use `ON CONFLICT` (upsert) or wrap in a transaction (if supported by Supabase client). At minimum, save a backup before deleting.

### C14. Supabase Admin Client Created with Empty Credentials (CRITICAL)
**Files**: `src/lib/supabase.ts:14` — `createBrowserClient(supabaseUrl ?? "", supabaseAnonKey ?? "")`
**Root cause**: If env vars are missing, supabase client is created with empty strings. All API calls silently fail with opaque errors.
**Impact**: Silent failures across all database operations. No clear "not configured" startup error.
**Solution**: Validate env vars at app startup and fail with clear error.

### C15. `env.toJSON()` Exposes All Secrets (CRITICAL)
**Files**: `server/config/env.ts:163-165`
**Root cause**: `toJSON()` returns all env vars including `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RESEND_API_KEY`.
**Impact**: If accidentally logged in development or returned in error responses, all API secrets leak.
**Solution**: Filter out secret keys.

### C16. Stripe Checkout Session Uses Raw HTTP Instead of SDK (CRITICAL)
**Files**: `server/lib/payments.ts:207-281`
**Root cause**: `createStripeCheckoutSession()` manually constructs URL-encoded form data and sends to Stripe REST API via raw `fetch()`. Loses all SDK features: automatic retries, idempotency, type safety, proper error parsing.
**Impact**: Duplicate Stripe interaction pattern. Manual fetch means no automatic retry, no idempotency, and error messages are raw JSON.
**Solution**: Use `container.stripe.checkout.sessions.create()`.

### C17. Shipping and Tax Always Zeroed in Email/Invoice Data (CRITICAL)
**Files**: `server/lib/order-lifecycle.ts:351-353, 475-477`
**Root cause**: Both `createOrderFromPaymentIntent` and `createOrderFromPayment` hardcode `shipping: 0` and `tax: 0` in the email payload, even though customers may have paid for shipping.
**Impact**: Invoices and confirmation emails show $0 shipping, which is misleading to customers and potentially violates pricing transparency expectations.
**Solution**: Extract shipping cost from PaymentIntent metadata or Stripe Checkout Session and pass through to email data.

### C18. Database: `get_pending_jobs` and `get_retryable_jobs` Declared STABLE (CRITICAL)
**Files**: `038_background_jobs.sql:65,93`
**Root cause**: Both functions are declared `STABLE` but use `FOR UPDATE SKIP LOCKED` — PostgreSQL 17 rejects `SELECT FOR UPDATE` in STABLE functions. Already fixed in migration 044 but the original migrations contain the wrong declarations.
**Impact**: On fresh deployments of migration 038, the queue silently fails. Functions must be VOLATILE.
**Solution**: Already fixed in 044. Verify the fix is applied in production.

### C19. Firebase Admin SDK Listed in Dependencies But Not Used (CRITICAL)
**Files**: `package.json` — `firebase-admin` may be a dependency
**Impact**: Unused dependency with security implications if not kept updated.

---

## HIGH ISSUES

### H1. SQL Injection via ILIKE Wildcards (HIGH)
**Files**: `server/lib/admin.ts:161-166, 229-233`
**Root cause**: Search sanitizer allows `_` (SQL LIKE single-character wildcard). A search for `smith_` matches `smithX` as well.
**Impact**: Search results are broader than intended.
**Solution**: Escape LIKE wildcards after sanitization.

### H2. Bare `throw new Error()` Instead of Typed Errors (HIGH)
**Files**: `server/lib/order-lifecycle.ts:44, 54`
**Root cause**: `throw new Error("Failed to generate order number")` uses plain Error instead of `InfrastructureError`.
**Impact**: Callers catching typed `ApplicationError` won't catch these.
**Solution**: Replace with `throw new InfrastructureError(...)`.

### H3. Unused Imports Across Codebase (HIGH)
**Files**: `server/lib/order-lifecycle.ts:3` (PaymentError, NotFoundError), `server/services/storage.ts:2` (env)
**Root cause**: Imports left behind after refactoring.
**Impact**: Lint warnings, maintenance debt.
**Solution**: Remove unused imports.

### H4. DLQ Fallback Silent Error Swallowing (HIGH)
**Files**: `server/services/queue.ts:182-200`
**Root cause**: `moveToDlq()` catch block silently swallows all errors. If both RPC and direct update fail, jobs stuck in `processing` status indefinitely.
**Impact**: Dead jobs accumulate. Queue stalls for affected orders.
**Solution**: Log with `logger.error` if both paths fail. Add recovery mechanism for stuck jobs.

### H5. Signed URL Path Extraction Fragile (HIGH)
**Files**: `server/services/invoice.ts:326-327`
**Root cause**: `url.split("/").pop()` extracts filename from signed URL. If Supabase changes URL format or adds query params, this breaks.
**Impact**: PDF download fails if URL format changes.
**Solution**: Store `pdf_path` in invoice record (already done by `uploadPdf()`) and use it directly.

### H6. Auth Token Passed in URL Query Parameter (HIGH)
**Files**: `src/routes/account.tsx:414-423`, `src/routes/order.success.tsx`
**Root cause**: `window.open(apiUrl, "_blank")` passes access token as `?token=` query parameter. Visible in browser history, server logs, referrer headers.
**Impact**: Token leakage to third parties via Referrer header. Token visible in browser history.
**Solution**: Use `Authorization: Bearer` header and fetch the PDF, then create a blob URL.

### H7. Admin Route Guard Race Condition (HIGH)
**Files**: `src/lib/auth-context.tsx:114-138`
**Root cause**: Sequential RPC calls for admin role verification with window between session check and role fetch where `isAdmin` is false. Users redirected away before role resolves.
**Impact**: Admin users briefly see unauthorized state and may be redirected before role is confirmed.
**Solution**: Keep `loading=true` until both session AND role are resolved.

### H8. Checkout Form Address Validation Bypass (HIGH)
**Files**: `src/routes/checkout.tsx:265-267`
**Root cause**: Raw form values extracted with no validation before sending to payment server functions. Empty/malformed addresses pass through.
**Impact**: Invalid addresses sent to Stripe/PayPal, causing confusing API errors.
**Solution**: Validate all form fields against their Zod schemas before submitting.

### H9. Queue Sequential Processing Blocks All Orders (HIGH)
**Files**: `server/services/queue.ts:100-103`
**Root cause**: Jobs processed in `for...of` loop. One slow job (e.g., PDF generation hanging 30s) blocks all other orders.
**Impact**: Throughput limited by slowest job. Queue backlog during high traffic.
**Solution**: Use `Promise.allSettled()` with concurrency limit, or group by `order_id` and parallelize across different orders.

### H10. Module-Level Mutable State Leaks Across Requests (HIGH)
**Files**: `src/lib/customer-services.ts` — `let cartItems`, `let wishIds`, `let currentUserId`, `Map productRegistry`
**Root cause**: Module-level variables persist across requests on the server (SSR). Two concurrent user requests can leak cart data between users.
**Impact**: User A's cart items appear in User B's checkout. Cross-request data contamination.
**Solution**: Move state to React context or request-scoped storage. Guard all mutations with `isBrowser()` check.

### H11. Edge Function `send-invoice` is Dead Code (HIGH)
**Files**: `supabase/functions/send-invoice/index.ts`
**Root cause**: This Supabase Edge Function exists but all invoice sending logic is now in `server/services/`. The Edge Function is never called from any route or service.
**Impact**: Dead code that must be maintained and deployed. Wastes Edge Function invocation quota.
**Solution**: Delete `supabase/functions/send-invoice/`.

### H12. No Timeout on Admin RPC Calls (HIGH)
**Files**: `src/components/admin/AdminGuard.tsx:33-43`
**Root cause**: `supabase.rpc("has_admin_role")` has no timeout. If RPC hangs, admin users see infinite spinner.
**Impact**: Denial of service for admin dashboard during database issues.
**Solution**: Add timeout wrapper.

### H13. Checkout Effect Has Missing Dependencies (HIGH)
**Files**: `src/routes/checkout.tsx:140`
**Root cause**: `useEffect` deps include `cart` (changes on every snapshot change) and `orderCreating` (causes re-fires). Missing or incorrect deps cause effect to fire multiple times.
**Impact**: Order creation may be attempted multiple times. Race condition between effect instances.
**Solution**: Use refs for values that shouldn't trigger re-execution. Fix dependency array.

### H14. N+1 Query in Admin Customers (HIGH)
**Files**: `server/lib/admin.ts:249-259`
**Root cause**: `orderCounts` returns ALL rows then counts in JS. For customers with hundreds of orders, massive data transfer.
**Impact**: Admin customers page loads slowly.
**Solution**: Use SQL `COUNT(*) ... GROUP BY user_id` or a materialized view.

### H15. Order Success Page Polls Indefinitely (HIGH)
**Files**: `src/routes/order.success.tsx:158-178`
**Root cause**: `setTimeout` recursion with no cleanup on unmount. Callback runs on unmounted component.
**Impact**: Memory leak, React state update on unmounted component warning.
**Solution**: Add `AbortController` or mounted ref check.

---

## MEDIUM ISSUES

### M1. PayPal API Host Hardcoded to Production (MEDIUM)
**Files**: `server/lib/payments.ts:300,314,386`
**Root cause**: `https://api-m.paypal.com` hardcoded. No sandbox support for development.
**Solution**: Use env variable `PAYPAL_API_URL` defaulting to sandbox in development.

### M2. PDF Page Overflow Not Handled (MEDIUM)
**Files**: `server/services/invoice.ts:159-177`
**Root cause**: Items rendered in a loop with no page-break logic. ~30+ items overflow the page.
**Solution**: Add page-break logic checking y-position and creating new pages.

### M3. Storage `exists()` Uses Prefix Search (MEDIUM)
**Files**: `server/services/storage.ts:45-52`
**Root cause**: `supabase.storage.list("", { search: path })` is prefix search, not exact match.
**Solution**: Use proper path-based existence check or list with correct prefix.

### M4. Circular References Crash Logger (MEDIUM)
**Files**: `server/lib/logger.ts:31`
**Root cause**: `JSON.stringify(entry)` throws on circular objects.
**Solution**: Use `safe-stable-stringify` or custom replacer.

### M5. PDF Generation Called on Every Upload (MEDIUM)
**Files**: `server/services/invoice.ts:283`
**Root cause**: `ensureBucket()` called on every PDF upload, even though already done during container init.
**Solution**: Remove redundant call.

### M6. Queue Handler Overwrite Warning Missing (MEDIUM)
**Files**: `server/services/queue.ts:60-62`
**Root cause**: `register()` silently overwrites existing handlers.
**Solution**: Add warning on overwrite.

### M7. Weak Whitespace Key Validation (MEDIUM)
**Files**: `server/services/email.ts:29-36`
**Root cause**: `if (env.resendApiKey)` — truthy check passes for `" "` (whitespace-only key).
**Solution**: Add `.trim().length > 0` check.

### M8. `process.env.PUBLIC_APP_URL` Direct Read (MEDIUM)
**Files**: `src/lib/payments.ts:128`
**Root cause**: Reads `process.env` directly instead of using `env.publicAppUrl`.
**Solution**: Use `env.publicAppUrl` from container.

### M9. Multiple Product Data Sources (MEDIUM)
**Files**: `src/lib/products.ts` (static), `src/lib/products-db.ts` (DB), `src/lib/categories.ts` (DB), `productRegistry` (runtime registry)
**Root cause**: Three independent product data sources show different products on different pages.
**Impact**: Homepage shows 6 products, category pages show DB products. Inventory data mismatch.
**Solution**: Consolidate to single DB-backed source. Remove static catalog.

### M10. Hardcoded Coupon Code (MEDIUM)
**Files**: `src/routes/cart.tsx:118`
**Root cause**: `"ANORA10"` hardcoded client-side. Purely cosmetic — doesn't affect Stripe payment.
**Impact**: Users discover code from source. No server verification.
**Solution**: Implement server-side coupon validation or remove.

### M11. ProductRegistry Memory Leak (MEDIUM)
**Files**: `src/lib/categories.ts:164-183`
**Root cause**: `registerProduct()` called on every render, Map grows unboundedly.
**Solution**: Limit registry size or implement LRU eviction.

### M12. No Error Boundary in Admin Layout (MEDIUM)
**Files**: `src/components/admin/AdminLayout.tsx`
**Root cause**: No React error boundary. Any admin component crash takes down the panel.
**Solution**: Add error boundary.

### M13. `fetchAdminRole` Catches Errors Silently (MEDIUM)
**Files**: `src/lib/auth-context.tsx:100-110`
**Root cause**: Bare `catch { return null; }` — errors during admin verification completely swallowed.
**Solution**: Log errors.

### M14. `sessionStorage.clear()` on SignOut (MEDIUM)
**Files**: `src/lib/auth-context.tsx:41`
**Root cause**: Clears ALL sessionStorage, not just auth data.
**Solution**: Clear only auth-specific keys.

### M15. Hard Page Navigations Instead of React Router (MEDIUM)
**Files**: `src/routes/login.tsx:32,61`, `src/routes/reset-password.tsx:50-51`
**Root cause**: `window.location.href = ...` causes full page reload.
**Solution**: Use `useNavigate()`.

### M16. `logger.ts` `toJSON()` Secret Overflow (MEDIUM)
**Files**: `server/config/env.ts:163-165`
**Root cause**: `toJSON()` returns all vars including secrets.
**Solution**: Filter secrets.

### M17. Migration 033 Creates Redundant Function (MEDIUM)
**Files**: `supabase/migrations/033_replace_require_admin_with_is_admin.sql`
**Root cause**: Creates new `require_admin` function without dropping the old one. Function overloading creates ambiguity.
**Solution**: Explicitly `DROP FUNCTION IF EXISTS require_admin()` before CREATE.

### M18. Sync I/O During Module Loading (MEDIUM)
**Files**: `server/config/env.ts:1-3`
**Root cause**: `readFileSync` in `loadDotEnv()` blocks event loop during module initialization.
**Impact**: Cold-start delay on serverless.
**Solution**: Consider async file reading.

---

## LOW ISSUES

### L1. Dead `import.meta.env` Branch (LOW)
**Files**: `server/lib/env.ts:50-51`
**Notes**: Never executes in Node.js. Remove.

### L2. Wrong Customer Name Source (LOW)
**Files**: `server/lib/admin.ts:178-186`
**Notes**: Uses shipping name instead of profile name. Join with `profiles` table.

### L3. Undocumented Fallback (LOW)
**Files**: `server/config/env.ts:119-121`
**Notes**: `SUPABASE_URL` fallback not documented in REQUIRED_VARS.

### L4. Silent Error in Payment Session Update (LOW)
**Files**: `server/lib/order-lifecycle.ts:260-264`
**Notes**: Update result not checked for errors.

### L5. Unsync'd Singleton Initialization (LOW)
**Files**: `server/container/index.ts:221-226`
**Notes**: No locking for concurrent access during ESM initialization.

### L6. Redundant `ensureBucket()` Call (LOW)
**Files**: `server/services/invoice.ts:283`
**Notes**: Already called during container init.

### L7. Duplicate `slugify` Function (LOW)
**Files**: `src/lib/admin-products.ts:362-367`, `src/lib/admin-categories.ts:73-78`
**Notes**: Extract to shared utility.

### L8. Unused Imports (LOW)
**Files**: `src/routes/__root.tsx`, `src/routes/admin.tsx`
**Notes**: Various unused imports.

### L9. FormatRelativeTime No Memo (LOW)
**Files**: `src/routes/admin.tsx:196-206`
**Notes**: Recalculates on every render.

### L10. Product Loader Throws Undefined (LOW)
**Files**: `src/routes/product.$slug.tsx:16-17`
**Notes**: Loader throws `notFound()` but RPC throw becomes unhandled rejection.

### L11. Size Guide Hardcoded for Clothing Only (LOW)
**Files**: `src/routes/product.$slug.tsx:557-570`
**Notes**: Jewellery products show clothing measurements.

### L12. SearchDialog Returns Null (LOW)
**Files**: `src/components/site/SearchDialog.tsx:42`
**Notes**: Unmounts fully on close, losing internal state (intentional but notable).

### L13. Unused Admin Components Fetch on Every Page (LOW)
**Files**: `src/routes/admin.tsx:6-7`
**Notes**: Components imported at top but only rendered on dashboard; their data fetches run on every admin page.

### L14. Emoji Rendering in Email (LOW)
**Files**: `server/templates/index.ts:576-579`
**Notes**: Unicode emoji in email templates — Outlook renders none.

### L15. Firebase Admin SDK Dependency (LOW)
**Files**: `package.json`
**Notes**: Listed but unused. Remove.

---

## ARCHITECTURAL ISSUES

### A1. Dual Product Data Sources (ARCH)
**Files**: `src/lib/products.ts` (static), `src/lib/products-db.ts` (DB), `src/lib/categories.ts` (DB), `productRegistry` (runtime)
**Impact**: Homepage shows 6 products; category pages show DB products. Inconsistent.

### A2. Module-Level Mutable State in customer-services.ts (ARCH)
**Files**: `src/lib/customer-services.ts`
**Impact**: Cross-request state leakage in SSR. Cart data can leak between users.

### A3. No Guest Cart Persistence (ARCH)
**Files**: None — no server-side guest cart storage exists
**Impact**: Guest carts lost on browser data clear. No cross-device support.

### A4. Service Locator Anti-Pattern in Email Service (ARCH)
**Files**: `server/services/email.ts` + `server/container/index.ts`
**Impact**: Fragile initialization order. Module-level `supabaseAdmin` set via `initEmailService()`.

### A5. Two Supabase Admin Clients (ARCH)
**Files**: `server/lib/supabase-admin.ts` (legacy) + `container.supabase` (new)
**Impact**: Two clients with potentially different configurations.

### A6. Inventory Logic Duplicated in Three Places (ARCH)
**Files**: `src/lib/inventory-engine.ts` (client), `server/lib/cart-validation.ts` (server), Database RPCs
**Impact**: Changes must be synchronized across three codebases.

### A7. Dead Code Accumulation (ARCH)
**Files**: 17 files removed in Phase 3 refactor, but Edge Function and old migrations remain
**Impact**: Maintenance burden.

### A8. No Database Transaction Wrapper (ARCH)
**Files**: All supabase.rpc() calls are individual, not transactional
**Impact**: No atomic multi-step operations.

---

## PHASED REFACTOR PLAN

### Phase 1 — Critical Architecture (Week 1)
Priority: Ship-blocking, production-crashing issues only.

1. ~~Fix `src/lib/payments.ts` client/server import violation~~ (ALREADY DONE — verified current code)
2. Delete `server/lib/env.ts` — eliminate dual env system
3. Rewrite `server/lib/supabase-admin.ts` — lazy initialization, use `config/env.ts`
4. Delete `server/services/email.ts` line 206 — remove module-level `emailService` singleton
5. Fix `server/services/email.ts` `checkDuplicate()` — replace `head: true` + `.limit(1)` with `.maybeSingle()`
6. Add `import crypto from "node:crypto"` to `server/services/invoice.ts`
7. Fix `server/services/storage.ts` `ensureBucket()` — wrap in try-catch
8. Fix `server/config/index.ts` Stripe API version — use valid version string
9. Fix `server/lib/payments.ts` — use `stripe.webhooks.constructEvent()` for webhook verification
10. Fix `server/lib/order-lifecycle.ts` — pass shipping/tax through to email data

**Verification**: `npm run build` passes, Stripe test payment succeeds end-to-end.

### Phase 2 — Business Logic (Week 2)
Critical bugs in business logic that cause wrong behavior.

1. Fix `server/lib/admin.ts` — escape SQL LIKE wildcards in search
2. Fix `server/lib/order-lifecycle.ts` — replace bare `throw new Error()` with typed errors
3. Fix DLQ error handling in `server/services/queue.ts`
4. Fix signed URL parsing in `server/services/invoice.ts`
5. Fix `src/lib/customer-services.ts` — use upsert instead of delete-then-insert
6. Fix `src/routes/checkout.tsx` — validate form inputs before sending
7. Fix `src/lib/auth-context.tsx` — keep loading until admin role resolved
8. Fix `src/routes/checkout.tsx` — remove TRACE logs
9. Fix `src/routes/account.tsx` — use Authorization header for PDF download
10. Fix `src/routes/order.success.tsx` — add cleanup for polling timeout

### Phase 3 — Database (Week 3)
Database migrations, function correctness, and idempotency.

1. Create migration 045: `SET search_path = 'public'` on `decrement_checkout_stock`, `flag_low_stock_products`, `flag_low_stock_variants`
2. Create migration 046: Drop old `require_admin()` function
3. Audit all 44 migrations for idempotency gaps
4. Add missing indexes on foreign key columns
5. Delete `supabase/functions/send-invoice/` (dead Edge Function)
6. Add timeout/retry to RPC calls in `admin.ts`

### Phase 4 — Payments (Week 3)
Payment flow hardening and dual-path cleanup.

1. Rewrite `createStripeCheckoutSession()` using Stripe SDK
2. Make PayPal host configurable via env var
3. Add Zod validation to webhook payload metadata
4. Implement proper idempotency key prefixing from config
5. Add shipping/tax extraction from PaymentIntent metadata

### Phase 5 — Inventory (Week 4)
Eliminate duplicate inventory logic.

1. Consolidate `src/lib/inventory-engine.ts` to single source of truth
2. Ensure RPC inventory logic matches client-side logic exactly
3. Remove dead `decrementStockSafe()` client-side function
4. Fix duplicate product data sources — rely on DB only

### Phase 6 — Emails (Week 4)
Email system hardening.

1. Remove module-level `emailService` singleton (verify all consumers use container)
2. Pass `supabase` as constructor parameter to `EmailService`
3. Replace emoji icons with inline SVGs in email templates
4. Add attachment filename sanitization

### Phase 7 — Security & Performance (Week 5)
Security hardening and performance optimization.

1. Filter secrets in `env.toJSON()`
2. Add input validation to all admin API routes
3. Add N+1 query fixes for admin customers
4. Add concurrency limit to queue processing
5. Replace hard page navigations with React Router
6. Fix `sessionStorage.clear()` to scope to auth keys only
7. Add error boundaries to admin layout

### Phase 8 — Cleanup (Week 5)
Technical debt and dead code removal.

1. Remove all unused imports across codebase
2. Extract duplicate `slugify` to shared utility
3. Remove `firebase-admin` dependency if unused
4. Clean up remaining `console.log` statements
5. Add `safe-stable-stringify` to logger
6. Document remaining env var fallbacks
7. Remove redundant `ensureBucket()` call

---

## VERIFICATION CHECKLIST

After all phases:

- [ ] `npm run build` passes with zero errors
- [ ] `npx eslint .` shows zero errors in refactored files
- [ ] Stripe PaymentIntent flow creates order, invoice, jobs, emails
- [ ] Webhook creates order independently
- [ ] Email duplicate prevention works (test with webhook replay)
- [ ] PDF download works with Authorization header
- [ ] Cart sync works with upsert (no data loss on failure)
- [ ] Admin dashboard loads for admin users (no race condition)
- [ ] Queue processes jobs with concurrency (no blocking)
- [ ] No secret leakage in logs or error responses
- [ ] No `console.log` in production code paths
- [ ] All env vars validated at startup (fail fast)
- [ ] No module-level state leakage across SSR requests
