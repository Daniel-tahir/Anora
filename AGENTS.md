<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Setup

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run the Supabase migration scripts in `supabase/migrations/` to set up the database schema, RLS policies, and triggers.

## Architecture

### Backend Refactor (Phase 3 — Complete Rewrite)

The entire backend was rewritten to eliminate patch accumulation, hidden dependencies, and initialization order bugs. No compatibility shims, no temporary fixes, no dead code.

### New File Structure

```
server/
├── config/
│   ├── index.ts          # App configuration (retries, timeouts, buckets, etc.)
│   └── env.ts            # Single env reader — typed, validated, singleton
├── container/
│   └── index.ts          # DI container — deterministic startup sequence
├── lib/
│   ├── admin.ts          # Admin auth/dashboard/stats (unchanged)
│   ├── cart-validation.ts # Cart validation (unchanged)
│   ├── env.ts            # DELETED (replaced by config/env.ts)
│   ├── errors.ts         # Typed error classes (ApplicationError, QueueError, etc.)
│   ├── logger.ts         # Structured JSON logger (no console.log)
│   ├── order-lifecycle.ts # Order creation via RPC + container
│   ├── payments.ts       # PaymentIntent/PayPal/webhook verification + container
│   ├── stripe.ts         # DELETED (stripe lives in container)
│   ├── supabase-admin.ts # KEPT for backward compat (cart-validation.ts, admin.ts)
│   └── totals.ts         # Price calculations (unchanged)
├── routes/api/
│   ├── admin/…           # Admin API routes (unchanged)
│   ├── invoice/[id]/pdf.get.ts # UPDATED — uses container + InvoiceService
│   └── stripe/webhook.post.ts  # UPDATED — uses container + logger
├── services/
│   ├── email.ts          # REWRITTEN — EmailService with idempotency, logging
│   ├── invoice.ts        # NEW — InvoiceService: generate PDF, upload, download
│   ├── queue.ts          # REWRITTEN — single worker, atomic claiming, no recursion
│   ├── storage.ts        # NEW — StorageService: upload/download/signed-url/bucket
│   ├── scheduler.ts      # DELETED (replaced by queue.start())
│   ├── audit-logger.ts   # DELETED (replaced by structured logger)
│   ├── email-webhooks.ts # DELETED (dead code)
│   ├── cleanup.ts        # DELETED (dead code)
│   ├── notification.ts   # DELETED (dead code)
│   ├── payment-state-machine.ts # DELETED (dead code)
│   └── inventory-reservation.ts # DELETED (dead code)
├── interfaces/           # DELETED (types inlined in services)
├── providers/
│   └── resend.ts         # DELETED (Resend initialized inside EmailService)
└── templates/
    └── index.ts          # Email HTML templates (unchanged)
```

### Deterministic Startup Sequence

```
1. Load Environment (config/env.ts) — reads .env + process.env, validates required keys
2. Initialize Services (container/index.ts):
   a. Supabase admin client
   b. Stripe SDK
   c. StorageService (ensures invoice-pdfs bucket exists)
   d. EmailService (warns if Resend not configured, does NOT crash)
   e. InvoiceService (depends on StorageService)
   f. QueueService with job handlers registered
3. Queue starts polling (queue.start()) — runs in src/server.ts on first request
4. Routes registered by TanStack Start framework
5. Server starts
```

No singleton initializes during module import. All dependencies are injected through the container constructor.

### Key Design Decisions

- **Single env reader**: `server/config/env.ts` — never read `process.env` directly elsewhere. Typed accessors (`env.stripeSecretKey`, `env.supabaseUrl`, etc.). Fails fast on missing required vars.
- **Dependency injection**: `ServerContainer` constructs all services in dependency order. Services receive dependencies via constructor. No hidden imports.
- **Structured logging**: `logger.info()`, `logger.error()`, etc. Output JSON lines. Every log entry has `timestamp`, `level`, `message`, optional `context`. No `console.log`.
- **Typed errors**: `ApplicationError`, `ValidationError`, `InfrastructureError`, `QueueError`, `EmailError`, `StorageError`, `PaymentError`, `InventoryError`, `AuthenticationError`, `NotFoundError`.
- **Queue: single worker, atomic claiming**: `QueueService.execute()` claims a job via `UPDATE ... WHERE status='pending'` (optimistic lock). If another worker already claimed it (no rows updated), returns false. No recursion — scheduler polls on interval. No duplicate execution.
- **Job idempotency**: Each job handler checks if work is already done before executing. Email sending checks `email_logs` for duplicate. Invoice creation checks for existing invoice.
- **Email service**: `EmailService.sendWithLogging()` handles idempotency check + logging + sending in one method. If Resend API key is missing, logs warning and returns — no runtime retries.
- **Invoice service**: `InvoiceService` generates PDF, uploads to storage, returns signed URL. PDF download route delegates to `InvoiceService.downloadPdf()`. No storage internals exposed in routes.
- **Queue handlers registered in container**: `container/index.ts` registers all 7 job handlers. Each handler uses only the services it needs (via container properties).

### Relevant Files (New/Modified)
- `server/config/env.ts` — Typed env reader, singleton
- `server/config/index.ts` — App configuration constants
- `server/container/index.ts` — DI container, startup sequence, job handler registration
- `server/lib/errors.ts` — Typed error hierarchy
- `server/lib/logger.ts` — Structured JSON logger
- `server/lib/payments.ts` — Uses container + env instead of direct imports/readEnv
- `server/lib/order-lifecycle.ts` — Uses container (supabase, stripe, queue) + typed errors
- `server/services/invoice.ts` — Invoice + PDF generation in one cohesive service
- `server/services/storage.ts` — Storage abstraction (upload/download/signedUrl/bucket)
- `server/services/email.ts` — Email service with idempotency, logging, Resend integration
- `server/services/queue.ts` — Queue service with atomic claiming, no recursion
- `server/routes/api/stripe/webhook.post.ts` — Uses container + logger
- `server/routes/api/invoice/[id]/pdf.get.ts` — Uses container + InvoiceService
- `src/server.ts` — Uses container (initContainer + queue.start()) instead of old scheduler
- `src/lib/payments.ts` — Uses container for auth instead of direct supabase-admin import

### Removed (Dead Code)
- `server/lib/stripe.ts` (replaced by container.stripe)
- `server/lib/email.ts` (shim to old email service — deleted)
- `server/lib/email-templates.ts` (shim to templates/index — deleted)
- `server/lib/job-queue.ts` (shim to old queue — deleted)
- `server/lib/pdf.ts` (inline PDF gen moved to InvoiceService)
- `server/lib/invoice-storage.ts` (replaced by StorageService + InvoiceService)
- `server/lib/env.ts` (replaced by config/env.ts)
- `server/providers/resend.ts` (Resend initialized inside EmailService)
- `server/services/scheduler.ts` (replaced by queue.start())
- `server/services/audit-logger.ts` (replaced by structured logger)
- `server/services/email-webhooks.ts` (dead code — not called from routes)
- `server/services/cleanup.ts` (dead code)
- `server/services/inventory-reservation.ts` (dead code)
- `server/services/notification.ts` (dead code — stubs for SMS/WhatsApp never implemented)
- `server/services/payment-state-machine.ts` (dead code — state machine logic in RPC)
- `server/interfaces/` (types inlined in services)

## Stripe & Payment Flow

### Primary Flow (Embedded Elements)
1. Client enters checkout → `createPaymentIntent` serverFn → cart validation → Stripe PI created → payment session created → client secret returned
2. Client confirms payment → `stripe.confirmPayment()` → non-3DS: resolves → `createOrder` serverFn → `createOrderFromPaymentIntent` → RPC creates order/decrements stock → `queue.enqueue()` → jobs processed → success page. 3DS: redirect → page reload → success useEffect → `createOrder` serverFn.

### Webhook Flow (Fallback)
1. Stripe sends `payment_intent.succeeded` → webhook handler → `acquireWebhookEvent` (tombstone idempotency) → `createOrderFromPaymentIntent` → RPC → `queue.enqueue()` → finalize webhook event.

### Job Chain (7 steps, serial per order)
1. `generate_invoice` — created inline by RPC; handler is no-op/idempotent check
2. `generate_invoice_pdf` — generates PDF, uploads to Storage
3. `send_thank_you_email` — sends customer confirmation
4. `send_invoice_email` — sends invoice with PDF attachment
5. `send_admin_email` — notifies admin of new order
6. `analytics_events` — records purchase event in audit_logs
7. `application_logs` — records order processing completion

## Build & Verification
- `npm run build` — passes cleanly (client + SSR)
- `npx eslint .` — only pre-existing warnings in untouched files (no errors in refactored code)
- No runtime warnings, no temporary patches, no compatibility hacks

## Recent Work — Account Page Cancel/Refund (Phase 1 & 2)
- **Customer cancel order**: `CancelOrderDialog` component added to `account.tsx:457` — dropdown reasons (Changed my mind, Ordered by mistake, Found another product, Other), calls `cancelOrder` RPC with `cancelled_by='customer'`. Only visible for `pending`, `confirmed`, `processing` orders.
- **Customer refund request**: `RequestRefundDialog` component added to `account.tsx:549` — dropdown reasons (Damaged Product, Wrong Product, Quality Issue, Late Delivery, Other), optional description, calls `requestRefund` RPC. Only visible for `delivered` orders with no pending/approved refund.
- **Cancellation info display**: Red-tinted section in `OrderDetailView` showing cancelled by, time, and reason (when `cancelled_by` is set).
- **Refund status display**: Shows refund status (pending/approved/completed/rejected), amount, reason, processed date in `OrderDetailView` when `refunds` exist.
- **Status history timeline**: `order_status_history` table entries shown below the existing `order_timeline` — displays `from_status → to_status` with note.
- **Order query updated**: `handleViewOrder` now selects `cancelled_by`, `cancelled_at`, `cancellation_reason`, `order_status_history`, and `refunds` via Supabase join.
- **Cancelled status badge**: Added `cancelled` → red styling to the status badge in `OrderDetailView`.
- **ORDER_STATUSES list updated** in `admin.orders.tsx` to include `packed` and `out_for_delivery`.
- **Build**: passes cleanly.

## Recent Work — Production-Grade Payment System (Phase 3)

### Stripe Performance Improvements
- **Single PaymentIntent creation**: PI created once on submit (not prefetched) — eliminates double PI creation. Idempotency key (`checkoutRequestId`) prevents duplicate PIs from form resubmission.
- **Module-level Stripe promise cache**: `stripePromiseCache` singleton in `useStripeCheckout.ts` — never recreates Stripe SDK instance.
- **`StripeElementsForm` + `StripePaymentForm`**: `React.memo`-compatible components in `useStripeCheckout.tsx`. Error retry button. Single `createPaymentIntent` call.
- **`CheckoutSkeleton`** (`src/payments/CheckoutSkeleton.tsx`): Animated pulse skeleton matching checkout form layout — shown while Stripe loads.

### PayPal — Real SDK Integration
- **`@paypal/react-paypal-js`** (`src/components/payment/PayPalPayment.tsx`): `PayPalScriptProvider` + `PayPalButtons`. Supports PayPal, Credit/Debit, Venmo, Pay Later via `enable-funding`. Server-side `createOrder` + capture & order creation in `onApprove` callback.
- **`usePayPalCheckout` hook** (`src/payments/hooks/usePayPalCheckout.ts`): Wraps `createOrder` and `captureOrder` server functions.
- **Server-side capture** (`server/lib/payments.ts`): `capturePayPalOrder` called from server — more secure than client-side capture. Cart re-validated via `validateCartItems` to prevent price manipulation.
- **`create_order_from_payment` RPC** reused for both Stripe and PayPal — `p_stripe_payment_intent_id` stores `paypal_{orderId}` for PayPal orders.
- **Sandbox/production support** (`server/config/env.ts`): `PAYPAL_ENVIRONMENT` controls API base URL. `paypalClientId` falls back to `VITE_PAYPAL_CLIENT_ID`.

### Checkout Page Rewrite
- **Removed all `[TRACE]` debug console.logs** from `src/routes/checkout.tsx`.
- **Single `submitLock` ref** prevents duplicate submissions.
- **`orderAttempted` ref** prevents duplicate order creation after 3DS redirect.
- **Uses `cart.items` directly** instead of duplicating state.

### PayPal Webhook (`server/routes/api/paypal/webhook.post.ts`)
- **Tombstone idempotency** via `webhook_events` table (same pattern as Stripe webhook).
- **Signature verification** via PayPal's `/v1/notifications/verify-webhook-signature` API.
- **Handles `PAYMENT.CAPTURE.COMPLETED`** — logs + finalizes event (full order creation from webhook is 501/TODO).
- **Graceful degradation**: if `PAYPAL_WEBHOOK_ID` not configured, skips verification (logs warning) rather than rejecting.

### Database
- **Migration 049** (`supabase/migrations/049_add_paypal_order_id.sql`): Adds `paypal_order_id TEXT` column to `orders` table with index. This was missing and caused silent failures in `createOrderFromPayPal` in `order-lifecycle.ts:623,698`.

### Env Vars
```
# Required for Stripe
VITE_STRIPE_PUBLISHABLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# Required for PayPal
VITE_PAYPAL_CLIENT_ID=...     # Client-side ID
PAYPAL_CLIENT_ID=...           # Server-side ID (same as VITE_ one typically)
PAYPAL_SECRET=...
PAYPAL_ENVIRONMENT=sandbox    # or "production"
PAYPAL_WEBHOOK_ID=...         # Optional — registered in PayPal Developer Dashboard

# General
PUBLIC_APP_URL=http://localhost:3000
```

### PayPal Sandbox Testing Checklist
1. Create sandbox accounts at https://developer.paypal.com/dashboard/accounts
2. Set `PAYPAL_ENVIRONMENT=sandbox` in `.env`
3. Run the app, proceed to checkout, select PayPal
4. Log in with sandbox buyer account, approve payment
5. Verify order created in Supabase `orders` table
6. Check `paypal_order_id` column populated on the order
7. Test Venmo and Pay Later if available in sandbox
8. Switch `PAYPAL_ENVIRONMENT=production` for live

### Testing PayPal Webhook Locally
1. Register webhook URL in PayPal Developer Dashboard → Webhooks (use ngrok for local dev)
2. Copy the Webhook ID into `PAYPAL_WEBHOOK_ID` in `.env`
3. Subscribe to `PAYMENT.CAPTURE.COMPLETED` and `CHECKOUT.ORDER.APPROVED` events
4. Test by completing a PayPal payment in sandbox
