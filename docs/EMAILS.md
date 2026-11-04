# Emails: what is sent, when

All emails use the same layout. Text is plain and filled from real order data. Links use `PUBLIC_APP_URL`; the Instagram link only appears if `INSTAGRAM_URL` is set; replies go to `FROM_EMAIL` and admin alerts to `ADMIN_EMAIL`.

| Email | Sent to | When | How it is triggered |
|---|---|---|---|
| Order confirmation (with invoice PDF) | customer | order is paid | existing job |
| New order alert | admin | order is paid | existing job |
| Order shipped (courier and tracking, estimated date, track link) | customer | status becomes `shipped` | database trigger, new |
| Order delivered | customer | status becomes `delivered` | database trigger, new |
| Order cancelled (refund line only if money was refunded) | customer | status becomes `cancelled` | database trigger, new |
| Review request | customer | 2 days after delivery | existing trigger |
| Refund request received | customer and admin | customer asks for a refund | existing, wording and escaping fixed |
| Refund needs more information | customer | admin asks a question | existing, wording and escaping fixed |
| Refund rejected | customer | admin rejects | existing, wording and escaping fixed |
| Refund started / refund complete | customer | refund processed / completed | existing |
| Return requested / approved / rejected | customer | return status changes | existing |
| Contact form: "we got your message" | sender | form submitted | database trigger, new |
| Contact form: new message | admin | form submitted | database trigger, new |
| Newsletter welcome with unsubscribe link | subscriber | email subscribes | database trigger, new |
| Payment failed | customer | Stripe reports a failed card payment | Stripe webhook, new |

Each new automatic email is a job in `background_jobs`, sent by `/api/cron/process-jobs`. A shipped, delivered or cancelled email is sent once per order and status.

## Not sent by this server
Sign-up confirmation, password reset and magic-link emails are sent by Supabase Auth. To make them match, edit them in Supabase: Authentication, Email Templates, and set a custom SMTP sender (Resend works) so they come from your domain. The templates `buildWelcomeEmailHtml`, `buildPasswordResetHtml` and `buildEmailVerificationHtml` already exist in `server/templates` for that.

## Not built yet
- Abandoned cart reminders.
- Back in stock and price drop emails.
- Newsletter campaigns (sending to the whole list). Unsubscribing already works.
- Low stock alerts to the admin (the alert records exist, no email yet).

## Before sending real emails
1. Run migration `20260801000300_email_triggers.sql`.
2. In Resend, verify your sending domain (SPF, DKIM, DMARC) and set `FROM_EMAIL` to an address on it.
3. Set `ADMIN_EMAIL`, `PUBLIC_APP_URL` and `CRON_SECRET`, and make sure the cron job from the hardening notes is running.
