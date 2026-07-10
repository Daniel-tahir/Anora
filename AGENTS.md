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
