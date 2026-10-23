import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { env } from "../config/env";
import { config } from "../config";
import { logger } from "../lib/logger";
import { StorageService } from "../services/storage";
import { InvoiceService } from "../services/invoice";
import { EmailService, initEmailService } from "../services/email";
import { QueueService } from "../services/queue";
import type { JobRecord } from "../services/queue";
import { RefundService } from "../services/refund";

export class ServerContainer {
  private _supabase: ReturnType<typeof createClient> | null = null;
  private _stripe: Stripe | null = null;
  private _storage: StorageService | null = null;
  private _invoice: InvoiceService | null = null;
  private _email: EmailService | null = null;
  private _queue: QueueService | null = null;
  private _refund: RefundService | null = null;
  private _initialized = false;

  async initialize(): Promise<void> {
    logger.info("Server container initializing");

    // 1. Validate environment
    env.validate();
    logger.info("Environment validated");

    // 2. Initialize Supabase admin client
    this._supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    logger.info("Supabase admin client created");

    // 3. Initialize Stripe
    this._stripe = new Stripe(env.stripeSecretKey, {
      apiVersion: config.stripe.apiVersion as any,
      typescript: true,
    });
    logger.info("Stripe client created");

    // 4. Initialize storage
    this._storage = new StorageService(this.supabase);
    await this._storage.ensureBucket();
    logger.info("Storage service initialized");

    // 5. Initialize email service
    initEmailService(this.supabase);
    this._email = new EmailService();
    logger.info("Email service initialized", { ready: this._email.isReady() });

    // 6. Initialize invoice service
    this._invoice = new InvoiceService(this.supabase, this.storage);

    // 6b. Initialize refund service
    this._refund = new RefundService(this.supabase, this.stripe, this._email);
    logger.info("Refund service initialized");

    // 7. Initialize queue with handlers
    this._queue = new QueueService(this.supabase);
    this.registerJobHandlers();
    logger.info("Queue service initialized");

    this._initialized = true;
    logger.info("Server container initialized successfully");
  }

  private registerJobHandlers(): void {
    if (!this._queue) return;

    // generate_invoice — handled by order pipeline directly
    this._queue.register("generate_invoice", async (job: JobRecord) => {
      logger.info("Job: generate_invoice", { orderId: job.order_id });
      // Invoice is created in the order pipeline; this handler is a no-op
      // because invoice creation happens synchronously during order creation.
      // We keep the job for sequencing but skip if already exists.
    });

    // generate_invoice_pdf
    this._queue.register("generate_invoice_pdf", async (job: JobRecord) => {
      const payload = job.payload as { invoiceId?: string };
      if (!payload.invoiceId) {
        logger.warn("Missing invoiceId in job payload — skipping PDF generation", {
          jobId: job.id,
          orderId: job.order_id,
        });
        return;
      }
      await this.invoice.generateAndUploadForInvoice(payload.invoiceId);
    });

    // send_thank_you_email
    this._queue.register("send_thank_you_email", async (job: JobRecord) => {
      const payload = job.payload as {
        customerEmail?: string;
        orderNumber?: string;
        thankYouHtml?: string;
        invoiceNumber?: string;
      };
      if (!payload.customerEmail || !payload.thankYouHtml) {
        logger.error("Missing email data in job payload", {
          jobId: job.id,
          orderId: job.order_id,
          payloadType: typeof job.payload,
          payloadIsNull: job.payload === null,
          payloadKeys:
            typeof job.payload === "object" && job.payload !== null
              ? Object.keys(job.payload as Record<string, unknown>)
              : [],
          customerEmailType: typeof payload.customerEmail,
          customerEmailValue: payload.customerEmail
            ? payload.customerEmail.substring(0, 50)
            : "EMPTY",
          thankYouHtmlType: typeof payload.thankYouHtml,
          thankYouHtmlLength: payload.thankYouHtml?.length ?? 0,
        });
        throw new Error("Missing email data in job payload");
      }

      let pdfAttachment: { filename: string; content: Buffer } | undefined;

      // Attach PDF if available
      if (payload.invoiceNumber) {
        try {
          const { data: invoiceRec } = await (this.supabase
            .from("invoices") as any)
            .select("pdf_path")
            .eq("invoice_number", payload.invoiceNumber)
            .single();

          if (invoiceRec?.pdf_path) {
            const pdfResult = await this.storage.download(invoiceRec.pdf_path);
            pdfAttachment = {
              filename: `${payload.invoiceNumber}.pdf`,
              content: Buffer.from(pdfResult.data),
            };
          }
        } catch (err) {
          logger.warn("Failed to fetch/download invoice PDF for thank-you confirmation email", {
            orderId: job.order_id,
            invoiceNumber: payload.invoiceNumber,
            error: String(err),
          });
        }
      }

      await this.email.sendThankYou(
        payload.customerEmail,
        payload.orderNumber || "",
        payload.thankYouHtml,
        pdfAttachment,
        job.order_id,
      );
    });

    // send_invoice_email
    this._queue.register("send_invoice_email", async (job: JobRecord) => {
      logger.info("Job: send_invoice_email - skipped (merged into order confirmation email)", {
        orderId: job.order_id,
      });
    });

    // send_admin_email
    this._queue.register("send_admin_email", async (job: JobRecord) => {
      const payload = job.payload as {
        adminSubject?: string;
        adminHtml?: string;
      };
      if (!payload.adminSubject || !payload.adminHtml) {
        logger.error("Missing admin email data in job payload", {
          jobId: job.id,
          orderId: job.order_id,
          payloadType: typeof job.payload,
          payloadIsNull: job.payload === null,
          payloadKeys:
            typeof job.payload === "object" && job.payload !== null
              ? Object.keys(job.payload as Record<string, unknown>)
              : [],
          adminSubjectType: typeof payload.adminSubject,
          adminSubjectValue: payload.adminSubject
            ? payload.adminSubject.substring(0, 100)
            : "EMPTY",
          adminHtmlType: typeof payload.adminHtml,
          adminHtmlLength: payload.adminHtml?.length ?? 0,
        });
        throw new Error("Missing admin email data in job payload");
      }
      await this.email.sendAdminNotification(payload.adminSubject, payload.adminHtml, job.order_id);
    });

    // analytics_events
    this._queue.register("analytics_events", async (job: JobRecord) => {
      await (this.supabase.from("audit_logs") as any).insert({
        event_type: "purchase",
        entity_type: "order",
        entity_id: job.order_id,
        metadata: job.payload,
        created_at: new Date().toISOString(),
      });
    });

    // application_logs
    this._queue.register("application_logs", async (job: JobRecord) => {
      await (this.supabase.from("audit_logs") as any).insert({
        event_type: "order_processing",
        entity_type: "order",
        entity_id: job.order_id,
        metadata: {
          ...job.payload,
          job_completed_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    });

    // send_review_email
    this._queue.register("send_review_email", async (job: JobRecord) => {
      logger.info("Job: send_review_email", { orderId: job.order_id });

      const { data: order, error: orderErr } = await (this.supabase
        .from("orders") as any)
        .select("id, email, shipping_address, user_id")
        .eq("id", job.order_id)
        .single();

      if (orderErr || !order) {
        throw new Error(`Order not found for review request: ${orderErr?.message || "empty"}`);
      }

      const { data: items, error: itemsErr } = await (this.supabase
        .from("order_items") as any)
        .select("id, name, product_id, image_url")
        .eq("order_id", job.order_id);

      if (itemsErr || !items) {
        throw new Error(`Order items not found for review request: ${itemsErr?.message || "empty"}`);
      }

      const eligibleProducts: Array<{ name: string; imageUrl?: string; reviewUrl: string }> = [];

      for (const item of items) {
        const { count, error: reviewCheckErr } = await (this.supabase
          .from("reviews") as any)
          .select("id", { count: "exact", head: true })
          .eq("order_item_id", item.id);

        if (reviewCheckErr) continue;

        if ((count ?? 0) === 0) {
          // Create a cryptographically secure token
          const { data: tokenRec, error: tokenErr } = await (this.supabase
            .from("review_tokens") as any)
            .insert({
              order_id: job.order_id,
              order_item_id: item.id,
              email: order.email,
            })
            .select("token")
            .single();

          if (tokenErr || !tokenRec) {
            logger.error("Failed to generate review token", { orderItemId: item.id, error: tokenErr?.message });
            continue;
          }

          eligibleProducts.push({
            name: item.name,
            imageUrl: item.image_url || undefined,
            reviewUrl: `${env.publicAppUrl || "https://anora-sooty.vercel.app"}/review/${tokenRec.token}`,
          });
        }
      }

      if (eligibleProducts.length === 0) {
        logger.info("No eligible products found for review request — skipping email", { orderId: job.order_id });
        return;
      }

      let customerName = "Valued Customer";
      if (order.user_id) {
        const { data: profile } = await (this.supabase
          .from("profiles") as any)
          .select("first_name, last_name")
          .eq("id", order.user_id)
          .single();
        if (profile?.first_name) {
          customerName = profile.first_name;
        }
      } else {
        const sa = order.shipping_address as any;
        if (sa?.firstName) {
          customerName = sa.firstName;
        } else if (sa?.first_name) {
          customerName = sa.first_name;
        }
      }

      await this.email.sendReviewRequest(order.email, customerName, eligibleProducts, job.order_id);
    });
  }

  // Accessors
  get supabase(): ReturnType<typeof createClient> {
    if (!this._supabase) throw new Error("ServerContainer not initialized");
    return this._supabase;
  }

  get stripe(): Stripe {
    if (!this._stripe) throw new Error("ServerContainer not initialized");
    return this._stripe;
  }

  get storage(): StorageService {
    if (!this._storage) throw new Error("ServerContainer not initialized");
    return this._storage;
  }

  get invoice(): InvoiceService {
    if (!this._invoice) throw new Error("ServerContainer not initialized");
    return this._invoice;
  }

  get email(): EmailService {
    if (!this._email) throw new Error("ServerContainer not initialized");
    return this._email;
  }

  get refund(): RefundService {
    if (!this._refund) throw new Error("ServerContainer not initialized");
    return this._refund;
  }

  get queue(): QueueService {
    if (!this._queue) throw new Error("ServerContainer not initialized");
    return this._queue;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}

let _container: ServerContainer | null = null;

export function getContainer(): ServerContainer {
  if (!_container) {
    _container = new ServerContainer();
  }
  return _container;
}

export async function initContainer(): Promise<ServerContainer> {
  const container = getContainer();
  if (!container.initialized) {
    await container.initialize();
  }
  return container;
}
