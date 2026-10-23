import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
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

import { formatAddress } from "../../src/lib/payments";

type AddressInput = string | Record<string, unknown>;

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
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let currentPage = pdfDoc.addPage([612, 792]);
  const { width, height } = currentPage.getSize();

  const GOLD = rgb(0.788, 0.663, 0.431);
  const DARK = rgb(0.102, 0.102, 0.102);
  const MUTED = rgb(0.4, 0.4, 0.4);
  const BORDER = rgb(0.898, 0.898, 0.898);
  const WHITE = rgb(1, 1, 1);

  const bottomMargin = 80;

  function drawFooter(p: any) {
    const footerY = 50;
    p.drawLine({
      start: { x: 50, y: footerY + 10 },
      end: { x: width - 50, y: footerY + 10 },
      thickness: 1,
      color: BORDER,
    });
    p.drawText("ANORA Elegance Atelier", {
      x: 50,
      y: footerY - 6,
      size: 8,
      font,
      color: MUTED,
    });
    p.drawText(`Invoice #${data.invoiceNumber}`, {
      x: width - 150,
      y: footerY - 6,
      size: 8,
      font,
      color: MUTED,
    });
  }

  function wrapText(text: string, maxWidth: number, f: any, size: number): string[] {
    if (!text) return [];
    const lines: string[] = [];
    const paragraphs = text.split("\n");

    for (const para of paragraphs) {
      const words = para.split(" ");
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(testLine, size);
        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
          }
          currentLine = word;
        }
      }
      if (currentLine) {
        lines.push(currentLine);
      }
    }
    return lines;
  }

  // Draw initial footer
  drawFooter(currentPage);

  let y = height - 60;

  // Header
  currentPage.drawText("ANORA", { x: 50, y, size: 28, font: bold, color: GOLD });
  currentPage.drawText("ELEGANCE ATELIER", { x: 50, y: y - 20, size: 10, font, color: MUTED });

  currentPage.drawText("INVOICE", { x: width - 150, y, size: 24, font: bold, color: DARK });
  currentPage.drawText(`#${data.invoiceNumber}`, {
    x: width - 150,
    y: y - 22,
    size: 10,
    font,
    color: MUTED,
  });

  y -= 60;

  // Divider
  currentPage.drawLine({
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
    currentPage.drawText(d.label, { x: 50, y, size: 9, font, color: MUTED });
    currentPage.drawText(d.value, { x: 180, y, size: 9, font: bold, color: DARK });
    y -= 16;
  }

  y -= 10;

  // Addresses side-by-side with dynamic wrapping and alignment
  const maxAddressWidth = width / 2 - 60; // 246 pt
  const billingLines = wrapText(data.billingAddress, maxAddressWidth, font, 9);
  const shippingLines = wrapText(data.shippingAddress, maxAddressWidth, font, 9);

  currentPage.drawText("Bill To:", { x: 50, y, size: 9, font: bold, color: DARK });
  currentPage.drawText("Ship To:", { x: width / 2 + 25, y, size: 9, font: bold, color: DARK });
  y -= 14;

  const startAddressY = y;
  let billingY = startAddressY;
  for (const line of billingLines) {
    currentPage.drawText(line, { x: 50, y: billingY, size: 9, font, color: DARK });
    billingY -= 12;
  }

  let shippingY = startAddressY;
  for (const line of shippingLines) {
    currentPage.drawText(line, { x: width / 2 + 25, y: shippingY, size: 9, font, color: DARK });
    shippingY -= 12;
  }

  y = Math.min(billingY, shippingY) - 20;

  // Table columns definition
  const cols = [
    { x: 50, w: 220 },
    { x: 270, w: 50 },
    { x: 340, w: 60 },
    { x: 420, w: 80 },
    { x: 510, w: 70 },
  ];
  const headers = ["Item", "Size", "Qty", "Unit Price", "Total"];

  function drawTableHeader(p: any, tableY: number) {
    p.drawRectangle({
      x: 50,
      y: tableY - 18,
      width: width - 100,
      height: 18,
      color: GOLD,
    });

    headers.forEach((h, i) => {
      p.drawText(h, {
        x: cols[i].x + 4,
        y: tableY - 14,
        size: 9,
        font: bold,
        color: WHITE,
      });
    });
  }

  // Ensure table header fits on current page
  if (y - 50 < bottomMargin) {
    currentPage = pdfDoc.addPage([612, 792]);
    drawFooter(currentPage);
    y = height - 60;
  }

  let tableTop = y;
  drawTableHeader(currentPage, tableTop);
  y = tableTop - 30;

  // Items
  for (const item of data.items) {
    const nameLines = wrapText(item.name, 212, font, 9);
    const rowHeight = Math.max(1, nameLines.length) * 12 + 8;

    // Check page break
    if (y - rowHeight < bottomMargin) {
      currentPage = pdfDoc.addPage([612, 792]);
      drawFooter(currentPage);
      y = height - 60;
      drawTableHeader(currentPage, y);
      y -= 30;
    }

    // Draw wrapped item name
    let itemY = y;
    for (const line of nameLines) {
      currentPage.drawText(line, { x: cols[0].x + 4, y: itemY, size: 9, font, color: DARK });
      itemY -= 12;
    }

    // Draw other columns
    currentPage.drawText(item.size || "-", { x: cols[1].x + 4, y, size: 9, font, color: DARK });
    currentPage.drawText(String(item.quantity), { x: cols[2].x + 4, y, size: 9, font, color: DARK });
    currentPage.drawText(`$${item.unitPrice.toFixed(2)}`, {
      x: cols[3].x + 4,
      y,
      size: 9,
      font,
      color: DARK,
    });
    currentPage.drawText(`$${item.totalPrice.toFixed(2)}`, {
      x: cols[4].x + 4,
      y,
      size: 9,
      font: bold,
      color: DARK,
    });

    y -= rowHeight;
  }

  // Totals Section
  const totalsHeight = 90;
  if (y - totalsHeight < bottomMargin) {
    currentPage = pdfDoc.addPage([612, 792]);
    drawFooter(currentPage);
    y = height - 60;
  }

  y -= 10;
  const totals = [
    { label: "Subtotal", value: data.subtotal },
    { label: "Shipping", value: data.shipping },
    { label: "Tax", value: data.tax },
  ];

  for (const t of totals) {
    currentPage.drawText(t.label, { x: 420, y, size: 9, font, color: MUTED });
    currentPage.drawText(`$${t.value.toFixed(2)}`, { x: 510, y, size: 9, font, color: DARK });
    y -= 18;
  }

  // Total line and grand total
  currentPage.drawLine({
    start: { x: 420, y },
    end: { x: width - 50, y },
    thickness: 1,
    color: DARK,
  });
  y -= 18;
  currentPage.drawText("Total", { x: 420, y, size: 11, font: bold, color: DARK });
  currentPage.drawText(`$${data.total.toFixed(2)}`, {
    x: 510,
    y,
    size: 11,
    font: bold,
    color: GOLD,
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

    const { error } = await (this.supabase.from("invoices") as any).insert({
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
      const { error: itemsError } = await (this.supabase.from("invoice_items") as any).insert(items);
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
    await (this.supabase
      .from("invoices") as any)
      .update({ pdf_path: path })
      .eq("invoice_number", invoiceNumber);

    logger.info("Invoice PDF uploaded", { invoiceNumber, path });
    return path;
  }

  async getPdfUrl(invoiceId: string): Promise<string> {
    const { data: invoice, error } = await (this.supabase
      .from("invoices") as any)
      .select("invoice_number, pdf_path")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) throw new NotFoundError("Invoice not found");

    const inv = invoice as any;
    // If PDF already stored, return signed URL
    if (inv.pdf_path) {
      return this.storage.signedUrl(inv.pdf_path);
    }

    // No PDF yet — generate and upload on demand
    const invoiceData = await this.loadInvoiceData(invoiceId);
    const pdfBytes = await this.generatePdf(invoiceData);
    await this.uploadPdf(inv.invoice_number, pdfBytes);
    return this.storage.signedUrl(`${inv.invoice_number}.pdf`);
  }

  async generateAndUploadForInvoice(invoiceId: string): Promise<string> {
    const invoiceData = await this.loadInvoiceData(invoiceId);
    const pdfBytes = await this.generatePdf(invoiceData);
    return this.uploadPdf(invoiceData.invoiceNumber, pdfBytes);
  }

  private async loadInvoiceData(invoiceId: string): Promise<InvoiceData> {
    const { data: invoice, error } = await (this.supabase
      .from("invoices") as any)
      .select("*, orders(*)")
      .eq("id", invoiceId)
      .single();

    if (error || !invoice) throw new NotFoundError("Invoice not found");

    const inv = invoice as any;
    const order = inv.orders;

    const { data: items } = await (this.supabase
      .from("invoice_items") as any)
      .select("*")
      .eq("invoice_id", invoiceId);

    return {
      invoiceNumber: inv.invoice_number,
      orderNumber: order.order_number,
      orderId: order.id,
      createdAt: inv.issued_at || order.created_at,
      customerName: inv.customer_name,
      customerEmail: inv.customer_email,
      currency: "usd",
      subtotal: Number(inv.subtotal),
      shipping: 0,
      tax: 0,
      total: Number(inv.total_amount),
      paymentStatus: inv.status,
      paymentMethod: order.payment_method || "card",
      shippingAddress: formatAddress(order.shipping_address),
      billingAddress: formatAddress(order.billing_address),
      items: (items || []).map((i: any) => ({
        name: i.product_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        totalPrice: Number(i.total_price),
      })),
    };
  }
}
