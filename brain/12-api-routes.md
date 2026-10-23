# Server API Endpoints

This document maps all server API endpoints and webhooks.

## 1. Stripe Payment Webhook
- **Route**: `POST /api/stripe/webhook`
- **Purpose**: Real-time payment verification from Stripe.
- **Handling Flow**:
  1. Validates the signature header (`stripe-signature`) using the raw request body and the secret webhook key.
  2. Claims the webhook transaction ID (`acquireWebhookEvent` pattern) to guarantee idempotency.
  3. On `payment_intent.succeeded`, it triggers `createOrderFromPaymentIntent` to record the order in the database, decrement inventory, and release any active checkout locks.

## 2. PayPal Payment Webhook
- **Route**: `POST /api/paypal/webhook`
- **Purpose**: Receives transaction updates from PayPal.
- **Handling Flow**:
  1. Verifies the message using PayPal's verification API.
  2. Processes `PAYMENT.CAPTURE.COMPLETED` events, logging transactions and updating the corresponding order payment status.

## 3. Invoice PDF Stream
- **Route**: `GET /api/invoice/[id]/pdf`
- **Purpose**: Public stream access for invoice PDFs.
- **Handling Flow**:
  1. Receives the order/invoice identifier in the URL slug parameters.
  2. Authenticates access (checks customer session or guest tracking authorization).
  3. Downloads the compiled PDF from Supabase Storage and streams it directly to the browser.
