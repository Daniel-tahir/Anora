import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { StorageService } from "./storage";
import { NotFoundError } from "../lib/errors";
import { logger } from "../lib/logger";
import { config } from "../config";

export type InvoiceData = {
  invoiceNumber: string;
  orderNumber: string;
  orderId: string;
  createdAt: string;
  dueDate?: string;
  customerName: string;
  customerEmail: string;
  currency: string;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  paymentStatus: string;
  paymentMethod: string;
  shippingAddress: string;
  billingAddress: string;
  items: Array<{
    name: string;
    size?: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
};

type AddressInput = string | Record<string, unknown>;

function formatAddress(addr: AddressInput): string {
  const parsed = typeof addr === "string" ? tryParseJson(addr) : addr;
  if (!parsed) return typeof addr === "string" ? addr : "";
  const parts = [
    parsed.line1,
    parsed.line2,
    parsed.city,
    parsed.state,
    parsed.postal_code,
    parsed.country,
  ].filter(Boolean) as string[];
  return parts.join(", ");
}

function tryParseJson(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();

  const GOLD = rgb(0.788, 0.663, 0.431);
  const DARK = rgb(0.102, 0.102, 0.102);
  const MUTED = rgb(0.4, 0.4, 0.4);
  const BORDER = rgb(0.898, 0.898, 0.898);
  const WHITE = rgb(1, 1, 1);

  let y = height - 60;

  // Header
  page.drawText("ANORA", { x: 50, y, size: 28, font: bold, color: GOLD });
  page.drawText("ELEGANCE ATELIER", { x: 50, y: y - 20, size: 10, font, color: MUTED });

  page.drawText("INVOICE", { x: width - 150, y, size: 24, font: bold, color: DARK });
  page.drawText(`#${data.invoiceNumber}`, {
    x: width - 150,
    y: y - 22,
    size: 10,
    font,
    color: MUTED,
  });

  y -= 60;

  // Divider
  page.drawLine({
    start: { x: 50, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: BORDER,
  });
  y -= 20;

  // Details
  const details = [
    { label: "Invoice Date", value: formatDate(data.createdAt) },
    { label: "Order Number", value: data.orderNumber },
    { label: "Payment Method", value: data.paymentMethod },
    { label: "Payment Status", value: data.paymentStatus },
  ];

  for (const d of details) {
    page.drawText(d.label, { x: 50, y, size: 9, font, color: MUTED });
    page.drawText(d.value, { x: 180, y, size: 9, font: bold, color: DARK });
    y -= 16;
  }

  y -= 10;

  // Addresses
  page.drawText("Bill To:", { x: 50, y, size: 9, font: bold, color: DARK });
  y -= 14;
  page.drawText(data.billingAddress, { x: 50, y, size: 9, font, color: DARK });
  y -= 40;

  page.drawText("Ship To:", { x: width / 2 + 25, y, size: 9, font: bold, color: DARK });
  y -= 14;
  page.drawText(data.shippingAddress, { x: width / 2 + 25, y, size: 9, font, color: DARK });
  y -= 40;

  // Table header
  const tableTop = y;
  const cols = [
    { x: 50, w: 220 },
    { x: 270, w: 50 },
    { x: 340, w: 60 },
    { x: 420, w: 80 },
    { x: 510, w: 70 },
  ];
  const headers = ["Item", "Size", "Qty", "Unit Price", "Total"];

  // Header bg
  page.drawRectangle({
    x: 50,
    y: tableTop - 18,
    width: width - 100,
    height: 18,
    color: GOLD,
  });

  headers.forEach((h, i) => {
    page.drawText(h, {
      x: cols[i].x + 4,
      y: tableTop - 14,
      size: 9,
      font: bold,
      color: WHITE,
    });
  });

  y = tableTop - 30;

  // Items
  for (const item of data.items) {
    page.drawText(item.name, { x: cols[0].x + 4, y, size: 9, font, color: DARK });
    page.drawText(item.size || "-", { x: cols[1].x + 4, y, size: 9, font, color: DARK });
    page.drawText(String(item.quantity), { x: cols[2].x + 4, y, size: 9, font, color: DARK });
    page.drawText(`$${item.unitPrice.toFixed(2)}`, {
      x: cols[3].x + 4,
      y,
      size: 9,
      font,
      color: DARK,
    });
    page.drawText(`$${item.totalPrice.toFixed(2)}`, {
      x: cols[4].x + 4,
      y,
      size: 9,
      font: bold,
      color: DARK,
    });
    y -= 20;
  }

  // Totals
  y -= 10;
  const totals = [
    { label: "Subtotal", value: data.subtotal },
    { label: "Shipping", value: data.shipping },
    { label: "Tax", value: data.tax },
  ];

  for (const t of totals) {
    page.drawText(t.label, { x: 420, y, size: 9, font, color: MUTED });
    page.drawText(`$${t.value.toFixed(2)}`, { x: 510, y, size: 9, font, color: DARK });
    y -= 18;
  }

  // Total
  page.drawLine({
    start: { x: 420, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: DARK,
  });
  y -= 18;
  page.drawText("Total", { x: 420, y, size: 11, font: bold, color: DARK });
  page.drawText(`$${data.total.toFixed(2)}`, {
    x: 510,
    y,
    size: 11,
    font: bold,
    color: GOLD,
  });

  // Footer
  const footerY = 50;
  page.drawLine({
    start: { x: 50, y: footerY + 10 },
    end: { x: width - 50, y: footerY + 10 },
    thickness: 1,
    color: BORDER,
  });
  page.drawText("ANORA Elegance Atelier", {
    x: 50,
    y: footerY - 6,
    size: 8,
    font,
    color: MUTED,
  });
  page.drawText(`Invoice #${data.invoiceNumber}`, {
    x: width - 150,
    y: footerY - 6,
    size: 8,
    font,
    color: MUTED,
  });

  return pdfDoc.save();
}

export class InvoiceService {
  constructor(
    private readonly supabase: ReturnType<typeof createClient>,
    private readonly storage: StorageService,
  ) {}

  async create(data: InvoiceData): Promise<string> {
    const invoiceId = crypto.randomUUID();

    const { error } = await this.supabase.from("invoices").insert({
      id: invoiceId,
      invoice_number: data.invoiceNumber,
      order_id: data.orderId,
      customer_name: data.customerName,
      customer_email: data.customerEmail,
      subtotal: data.subtotal,
      total_amount: data.total,
      status: "paid",
      issued_at: new Date().toISOString(),
    });

    if (error) throw error;

    // Insert invoice items
    const items = data.items.map((item) => ({
      invoice_id: invoiceId,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
    }));

    if (items.length > 0) {
      const { error: itemsError } = await this.supabase.from("invoice_items").insert(items);
      if (itemsError) throw itemsError;
    }

    logger.info("Invoice created", { invoiceId, invoiceNumber: data.invoiceNumber });
    return invoiceId;
  }

  async generatePdf(data: InvoiceData): Promise<Uint8Array> {
    return generateInvoicePdf(data);
  }

  async uploadPdf(invoiceNumber: string, pdfBytes: Uint8Array): Promise<string> {
    await this.storage.ensureBucket();
    const path = `${invoiceNumber}.pdf`;
    await this.storage.upload(path, pdfBytes, "application/pdf");

    // Update invoice record with pdf_path
    await this.supabase
      .from("invoices")
      .update({ pdf_path: path })
      .eq("invoice_number", invoiceNumber);

    logger.info("Invoice PDF uploaded", { invoiceNumber, path });
    return path;
  }

  async getPdfUrl(invoiceId: string): Promise<string> {
    const { data: invoice, error } = await this.supabase
      .from("invoices")
      .select("invoice_number, pdf_path")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) throw new NotFoundError("Invoice not found");

    // If PDF already stored, return signed URL
    if (invoice.pdf_path) {
      return this.storage.signedUrl(invoice.pdf_path);
    }

    // No PDF yet — generate and upload on demand
    const invoiceData = await this.loadInvoiceData(invoiceId);
    const pdfBytes = await this.generatePdf(invoiceData);
    await this.uploadPdf(invoice.invoice_number, pdfBytes);
    return this.storage.signedUrl(`${invoice.invoice_number}.pdf`);
  }

  async generateAndUploadForInvoice(invoiceId: string): Promise<string> {
    const invoiceData = await this.loadInvoiceData(invoiceId);
    const pdfBytes = await this.generatePdf(invoiceData);
    return this.uploadPdf(invoiceData.invoiceNumber, pdfBytes);
  }

  private async loadInvoiceData(invoiceId: string): Promise<InvoiceData> {
    const { data: invoice, error } = await this.supabase
      .from("invoices")
      .select("*, orders(*)")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) throw new NotFoundError("Invoice not found");

    const order = invoice.orders;

    const { data: items } = await this.supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId);

    return {
      invoiceNumber: invoice.invoice_number,
      orderNumber: order.order_number,
      orderId: order.id,
      createdAt: invoice.issued_at || order.created_at,
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      currency: "usd",
      subtotal: Number(invoice.subtotal),
      shipping: 0,
      tax: 0,
      total: Number(invoice.total_amount),
      paymentStatus: invoice.status,
      paymentMethod: order.payment_method || "card",
      shippingAddress: formatAddress(order.shipping_address),
      billingAddress: formatAddress(order.billing_address),
      items: (items || []).map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        totalPrice: Number(i.total_price),
      })),
    };
  }
}
