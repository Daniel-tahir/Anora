# Email Pipeline & PDF Invoices

This document describes the automated email communication framework, Resend API integration, PDF invoice generation, and failure mitigation strategies.

## Email Architecture
- **Service Layer (`EmailService` inside `server/services/email.ts`)**:
  - Initialized within the server container.
  - Receives the Resend client SDK via constructor dependency injection.
  - Logs warnings if keys are absent, falling back to dry-run mode (does not crash the server).
- **Templates (`server/templates/index.ts`)**:
  - Declarative email templates (e.g. `ThankYouEmail`) styled for premium luxury branding.

## Invoice PDF Generation
- **Service Layer (`InvoiceService` inside `server/services/invoice.ts`)**:
  - Invoked during background queue worker processing.
  - Formats order line items, subtotals, tax rates, shipping details, and billing addresses using `jsPDF`.
  - Saves PDF binaries and uploads them to the Supabase Storage bucket (`invoice-pdfs`).
  - Retrieves a signed access URL for public download links on guest portals.

## Queue Worker Job Sequence
1. **`generate_invoice_pdf`**: Generates invoice details, compiles the PDF binary, uploads it to storage, and writes the signed URL to the order record.
2. **`send_thank_you_email`**: Sends order verification emails.
3. **`send_invoice_email`**: Downloads the PDF binary from Storage and sends it to the customer as an attachment.
4. **`send_admin_email`**: Sends internal alerts to atelier administrators.

## Idempotency & Failure Mitigation
- **Tombstoning (`email_logs` table)**: Before dispatching, the service checks for existing matching entries (`order_id`, `email_type`). If found, it skips the execution, preventing double email notifications.
- **Fail-safe Queuing**: Retries are handled automatically by the queue worker. Errors are caught, logged, and incremented on the `background_jobs.attempts` database column.
