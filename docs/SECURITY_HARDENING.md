# ANORA Security Hardening Log — Batch 1 & 2

Branch: `security/hardening-batch-1` · Migrations: `20260801000000_*`, `20260801000100_*` · Rollback: `supabase/rollback/20260801000000_rollback.sql`

This file records **what was changed, why, whether it was proven to work, and why that approach was chosen over the alternatives.** PayPal webhook configuration is intentionally left for you (needs the Business account); only PayPal *logic* that created vulnerabilities was fixed.

---

## 0. How this was verified (and what that does NOT cover)

| Layer | Method | Result |
|---|---|---|
| Database | Replayed all 69 migrations into a local Postgres with Supabase-style roles (`anon`, `authenticated`, `service_role`, `authenticator`), then attacked it **as each role through `SET ROLE`, connected as `authenticator` exactly like PostgREST does** | Before: **17 of 23 attacks succeeded**. After: **0 of 31** succeed |
| Every admin RPC | Automated sweep calls each of the 83 wrapped functions as anon, as a normal customer and as an admin | 166/166 non-staff calls denied, 83/83 admin calls reach the function, 0 failures |
| Legitimate flows | Regression cases: admin RPCs, service-role order creation + job queue, customer cancel own order, guest success page, catalog reads, tracking lookup, login lockout | all still pass |
| App code | `tsc --noEmit` clean, production `vite build` succeeds, 18 unit tests pass (`npx tsx --test tests/*.test.ts`) | pass |
| Security headers | Confirmed present in generated `.vercel/output/config.json` | present |

**Not covered (be aware):** local DB is PostgreSQL 16 (Supabase prod is 17), so `get_customers_management` could only be checked up to its permission guard; nothing was run against your live Supabase, Stripe or PayPal; I did not click through the admin UI in a browser. Therefore: **deploy to a staging/preview first** and run the smoke test in section 5.

---

## 1. Corrections to my earlier audit

- The wider scan found the database exposure was **bigger** than first reported: about **100 SECURITY DEFINER functions** were callable by anonymous users (not 7). Examples proven in the local replica: an anonymous caller ran `bulk_delete_products`; a logged-in customer created a **$9,999 gift card**, generated invoices, read the revenue report and cancelled someone else's order by claiming to be "staff".
- `device_sessions` was **already fixed** by a later migration (no open policy remains) — my earlier C-6 claim about it was stale.
- `update_order_status` / `adjust_stock` already contained an admin check — they were not the problem. They are still wrapped (harmless double guard).

---

## 2. Fixes, in the order applied

### Batch 1 — Database (most critical)

**B1-1 · Anyone could create "paid" orders (was C-1)**
- *Problem:* `create_order_from_payment` was executable by `anon`. It takes price/total/items as plain parameters, so a direct API call created confirmed `$0.01` orders and drained stock. **Reproduced:** two calls (anon + ordinary user) produced two confirmed $0.01 orders and dropped stock 10 → 7.
- *Fix:* execute rights removed from `PUBLIC/anon/authenticated`; only `service_role` (your server) may call it. Same for the other server-only functions (job queue, invoice/order numbers, refund completion, payment logging, inventory reservation, dashboard stats) and for all trigger functions.
- *Verified:* attack now returns `permission denied for function create_order_from_payment`; the server's service-role order creation still succeeds.
- *Why this over alternatives:* the server already uses the service key, so revoking changes nothing for real checkouts. Adding "validate payment inside the function" would still leave a public endpoint that mutates stock.

**B1-2 · ~83 admin/analytics/management RPCs had no caller check (was C-3)**
- *Fix:* each original function is moved into a private schema (`app_private`, not exposed by the API) and re-published **under the same name, arguments, return type and volatility** behind `assert_staff()`. Staff = any row in `admin_roles` (same meaning as the RLS `is_staff()` and the server's `verifyAdminAccess`), or the service key, or a direct DB session (SQL editor / pg_cron).
- *Verified:* sweep results in section 0; admin panel RPCs keep their exact signatures, so the front-end code is unchanged.
- *Why this over alternatives:* hand-editing 83 function bodies (many are `LANGUAGE sql`, which cannot hold an `IF`) is slow and error-prone; a generated wrapper is uniform, testable by one sweep, and trivially reversible. Revoking `authenticated` outright would have broken the admin panel, which calls these from the browser with the admin's session.
- *Idempotent:* re-running the migration skips already-wrapped functions.

**B1-3 · Customer-facing RPCs with broken ownership checks**
- `get_order_details`: any anonymous caller could read any order (name, email, phone, addresses, **internal staff notes**). Now: owner, staff, service, or a *guest* order (its UUID is the capability the success page relies on). `internal_notes` are removed for non-staff. *Verified:* anon/other customer denied; owner works; guest works; admin still sees `internal_notes`.
- `cancel_order`: passing `p_cancelled_by = 'staff'` skipped the ownership check, so anyone could cancel anyone's order. Identity is now derived from the session, not the label.
- `request_refund`: used `user_id != auth.uid()`, which is NULL (=allowed) for guests/anon. Replaced with `IS DISTINCT FROM`.
- `create_return_request`, `end_user_session`: now require ownership or staff.
- *Why:* these are legitimately used by customers, so they must stay callable but must verify who is asking.

**B1-4 · Over-permissive row-level security (was C-6)**
- Removed customers' ability to **INSERT/UPDATE rows in `orders` / `order_items` directly** (could rewrite `total`, `payment_status`). Orders are only created by the server. The admin panel is unaffected (staff policy retained).
- Closed `INSERT`/`UPDATE ... true` policies on `audit_logs`, `admin_activity`, `failed_login_attempts`, `background_jobs`, `abandoned_carts(_items)` (anyone could forge logs or mark jobs complete); writers are server/definer code which bypass RLS.
- `gift_cards` and `coupons` were **readable by everyone** (every gift-card code + balance, every private coupon code) → staff only. `review_tokens` readable by everyone (lets anyone write a "verified" review) → removed. Customers writing `reviews` rows directly (bypassing moderation) → removed; the server function is the only path. Blog comments must be inserted unapproved.
- `notifications` / `inventory_logs` inserts restricted to staff (the admin panel inserts inventory logs from the browser).
- *Verified:* each attack in `supabase/tests/attack_suite.sql` is denied; admin reads/writes still work. Server code was checked: every one of these tables is written via the service key or definer functions.

**B1-5 · Latent bug fixed on the way:** `create_order_from_payment` passed a text id to `log_payment_event(uuid)` on the out-of-stock path, raising "function does not exist" instead of the intended message. Added a safe text overload.

### Batch 2 — Application code

**B2-1 · PayPal trusted the browser for price and items (was C-2)** — *logic fixed, integration untouched*
- *Problem:* `createOrderFromPayPal` captured the payment, then built the order from client-supplied items/discount, with `unitPrice 0`, blank names and `total 0`. A buyer could pay for a cheap PayPal order and submit an expensive cart.
- *Fix:* one server-side `buildPayPalQuote()` (database prices + server-validated coupon) is used both when the PayPal order is created and when it is verified. Before capturing, the server reads the order **from PayPal** and requires `USD`, `APPROVED/COMPLETED` and an amount equal **to the cent**; the captured amount is checked again. The order is stored from validated items/prices (so no more `$0` orders with blank names). The browser's `discountAmount` is ignored.
- *Verified:* unit tests with a mocked PayPal API: $1 order vs $2,500 cart rejected; one-cent mismatch rejected; wrong currency, unapproved and NaN rejected; malformed IDs never hit the network.
- *Also fixed here:* the approve flow captured **twice** (browser, then server), and PayPal rejects a second capture, so completed payments could fail to create orders. Capture is now idempotent (checks status first, sends a `PayPal-Request-Id`). The coupon path sent a discounted `item_total` that does not equal the item sum, which PayPal rejects; it now sends a proper `discount` breakdown line.
- *Why not capture after the webhook only?* That is the right long-term design (see section 4) but needs your Business account webhook; this fix is safe now and compatible with it later.

**B2-2 · PayPal webhook accepted unsigned requests (was C-4)** — now **fails closed**: no `PAYPAL_WEBHOOK_ID` → `503`, bad signature → `400`. Nothing changes for you today (PayPal isn't sending webhooks yet). When you configure the webhook, set `PAYPAL_WEBHOOK_ID` and it works.

**B2-3 · Stripe webhook double-processing (was H-9)** — the old "select then update" claim let two simultaneous deliveries both run side effects. Now a single conditional `UPDATE` claims the event; a concurrent delivery gets `409` so Stripe retries later; crashed claims expire after 2 minutes. Internal error text is no longer returned to the caller; admin emails escape interpolated values.

**B2-4 · Anyone with a PaymentIntent id could modify it (was H-3)** — `updatePaymentIntent` now requires the intent's **client secret** (proof the caller is the checkout that created it) and that the intent is still unpaid. `checkout.tsx` passes it. *Note:* a browser tab left open from before the deploy must be refreshed once.

**B2-5 · Rate limiting (was H-2)** — a Postgres-backed fixed-window limiter (works across serverless instances) protects PaymentIntent create/update, tax calculation, Stripe checkout session, PayPal create/verify. It **fails open** if the limiter itself errors, so it can never block a checkout. *Verified:* 4th call in a window is refused; anon/authenticated cannot call it. Limits are in the code (20–60 per 10 minutes per IP).
- *Why DB-backed:* in-memory counters don't work on serverless (each instance has its own). Upstash/Vercel WAF are good additions but need extra accounts.

**B2-6 · Coupon edge cases (was H-7)** — one shared function clamps percentage to 0–100 and fixed discounts to the subtotal, so totals can't go negative. Unit-tested.

**B2-7 · Admin definition mismatch & broken invoice access (was H-4/H-5)** — the invoice route read `profiles.is_staff`, **a column that doesn't exist**, so staff were always refused; another path used `profiles.role`. Both now use `admin_roles`. The `?token=` query-string fallback was removed (tokens leak into logs/history). `getContainer()` without initialisation (a cold-start crash risk) replaced by `initContainer()`.

**B2-8 · Image upload hardening (was M-2)** — WebP files were stored **without any validation** (any bytes named .webp), no size cap. Now every upload is decoded with `sharp`, must be a real JPEG/PNG/WebP, max 8 MB / 4000 px, EXIF (GPS) stripped, re-encoded to WebP. SVG/HTML/GIF rejected. 11 unit tests. Error messages no longer expose storage/database internals.

**B2-9 · Security headers (was M-3)** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `HSTS` enforced; **CSP is Report-Only on purpose** so it cannot break Stripe/PayPal/Supabase. Review browser-console reports on staging, then rename the header to `Content-Security-Policy` to enforce.

**B2-10 · Repo hygiene (was M-7)** — `.gitignore` now ignores `.env.*` (keeps `.env.example`); `.env.example` added.

---

## 3. Why some risky things were deliberately **not** changed

- Checkout, cart and order **business logic** was not rewritten; changes are additive guards so working flows keep working.
- `check_login_lockout` / `record_failed_login` stay public (the login screen needs them before authentication).
- Public inserts on `contact_messages`, `newsletters`, `blog_views` stay (public forms) — they need rate limiting/CAPTCHA.
- CSP not enforced (see B2-9).

---

## 4. Still open (not fixed in these batches)

| Item | Why it matters | Next step |
|---|---|---|
| PayPal "paid but no order" if the tab closes after capture | customer charged, no order | after you configure PayPal webhook: create the order from the stored server quote on `PAYMENT.CAPTURE.COMPLETED`. The current webhook looks up `custom_id`, which the order never sets, so it also needs that wiring |
| Background jobs use in-process timers | emails/invoices may not run on Vercel | Vercel Cron / pg_cron calling a protected endpoint |
| Coupon `used_count` is read-modify-write | `max_uses` can be exceeded under concurrency | move redemption into the order transaction |
| `record_failed_login` public | attacker can lock a victim's email out for 15 min | server-side lockout with IP + email |
| Stripe Checkout Session path | cart JSON in metadata (500-char Stripe limit), US-only | remove it or store cart server-side |
| Shipping always 0, tax fails open to 0 | undercharging | admin shipping zones; block checkout when tax can't be computed |
| `get_order_by_tracking_id` secrecy | guessable IDs would leak order content | confirm generator uses ≥128-bit randomness |
| `xlsx@0.18.5`, beta Nitro, 2 lockfiles (`package-lock.json` is out of sync: `npm ci` fails) | supply-chain / deploy | replace xlsx, pick one package manager |
| Catalog loads whole product table on every page, image dimensions, fonts | performance under traffic | see audit section 4 |
| Placeholder content, newsletter that stores nothing | trust/legal | see audit section 5 |

---

## 5. Deployment runbook

1. **Back up** (Supabase → Database → Backups, or `pg_dump`).
2. **Before** migrating, run on the live DB and save the output (this is your before/after evidence):
   ```sql
   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_run
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
   order by 1;
   ```
3. Apply, **in order**, on a Supabase **preview branch / staging project first**: `20260801000000_security_hardening_rpc_and_rls.sql`, then `20260801000100_rate_limit_and_hardening_followups.sql`. The DB change is backwards-compatible with the currently deployed app (server uses the service key; admin panel keeps the same RPC names).
4. Re-run the query from step 2: the list should contain only the intentional public functions (`has_admin_role`, `is_admin`, `is_staff`, `get_order_details`, tracking, login-lockout helpers, etc.).
5. Deploy the app (Vercel preview first). Set `PAYPAL_WEBHOOK_ID` when ready.
6. **Smoke test** (Stripe/PayPal test mode): admin login → Dashboard, Orders, Customers, Inventory, Coupons, Gift cards, Invoices, Reviews load; place a guest order and a logged-in order with a card; success page shows the order; customer cancels own pending order; admin changes status; invoice PDF opens for customer and for admin; PayPal sandbox order completes once with the correct total; upload a product image (JPG, PNG, WebP).
7. Watch Vercel logs for `403`/`permission denied` from an admin screen — it means a page calls an RPC with a role you did not expect; tell me the function name.
8. **Rollback:** `supabase/rollback/20260801000000_rollback.sql` restores the previous (insecure) behaviour; redeploy the previous app build. Use only if a critical flow breaks and cannot be fixed forward.
9. Run the permanent tests any time: `supabase/tests/run_all.sh` (needs a local Postgres with the role shim) and `npx tsx --test tests/*.test.ts`.

### Rotate secrets if the repo was ever public
If `brain/`, `AUDIT.md` or `structure.txt` were public, treat them as disclosed. No secrets were found committed, but rotate Supabase service key, Stripe, Resend and PayPal keys as routine hygiene before launch.

---

## 6. Batch 3 — remaining critical items (branch `security/hardening-batch-2`)

Migration: `20260801000200_paypal_sessions_and_coupon_atomic.sql` (additive; no existing object is changed except the tracking-id generator).

| # | Problem | Fix | Verified | Why this approach |
|---|---|---|---|---|
| B3-1 | **PayPal "charged but no order"** if the tab closes after payment | When the PayPal order is created the server stores the *validated* cart/prices/addresses (`paypal_checkout_sessions`, service-role only). The signature-verified webhook (`PAYMENT.CAPTURE.COMPLETED`) now reads the PayPal order id from `supplementary_data.related_ids.order_id`, checks the captured amount equals the stored total, and creates the order through the same idempotent function the browser uses | Typechecks; table access verified (anon/customer cannot read or forge sessions). **The webhook path itself is untested end to end** — it needs a real PayPal webhook; test in sandbox once `PAYPAL_WEBHOOK_ID` is set | Re-using the stored server quote means the webhook never trusts the browser or PayPal's payload for *what* was bought, only for *that money arrived*. Safe now: the webhook is closed until configured |
| B3-2 | PayPal duplicate-order lookup checked a column the order function never fills | Lookup now also checks `stripe_payment_intent_id = 'paypal_<id>'` (where it is really stored); the unique index on that column already stops true duplicates | Typechecks | Needed so browser + webhook can both run without double orders |
| B3-3 | **Sold out after payment → customer charged, no order**, Stripe retrying forever | Stripe webhook detects the "insufficient stock" failure and refunds the PaymentIntent in full automatically (idempotency key `oos-refund-<pi>`), emails the admin, marks the event handled | Typechecks; logic reviewed against the exact error text in the order function. **Not run against Stripe** — test with a test-mode card and a 1-unit product | A refund is the only outcome that is correct for the customer; leaving it to manual work loses money/trust. Idempotency key makes retries safe. (PayPal has the same gap; it needs a PayPal refund call — still open) |
| B3-4 | Background jobs depend on timers that don't run on serverless | New `GET /api/cron/process-jobs` runs the queue once. Requires `Authorization: Bearer $CRON_SECRET` (≥16 chars), constant-time compare, **disabled (503) if the secret is unset** | Typechecks; job claiming is already atomic so it is safe next to the old timers | A scheduler calling a protected endpoint is the standard serverless pattern. I did **not** add `vercel.json` crons: Vercel's free plan only allows daily crons and a faster schedule makes the *deploy fail*. Use Supabase `pg_cron` + `pg_net` (free), Vercel Cron (Pro), or any external pinger every 1-5 minutes |
| B3-5 | Coupon `used_count` read-modify-write (lost updates; `max_uses` exceeded) | `increment_coupon_usage()` does one atomic conditional UPDATE | Tested: limit 2 → true, true, false; count stays 2; anon cannot call | Single SQL statement is atomic without locks. (Strict *pre-payment* reservation would be larger work) |
| B3-6 | Guest tracking id: 8 chars (~40 bits) from `random()` on a public lookup | New ids: 16 hex chars (64 bits) from the CSPRNG behind `gen_random_uuid()`; old ids still resolve; UI has no length assumptions | Generated sample `498A22E607D14185`; lookup unchanged | Stronger without breaking existing tracking links |
| B3-7 | Newsletter form showed "confirmed" but saved nothing | Inserts into the existing `newsletters` table (public insert policy already exists); duplicate emails are treated as success so the list isn't revealed | Anonymous insert verified on the test DB | Uses what's already in the schema |

**Enable after deploying:** set `CRON_SECRET` (random 32+ chars) in Vercel, then schedule the endpoint, e.g. Supabase SQL (replace values):
```sql
select cron.schedule('anora-jobs', '* * * * *', $$
  select net.http_get(url := 'https://YOUR-DOMAIN/api/cron/process-jobs',
                      headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')); $$);
```

**Deliberately not changed (would risk breaking working flows):** tax fail-open and shipping rates (need a business decision on rates), `record_failed_login` lockout (needs server-side redesign), Stripe Checkout Session path (appears unused; remove after confirming), PayPal automatic refund on out-of-stock, strict coupon pre-payment reservation.
