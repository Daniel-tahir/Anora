# Folder Architecture

This document maps the project directory structure, identifying responsibilities, dependencies, and important files within each subdirectory.

| Directory | Purpose / Responsibility | Key Dependencies | Important Files |
| :--- | :--- | :--- | :--- |
| `src/` | Main frontend source code (React + TanStack Start). | React, TanStack, Tailwind | `src/server.ts`, `src/routeTree.gen.ts` |
| `src/components/`| Reusable UI components. | Radix UI, Lucide Icons, Shadcn | `site/Header.tsx`, `payment/PayPalPayment.tsx` |
| `src/routes/` | Page endpoints and route mappings. | TanStack Router | `shop.tsx`, `wishlist.tsx`, `track.tsx` |
| `src/lib/` | Frontend/Shared client-side libraries. | Supabase Client SDK, React Query | `store.tsx`, `customer-services.ts`, `supabase.ts` |
| `src/hooks/` | Custom hooks for shared states. | React core | `useStripeCheckout.ts`, `usePayPalCheckout.ts` |
| `src/assets/` | Static media files (logos, product stubs). | Client bundler | `p1.jpg` to `p6.jpg`, `blog1.jpg` |
| `server/` | Server-side source logic (DI container, services).| Node, Resend, Stripe, jsPDF | `server/container/index.ts`, `server/config/env.ts`|
| `server/config/` | Application configurations and validated environment. | dotenv, Zod | `env.ts` (validated env variables reader) |
| `server/container/`| Deterministic Dependency Injection Container. | Stripe, Storage, Queue | `index.ts` (main services instantiator) |
| `server/lib/` | Server-specific support libraries. | Supabase Admin Client, Stripe | `payments.ts`, `order-lifecycle.ts` |
| `server/services/` | Modularized application services. | pg-boss/custom DB polling | `email.ts`, `queue.ts`, `storage.ts`, `invoice.ts` |
| `server/routes/api/`| Server API endpoints (webhooks, PDF get). | TanStack API core | `stripe/webhook.post.ts`, `invoice/[id]/pdf.get.ts`|
| `server/templates/`| Resend HTML template declarations. | React template rendering | `templates/index.ts` (ThankYou email template) |
| `supabase/` | Supabase deployment scripts and migrations. | Supabase CLI | `config.toml`, `migrations/` |
| `brain/` | Permanent AI Knowledge Base & Source of Truth. | None | This document and child documents |

## Detail of Critical Server Structure
The backend is structured under a strict decoupled Dependency Injection (DI) layout:
- **`server/config/env.ts`**: The sole point of reading environment variables (`process.env`). Sanitizes and parses variables using Zod. Throws fast-failing runtime configuration errors if keys are absent.
- **`server/container/index.ts`**: Acts as the dependency registry. Instantiates service singletons in topological order (Supabase -> Stripe -> Storage -> Email -> Invoice -> Queue).
- **`server/services/`**: Exposes service behaviors. Service classes accept resolved constructor parameters instead of importing global singletons (preventing import ordering and lifecycle bugs).
