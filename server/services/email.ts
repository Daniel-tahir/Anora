import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { EmailError } from "../lib/errors";

export type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  from?: string;
  attachments?: Array<{ filename: string; content: Buffer | Uint8Array }>;
  headers?: Record<string, string>;
};

type EmailLog = {
  order_id?: string;
  email_type: string;
  recipient: string;
  status: string;
  subject: string;
  error_message?: string;
};

export class EmailService {
  private readonly resend!: Resend;
  private ready = false;

  constructor() {
    if (env.resendApiKey) {
      this.resend = new Resend(env.resendApiKey);
      this.ready = true;
    } else {
      logger.warn("Resend API key not configured, emails disabled");
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  private getFrom(): string {
    return env.fromEmail;
  }

  private getAdminEmail(): string {
    return env.adminEmail;
  }

  private async logSend(log: EmailLog): Promise<void> {
    try {
      const { error } = await (supabaseAdmin.from("email_logs") as any).insert({
        order_id: log.order_id,
        email_type: log.email_type,
        recipient: log.recipient,
        status: log.status,
        subject: log.subject,
        error_message: log.error_message,
        sent_at: new Date().toISOString(),
      });

      if (error) {
        logger.warn("Failed to log email", { error: error.message });
      }
    } catch (err) {
      logger.warn("Failed to log email", { error: String(err) });
    }
  }

  private async checkDuplicate(orderId: string | undefined, emailType: string): Promise<boolean> {
    if (!orderId) return false;

    const { count, error } = await (supabaseAdmin
      .from("email_logs") as any)
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("email_type", emailType)
      .eq("status", "sent");

    if (error) return false;
    return (count ?? 0) > 0;
  }

  async send(options: EmailOptions): Promise<void> {
    if (!this.ready) {
      logger.warn("Email not sent, Resend not configured", {
        to: options.to,
        subject: options.subject,
      });
      return;
    }

    const payload: Parameters<typeof this.resend.emails.send>[0] = {
      from: options.from || this.getFrom(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      headers: options.headers,
    };

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
      }));
    }

    try {
      const { error } = await this.resend.emails.send(payload);
      if (error) throw new EmailError(error.message);
      logger.info("Email sent", { to: options.to, subject: options.subject });
    } catch (err) {
      throw new EmailError(
        `Failed to send email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async sendWithLogging(
    options: EmailOptions & {
      orderId?: string;
      emailType: string;
    },
  ): Promise<void> {
    const logEntry: EmailLog = {
      order_id: options.orderId,
      email_type: options.emailType,
      recipient: options.to,
      status: "failed",
      subject: options.subject,
    };

    // Idempotency check
    const isDuplicate = await this.checkDuplicate(options.orderId, options.emailType);
    if (isDuplicate) {
      logger.info("Skipping duplicate email", {
        orderId: options.orderId,
        emailType: options.emailType,
      });
      return;
    }

    try {
      await this.send(options);
      logEntry.status = "sent";
    } catch (err) {
      logEntry.error_message = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await this.logSend(logEntry);
    }
  }

  async sendThankYou(
    to: string,
    orderNumber: string,
    html: string,
    pdfAttachment?: { filename: string; content: Buffer | Uint8Array },
    orderId?: string,
  ): Promise<void> {
    return this.sendWithLogging({
      to,
      subject: `Your order is confirmed`,
      html,
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
      emailType: "thank_you",
      orderId,
    });
  }

  async sendInvoice(
    to: string,
    invoiceNumber: string,
    html: string,
    pdfAttachment?: { filename: string; content: Buffer | Uint8Array },
    orderId?: string,
  ): Promise<void> {
    return this.sendWithLogging({
      to,
      subject: `Invoice ${invoiceNumber}`,
      html,
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
      emailType: "invoice",
      orderId,
    });
  }

  async sendRefundUpdate(
    to: string,
    data: {
      customerName?: string;
      orderNumber: string;
      amount: number;
      refundStatus: "processed" | "completed";
      items: any[];
    },
    orderId?: string,
  ): Promise<void> {
    const { buildRefundUpdateHtml } = await import("../templates");
    const html = buildRefundUpdateHtml({
      customerName: data.customerName,
      orderNumber: data.orderNumber,
      amount: data.amount,
      refundStatus: data.refundStatus,
      items: data.items,
    });

    const statusLabel = data.refundStatus === "processed" ? "Approved" : "Completed";
    const emailType = data.refundStatus === "processed" ? "refund_approved" : "refund_completed";

    return this.sendWithLogging({
      to,
      subject: `Refund ${statusLabel.toLowerCase()} for order #${data.orderNumber}`,
      html,
      emailType,
      orderId,
    });
  }

  async sendReturnUpdate(
    to: string,
    data: {
      customerName?: string;
      orderNumber: string;
      returnStatus: "requested" | "approved" | "rejected";
      reason?: string;
      items: any[];
    },
    orderId?: string,
  ): Promise<void> {
    const { buildReturnUpdateHtml } = await import("../templates");
    const html = buildReturnUpdateHtml({
      customerName: data.customerName,
      orderNumber: data.orderNumber,
      returnStatus: data.returnStatus,
      reason: data.reason,
      items: data.items,
    });

    const statusLabel = data.returnStatus === "approved" ? "Approved" : data.returnStatus === "rejected" ? "Rejected" : "Requested";
    const emailType = `return_${data.returnStatus}`;

    return this.sendWithLogging({
      to,
      subject: `Return request ${statusLabel.toLowerCase()} for order #${data.orderNumber}`,
      html,
      emailType,
      orderId,
    });
  }

  async sendOrderStatusUpdate(
    to: string,
    data: {
      customerName?: string;
      orderNumber: string;
      status: "processing" | "packed" | "shipped" | "delivered";
      trackingNumber?: string;
      trackingUrl?: string;
      estimatedDelivery?: string;
      items: any[];
    },
    orderId?: string,
  ): Promise<void> {
    const { buildShippingUpdateHtml } = await import("../templates");
    const subjects: Record<string, string> = {
      processing: `We are working on order #${data.orderNumber}`,
      packed: `Order #${data.orderNumber} is packed`,
      shipped: `Order #${data.orderNumber} has shipped`,
      delivered: `Order #${data.orderNumber} was delivered`,
    };
    return this.sendWithLogging({
      to,
      subject: subjects[data.status] ?? `Update on order #${data.orderNumber}`,
      html: buildShippingUpdateHtml(data),
      emailType: `order_${data.status}`,
      orderId,
    });
  }

  async sendOrderCancelled(
    to: string,
    data: { customerName?: string; orderNumber: string; reason?: string; refundAmount?: number; items: any[] },
    orderId?: string,
  ): Promise<void> {
    const { buildOrderCancelledHtml } = await import("../templates");
    return this.sendWithLogging({
      to,
      subject: `Order #${data.orderNumber} was cancelled`,
      html: buildOrderCancelledHtml(data as any),
      emailType: "order_cancelled",
      orderId,
    });
  }

  async sendContactAutoReply(to: string, data: { name: string; message: string }): Promise<void> {
    const { buildContactAutoReplyHtml } = await import("../templates");
    return this.sendWithLogging({
      to,
      subject: "We got your message",
      html: buildContactAutoReplyHtml(data as any),
      emailType: "contact_auto_reply",
    });
  }

  async sendContactNotification(data: { name: string; email: string; phone?: string; message: string }): Promise<void> {
    const { buildContactNotificationHtml } = await import("../templates");
    return this.sendWithLogging({
      to: this.getAdminEmail(),
      subject: `New message from ${data.name}`,
      html: buildContactNotificationHtml(data as any),
      emailType: "contact_notification",
    });
  }

  async sendNewsletterWelcome(to: string, data: { unsubscribeUrl: string }): Promise<void> {
    const { buildNewsletterWelcomeHtml } = await import("../templates");
    return this.sendWithLogging({
      to,
      subject: "You are subscribed",
      html: buildNewsletterWelcomeHtml(data),
      emailType: "newsletter_welcome",
    });
  }

  async sendPaymentFailed(
    to: string,
    data: { customerName?: string; orderNumber?: string; totalAmount: number },
  ): Promise<void> {
    const { buildPaymentFailedHtml } = await import("../templates");
    return this.sendWithLogging({
      to,
      subject: "Your payment did not go through",
      html: buildPaymentFailedHtml(data as any),
      emailType: "payment_failed",
    });
  }

  async sendAdminNotification(subject: string, html: string, orderId?: string): Promise<void> {
    return this.sendWithLogging({
      to: this.getAdminEmail(),
      subject,
      html,
      emailType: "admin_notification",
      orderId,
    });
  }

  async sendReviewRequest(
    to: string,
    customerName: string,
    products: Array<{ name: string; imageUrl?: string; reviewUrl: string }>,
    orderId: string,
  ): Promise<void> {
    const { buildReviewRequestHtml } = await import("../templates");
    const html = buildReviewRequestHtml({ customerName, products });

    return this.sendWithLogging({
      to,
      subject: `How was your order from ANORA?`,
      html,
      emailType: "review_request",
      orderId,
    });
  }
}

// Lazy init — supabase admin client is created after env validation
let supabaseAdmin: ReturnType<typeof createClient>;

export function initEmailService(supabase: ReturnType<typeof createClient>): void {
  supabaseAdmin = supabase;
}
