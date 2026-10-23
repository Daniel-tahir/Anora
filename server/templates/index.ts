import { env } from "../config/env";

// ─── Color Constants ─────────────────────────────────────────────────
export const GOLD = "#C9A96E";
export const DARK = "#18181B";
export const LIGHT_BG = "#FAFAFA";
export const WHITE = "#FFFFFF";
export const TEXT = "#27272A";
export const MUTED = "#71717A";
export const BORDER = "#E4E4E7";
export const EMERALD = "#10B981";
export const RED = "#EF4444";

// ─── Customer Display Name Helper & Input Schema ─────────────────────
export interface CustomerNameInput {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  shippingAddress?: { firstName?: string | null; lastName?: string | null } | null;
  billingAddress?: { firstName?: string | null; lastName?: string | null } | null;
  email?: string | null;
}

export function getCustomerDisplayName(data?: CustomerNameInput | null): string {
  if (!data) return "Valued Customer";

  // 1. customer.firstName + customer.lastName
  const profileName = [data.firstName, data.lastName].map(s => s?.trim()).filter(Boolean).join(" ");
  if (profileName) return profileName;

  // 2. shippingAddress.firstName + lastName
  if (data.shippingAddress) {
    const shippingName = [data.shippingAddress.firstName, data.shippingAddress.lastName]
      .map(s => s?.trim())
      .filter(Boolean)
      .join(" ");
    if (shippingName) return shippingName;
  }

  // 3. billingAddress.firstName + lastName
  if (data.billingAddress) {
    const billingName = [data.billingAddress.firstName, data.billingAddress.lastName]
      .map(s => s?.trim())
      .filter(Boolean)
      .join(" ");
    if (billingName) return billingName;
  }

  // 4. account display name
  if (data.displayName?.trim() && !data.displayName.includes("@")) return data.displayName.trim();

  return "Valued Customer";
}

// ─── Shared Types ────────────────────────────────────────────────────
export interface EmailItem {
  name: string;
  imageUrl?: string;
  size: string;
  quantity: number;
  unitPrice: number;
  color?: string;
  variant?: string;
}

export interface ThankYouData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  orderDate: string;
  items: EmailItem[];
  subtotal: number;
  shippingAddress: string;
  estimatedDelivery: string;
  shipping?: number;
  tax?: number;
  total?: number;
  paymentMethod?: string;
  trackingId?: string;
  invoiceNumber?: string;
  invoicePdfUrl?: string;
  billingAddress?: string;
  discount?: number;
  shippingMethodName?: string;
  paymentStatus?: string;
}

export interface InvoiceEmailData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  invoiceNumber: string;
  orderNumber: string;
  orderDate: string;
  billingAddress: string;
  shippingAddress: string;
  items: EmailItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
}

export interface AdminNotificationData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  customerEmail: string;
  phone: string;
  orderNumber: string;
  invoiceNumber: string;
  amountPaid: number;
  paymentMethod: string;
  paymentStatus: string;
  shippingAddress: string;
  items: EmailItem[];
  total: number;
  orderTime: string;
}

export interface ShippingUpdateData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  status: "processing" | "packed" | "shipped" | "delivered";
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  items: EmailItem[];
}

export interface ReturnUpdateData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  returnStatus: "requested" | "approved" | "rejected";
  reason?: string;
  items: EmailItem[];
}

export interface RefundUpdateData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  refundStatus: "processed" | "completed";
  amount: number;
  items: EmailItem[];
}

export interface ContactAutoReplyData {
  name: string;
  message: string;
}

export interface ContactNotificationData {
  name: string;
  email: string;
  phone: string;
  message: string;
}

export interface WelcomeEmailData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  shopUrl?: string;
}

export interface PasswordResetData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  resetUrl: string;
}

export interface EmailVerificationData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  verificationUrl: string;
}

export interface PaymentFailedData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  totalAmount: number;
  retryUrl?: string;
}

export interface OrderCancelledData {
  customer?: CustomerNameInput | null;
  customerName?: string; // fallback
  orderNumber: string;
  reason?: string;
  items: EmailItem[];
  refundAmount?: number;
}

// ─── Shared Helpers ───────────────────────────────────────────────────
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ─── Layout Components ────────────────────────────────────────────────
export function wrap(content: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>ANORA</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: ${WHITE}; -webkit-font-smoothing: antialiased; }
    a { color: ${GOLD}; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 32px 24px !important; }
      .item-image { width: 70px !important; height: 70px !important; }
      .logo { font-size: 28px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${WHITE};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${WHITE};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${WHITE};">
          ${content}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function header(): string {
  return `<tr>
    <td style="padding:64px 48px 48px;text-align:center;background-color:${WHITE};">
      <a href="https://anora-elegance.com" style="text-decoration:none;display:inline-block;">
        <h1 class="logo" style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:32px;letter-spacing:10px;color:${DARK};margin:0;font-weight:300;text-transform:uppercase;line-height:1;">ANORA</h1>
        <p style="font-size:10px;letter-spacing:5px;color:${MUTED};margin:8px 0 0;text-transform:uppercase;font-weight:400;line-height:1;">ATELIER</p>
      </a>
    </td>
  </tr>`;
}

export function footer(): string {
  return `<tr>
    <td style="padding:0 48px 64px;background-color:${WHITE};text-align:center;border-top:1px solid #ECECED;">
      <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:${MUTED};margin:32px 0 8px;letter-spacing:0.5px;">
        © ${new Date().getFullYear()} ANORA. Made with elegance.
      </p>
    </td>
  </tr>`;
}

export function orderSummaryTable(items: EmailItem[]): string {
  if (!items || items.length === 0) return "";
  const rows = items
    .map((item) => {
      const imageCell = item.imageUrl
        ? `<img class="item-image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="70" height="70" style="display:block;width:70px;height:70px;object-fit:cover;" />`
        : `<div class="item-image" style="width:70px;height:70px;background-color:#F5F5F7;"></div>`;

      const details: string[] = [];
      if (item.color) details.push(`Color: ${escapeHtml(item.color)}`);
      if (item.size) details.push(`Size: ${escapeHtml(item.size)}`);
      const detailsText = details.length > 0 ? details.join(" &nbsp;·&nbsp; ") : "";

      const itemSubtotal = ((item.unitPrice ?? 0) * (item.quantity ?? 1)).toFixed(2);

      return `<tr>
      <td style="padding:24px 0;border-bottom:1px solid #EAEAEA;vertical-align:middle;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:middle;padding-right:16px;width:70px;">${imageCell}</td>
            <td style="vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <p style="font-size:14px;color:${DARK};margin:0 0 4px;font-weight:500;line-height:1.4;">${escapeHtml(item.name)}</p>
              ${detailsText ? `<p style="font-size:12px;color:${MUTED};margin:0 0 4px;font-weight:400;">${detailsText}</p>` : ""}
              <p style="font-size:12px;color:${MUTED};margin:0;font-weight:400;">Qty &times; ${item.quantity}</p>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:24px 0;border-bottom:1px solid #EAEAEA;text-align:right;vertical-align:middle;font-size:14px;color:${DARK};font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        $${itemSubtotal}
      </td>
    </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tbody>${rows}</tbody>
  </table>`;
}

export function shippingBlock(label: string, address: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
      <td style="padding:8px 0;">
        <p style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 8px;font-weight:600;">${escapeHtml(label)}</p>
        <p style="font-size:13px;color:${TEXT};margin:0;line-height:1.6;">${escapeHtml(address).replace(/\n/g, "<br>")}</p>
      </td>
    </tr>
  </table>`;
}

export function totalRow(label: string, value: string, bold = false, color = TEXT): string {
  const weight = bold ? "font-weight:600;font-size:14px;color:${DARK};" : "font-size:13px;";
  return `<tr>
    <td style="padding:6px 0;text-align:right;color:${MUTED};"><span style="${weight}">${escapeHtml(label)}</span></td>
    <td style="padding:6px 0;text-align:right;width:120px;color:${color};"><span style="${weight}">${escapeHtml(value)}</span></td>
  </tr>`;
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;">
      <p style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 4px;font-weight:500;">${escapeHtml(label)}</p>
      <p style="font-size:13px;color:${DARK};margin:0;">${value}</p>
    </td>
  </tr>`;
}

export function statusBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;font-size:11px;color:${color};border:1px solid ${color};border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;font-weight:500;background-color:${LIGHT_BG};">${escapeHtml(text)}</span>`;
}

export function divider(): string {
  return `<tr><td style="padding:0 48px;background-color:${WHITE};"><div style="height:1px;background-color:${BORDER};"></div></td></tr>`;
}

// ─── Order Confirmation Email ────────────────────────────────────────
export function buildThankYouHtml(data: ThankYouData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  // Format estimated delivery nicely
  let formattedDelivery = data.estimatedDelivery;
  if (formattedDelivery && /^\d{4}-\d{2}-\d{2}$/.test(formattedDelivery)) {
    const parts = formattedDelivery.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    formattedDelivery = d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  const trackingId = data.trackingId || "";
  const trackingUrl = `${env.publicAppUrl}/track?tracking=${encodeURIComponent(trackingId)}`;

  const itemsHtml = orderSummaryTable(data.items);

  const body = `
    <!-- HEADER -->
    ${header()}

    <!-- THANK YOU MESSAGE -->
    <tr>
      <td style="padding: 0 48px; background-color: ${WHITE}; text-align: center;">
        <h2 style="font-family: 'Didot', 'Playfair Display', 'Times New Roman', serif; font-size: 28px; color: ${DARK}; margin: 0 0 16px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase; line-height: 1.2;">Thank You For Your Order</h2>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: ${TEXT}; line-height: 1.6; margin: 0 0 8px; max-width: 480px; display: inline-block;">
          Your order has been successfully placed and payment has been confirmed.
        </p>
        <br/>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: ${TEXT}; line-height: 1.6; margin: 0 0 32px; max-width: 480px; display: inline-block;">
          We are now preparing your order and will notify you again as soon as it ships.
        </p>
        
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${MUTED}; margin: 0 0 8px; font-weight: 600;">Order Number</p>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 20px; color: ${DARK}; margin: 0 0 48px; font-weight: 400; letter-spacing: 0.5px;">${escapeHtml(data.orderNumber)}</p>
      </td>
    </tr>

    <!-- ESTIMATED DELIVERY & CTA BUTTON -->
    <tr>
      <td style="padding: 0 48px; background-color: ${WHITE}; text-align: center;">
        <div style="border-top: 1px solid #ECECED; border-bottom: 1px solid #ECECED; padding: 32px 0; margin-bottom: 48px;">
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: ${MUTED}; margin: 0 0 8px; font-weight: 600;">Estimated Delivery</p>
          <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 18px; color: ${DARK}; margin: 0 0 32px; font-weight: 400;">${escapeHtml(formattedDelivery)}</p>
          
          <a href="${escapeHtml(trackingUrl)}" style="display: inline-block; background-color: ${DARK}; color: ${WHITE}; padding: 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; text-decoration: none; font-weight: 500; transition: background-color 0.2s;">View Your Order</a>
        </div>
      </td>
    </tr>

    <!-- ORDER SUMMARY -->
    <tr>
      <td style="padding: 0 48px; background-color: ${WHITE};">
        <h3 style="font-family: 'Didot', 'Playfair Display', 'Times New Roman', serif; font-size: 18px; color: ${DARK}; margin: 0 0 24px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase;">Order Summary</h3>
        ${itemsHtml}
      </td>
    </tr>

    <!-- PRICE BREAKDOWN -->
    <tr>
      <td style="padding: 24px 48px 48px; background-color: ${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.8;">
          <tr>
            <td style="padding: 6px 0; color: ${MUTED};">Subtotal</td>
            <td style="padding: 6px 0; text-align: right; color: ${DARK};">$${data.subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: ${MUTED};">Shipping</td>
            <td style="padding: 6px 0; text-align: right; color: ${DARK};">${data.shipping && data.shipping > 0 ? `$${data.shipping.toFixed(2)}` : "Free"}</td>
          </tr>
          ${data.tax && data.tax > 0 ? `
          <tr>
            <td style="padding: 6px 0; color: ${MUTED};">Tax</td>
            <td style="padding: 6px 0; text-align: right; color: ${DARK};">$${data.tax.toFixed(2)}</td>
          </tr>
          ` : ""}
          ${data.discount && data.discount > 0 ? `
          <tr>
            <td style="padding: 6px 0; color: ${MUTED};">Discount</td>
            <td style="padding: 6px 0; text-align: right; color: ${RED};">-$${data.discount.toFixed(2)}</td>
          </tr>
          ` : ""}
          <tr>
            <td style="padding: 20px 0 0; font-weight: 600; font-size: 16px; color: ${DARK}; border-top: 1px solid #ECECED;">Total</td>
            <td style="padding: 20px 0 0; text-align: right; font-weight: 600; font-size: 16px; color: ${DARK}; border-top: 1px solid #ECECED;">$${(data.total ?? data.subtotal).toFixed(2)}</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CUSTOMER INFORMATION -->
    <tr>
      <td style="padding: 0 48px 48px; background-color: ${WHITE};">
        <div style="border-top: 1px solid #ECECED; padding-top: 48px;">
          <h3 style="font-family: 'Didot', 'Playfair Display', 'Times New Roman', serif; font-size: 18px; color: ${DARK}; margin: 0 0 32px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase;">Customer Information</h3>
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.6; margin-bottom: 24px;">
            <tr>
              <td style="width: 50%; vertical-align: top; padding-right: 16px;">
                <p style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: ${MUTED}; margin: 0 0 12px; font-weight: 600;">Shipping Address</p>
                <p style="color: ${TEXT}; margin: 0;">${escapeHtml(resolvedName)}</p>
                <p style="color: ${TEXT}; margin: 0; line-height: 1.6;">${escapeHtml(data.shippingAddress).replace(/\n/g, "<br>")}</p>
              </td>
              <td style="width: 50%; vertical-align: top; padding-left: 16px;">
                <p style="font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; color: ${MUTED}; margin: 0 0 12px; font-weight: 600;">Billing Address</p>
                <p style="color: ${TEXT}; margin: 0;">${escapeHtml(resolvedName)}</p>
                <p style="color: ${TEXT}; margin: 0; line-height: 1.6;">${escapeHtml(data.billingAddress || data.shippingAddress).replace(/\n/g, "<br>")}</p>
              </td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.6;">
            <tr>
              <td style="padding: 12px 0; border-top: 1px solid #F4F4F5;">
                <p style="font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: ${MUTED}; margin: 0 0 4px; font-weight: 500;">Shipping Method</p>
                <p style="color: ${DARK}; margin: 0; font-weight: 500;">${escapeHtml(data.shippingMethodName || 'Standard Shipping')}</p>
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>

    <!-- PAYMENT INFORMATION -->
    <tr>
      <td style="padding: 0 48px 48px; background-color: ${WHITE};">
        <div style="border-top: 1px solid #ECECED; padding-top: 48px;">
          <h3 style="font-family: 'Didot', 'Playfair Display', 'Times New Roman', serif; font-size: 18px; color: ${DARK}; margin: 0 0 24px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase;">Payment Information</h3>
          
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.8;">
            <tr>
              <td style="padding: 6px 0; color: ${MUTED};">Payment Method</td>
              <td style="padding: 6px 0; text-align: right; color: ${DARK}; font-weight: 500; text-transform: capitalize;">${escapeHtml(data.paymentMethod || 'Card')}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: ${MUTED};">Payment Status</td>
              <td style="padding: 6px 0; text-align: right; color: ${EMERALD}; font-weight: 500;">${escapeHtml(data.paymentStatus === 'paid' || data.paymentStatus === 'completed' || !data.paymentStatus ? 'Completed' : data.paymentStatus)}</td>
            </tr>
            ${data.invoiceNumber ? `
            <tr>
              <td style="padding: 6px 0; color: ${MUTED};">Invoice Number</td>
              <td style="padding: 6px 0; text-align: right; color: ${DARK}; font-weight: 500;">${escapeHtml(data.invoiceNumber)}</td>
            </tr>
            ` : ""}
          </table>
        </div>
      </td>
    </tr>

    <!-- NEED HELP SECTION -->
    <tr>
      <td style="padding: 48px; background-color: ${WHITE}; text-align: center; border-top: 1px solid #ECECED;">
        <h4 style="font-family: 'Didot', 'Playfair Display', 'Times New Roman', serif; font-size: 18px; color: ${DARK}; margin: 0 0 12px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase;">Need Help?</h4>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; color: ${TEXT}; line-height: 1.6; margin: 0 0 24px;">
          If you have any questions about your order, our support team is always happy to help.
        </p>
        <p style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: ${MUTED}; margin: 0;">
          <a href="mailto:${escapeHtml(env.fromEmail)}" style="color: ${DARK}; text-decoration: none; font-weight: 500;">Email Us</a> &nbsp;·&nbsp;
          <a href="https://instagram.com/anora" style="color: ${DARK}; text-decoration: none; font-weight: 500;">Instagram</a> &nbsp;·&nbsp;
          <a href="https://anora-elegance.com" style="color: ${DARK}; text-decoration: none; font-weight: 500;">Our Website</a>
        </p>
      </td>
    </tr>
  `;
  return wrap(body);
}

// ─── Invoice Email ────────────────────────────────────────────────────
export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Invoice Details</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;text-align:left;">Thank you for your business. Please find your detailed invoice outline below. A PDF copy is attached to this email for your records.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;margin-bottom:16px;">
          <tr>
            <td style="text-align:center;padding:0 8px;border-right:1px solid ${BORDER};width:25%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Invoice No</p>
              <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.invoiceNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 8px;border-right:1px solid ${BORDER};width:25%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order ID</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 8px;border-right:1px solid ${BORDER};width:25%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Date</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${new Date(data.orderDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
            </td>
            <td style="text-align:center;padding:0 8px;width:25%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Status</p>
              <p style="font-size:13px;color:${GOLD};margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(data.paymentStatus)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;padding-right:16px;">${shippingBlock("Billing Address", data.billingAddress)}</td>
            <td style="vertical-align:top;width:50%;padding-left:16px;">${shippingBlock("Shipping Address", data.shippingAddress)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        ${itemsHtml}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${totalRow("Subtotal", `$${data.subtotal.toFixed(2)}`)}
          ${data.shipping > 0 ? totalRow("Shipping", `$${data.shipping.toFixed(2)}`) : totalRow("Shipping", "Complimentary")}
          ${data.tax > 0 ? totalRow("Tax", `$${data.tax.toFixed(2)}`) : ""}
          <tr>
            <td style="padding:12px 0;text-align:right;border-top:1px solid ${BORDER};">
              <span style="font-size:14px;color:${DARK};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Grand Total</span>
            </td>
            <td style="padding:12px 0;text-align:right;border-top:1px solid ${BORDER};width:120px;">
              <span style="font-size:16px;color:${DARK};font-weight:600;">$${data.total.toFixed(2)}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:16px 0 0;text-align:right;">
              <p style="font-size:11px;color:${MUTED};margin:0;text-transform:uppercase;letter-spacing:0.5px;">
                Paid via ${escapeHtml(data.paymentMethod)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Admin Notification ───────────────────────────────────────────────
export function buildAdminNotificationHtml(data: AdminNotificationData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">New Order Received</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">Order and payment details outlined below.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;margin-bottom:16px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order No</p>
              <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Invoice No</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.invoiceNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Total</p>
              <p style="font-size:13px;color:${GOLD};margin:0;font-weight:600;">$${data.amountPaid.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 48px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Customer", escapeHtml(resolvedName))}
                ${infoRow("Email", `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:${DARK};text-decoration:none;font-weight:500;">${escapeHtml(data.customerEmail)}</a>`)}
                ${infoRow("Phone", escapeHtml(data.phone))}
              </table>
            </td>
            <td style="vertical-align:top;width:50%;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Payment Method", escapeHtml(data.paymentMethod).toUpperCase())}
                ${infoRow("Payment Status", statusBadge(data.paymentStatus, GOLD))}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 48px 0;background-color:${WHITE};">
        ${shippingBlock("Shipping Address", data.shippingAddress)}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        ${itemsHtml}
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Shipping Update Email ────────────────────────────────────────────
export function buildShippingUpdateHtml(data: ShippingUpdateData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const statusLabels: Record<string, string> = {
    processing: "Order Processing",
    packed: "Order Packed",
    shipped: "Order Shipped",
    delivered: "Order Delivered",
  };

  const statusDescriptions: Record<string, string> = {
    processing: "Your order is being reviewed and processed by our atelier.",
    packed: "Your pieces have been securely packaged and prepared for dispatch.",
    shipped: "Your parcel is on its way. Use the tracking link below for logistics updates.",
    delivered: "Your package has been safely delivered. We hope you appreciate your new pieces.",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">${statusLabels[data.status] || "Order Shipment Update"}</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;text-align:left;">
                ${statusDescriptions[data.status] || "Your order status has been updated."}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;margin-bottom:16px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order Ref</p>
              <p style="font-size:14px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            ${
              data.trackingNumber
                ? `<td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Tracking</p>
              <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.trackingNumber)}</p>
            </td>`
                : ""
            }
            ${
              data.estimatedDelivery
                ? `<td style="text-align:center;padding:0 10px;width:33%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Est. Delivery</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.estimatedDelivery)}</p>
            </td>`
                : ""
            }
          </tr>
        </table>
      </td>
    </tr>
    ${
      data.trackingUrl
        ? `<tr>
      <td class="content" style="padding:16px 48px;background-color:${WHITE};text-align:center;">
        <a href="${escapeHtml(data.trackingUrl)}" style="display:inline-block;background-color:${DARK};color:${WHITE};padding:14px 36px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-weight:500;border-radius:0;">Track Delivery</a>
      </td>
    </tr>`
        : ""
    }
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <h3 style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 16px;font-weight:600;">Items in This Shipment</h3>
        ${itemsHtml}
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Return Update Email ──────────────────────────────────────────────
export function buildReturnUpdateHtml(data: ReturnUpdateData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const returnLabels: Record<string, string> = {
    requested: "Return Requested",
    approved: "Return Approved",
    rejected: "Return Rejected",
  };
  const returnColors: Record<string, string> = {
    requested: GOLD,
    approved: EMERALD,
    rejected: RED,
  };

  const statusText: Record<string, string> = {
    requested: "We have received your request for a return. Our team will review the details and provide instructions shortly.",
    approved: "Your return request has been approved. Please follow the instructions provided to ship the items back.",
    rejected: "We have reviewed your return request and regret to inform you that we cannot approve a return for these items.",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">${returnLabels[data.returnStatus] || "Return Status"}</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;text-align:left;">
                ${statusText[data.returnStatus] || "Your return status has been updated."}
              </p>
              ${data.reason ? `<p style="font-size:13px;color:${MUTED};margin:12px 0 0;line-height:1.6;text-align:left;font-style:italic;">Reason: "${escapeHtml(data.reason)}"</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};text-align:center;">
        ${statusBadge(returnLabels[data.returnStatus], returnColors[data.returnStatus] || GOLD)}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <h3 style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 16px;font-weight:600;">Returned Pieces</h3>
        ${itemsHtml}
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Refund Update Email ──────────────────────────────────────────────
export function buildRefundUpdateHtml(data: RefundUpdateData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const refundLabels: Record<string, string> = {
    processed: "Refund Processed",
    completed: "Refund Completed",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">${refundLabels[data.refundStatus] || "Refund Notice"}</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;text-align:left;">
                ${data.refundStatus === "processed" ? `A refund of $${data.amount.toFixed(2)} has been initiated for your order. The funds should reflect in your account within 5-10 business days depending on your financial institution.` : `We have finalized your refund of $${data.amount.toFixed(2)}.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;margin-bottom:16px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};width:50%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order Ref</p>
              <p style="font-size:14px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;width:50%;">
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Refund Amount</p>
              <p style="font-size:15px;color:${EMERALD};margin:0;font-weight:600;">$${data.amount.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <h3 style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 16px;font-weight:600;">Items</h3>
        ${itemsHtml}
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Contact Auto-Reply Email ─────────────────────────────────────────
export function buildContactAutoReplyHtml(data: ContactAutoReplyData): string {
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;text-align:center;">Thank You for Reaching Out</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;">Dear ${escapeHtml(data.name)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;">We have successfully received your inquiry. A representative from our atelier will respond to you within 24 business hours.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;">
          <tr>
            <td>
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 8px;font-weight:600;">Your Message</p>
              <p style="font-size:13px;color:${TEXT};margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(data.message)}"</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Contact Notification (Admin) Email ──────────────────────────────
export function buildContactNotificationHtml(data: ContactNotificationData): string {
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">New Customer Inquiry</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">A contact message has been submitted on the site.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          <tr>
            <td style="vertical-align:top;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Sender Name", escapeHtml(data.name))}
                ${infoRow("Sender Email", `<a href="mailto:${escapeHtml(data.email)}" style="color:${DARK};text-decoration:none;font-weight:500;">${escapeHtml(data.email)}</a>`)}
                ${infoRow("Sender Phone", escapeHtml(data.phone))}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;">
          <tr>
            <td>
              <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 8px;font-weight:600;">Message</p>
              <p style="font-size:13px;color:${TEXT};margin:0;line-height:1.6;">${escapeHtml(data.message)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Welcome Email ───────────────────────────────────────────────────
export function buildWelcomeEmailHtml(data: WelcomeEmailData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });
  const shopUrl = data.shopUrl || "https://anora-elegance.com/shop";

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Welcome to ANORA</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;text-align:left;">
                Thank you for creating an account with ANORA. We are dedicated to providing quiet, considered luxury pieces crafted in our atelier for every moment of a lifetime.
              </p>
              <a href="${escapeHtml(shopUrl)}" style="display:inline-block;background-color:${DARK};color:${WHITE};padding:14px 36px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-weight:500;border-radius:0;">Explore the Collection</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Password Reset Email ────────────────────────────────────────────
export function buildPasswordResetHtml(data: PasswordResetData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Reset Your Password</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;text-align:left;">
                We received a request to reset your password. Click the link below to configure a new password. If you did not request this change, please ignore this email.
              </p>
              <a href="${escapeHtml(data.resetUrl)}" style="display:inline-block;background-color:${DARK};color:${WHITE};padding:14px 36px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-weight:500;border-radius:0;">Reset Password</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Email Verification Email ────────────────────────────────────────
export function buildEmailVerificationHtml(data: EmailVerificationData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Confirm Your Email</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;text-align:left;">
                Thank you for signing up. Please verify your email address by clicking the confirmation link below.
              </p>
              <a href="${escapeHtml(data.verificationUrl)}" style="display:inline-block;background-color:${DARK};color:${WHITE};padding:14px 36px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-weight:500;border-radius:0;">Verify Email</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Payment Failed Email ────────────────────────────────────────────
export function buildPaymentFailedHtml(data: PaymentFailedData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });
  const retryUrl = data.retryUrl || "https://anora-elegance.com/checkout";

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${RED};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Payment Transaction Failed</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;text-align:left;">
                We were unable to process the payment for order ${escapeHtml(data.orderNumber)} (amounting to $${data.totalAmount.toFixed(2)}). Please click the button below to update your billing details and complete checkout.
              </p>
              <a href="${escapeHtml(retryUrl)}" style="display:inline-block;background-color:${DARK};color:${WHITE};padding:14px 36px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;font-weight:500;border-radius:0;">Retry Payment</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Order Cancelled Email ───────────────────────────────────────────
export function buildOrderCancelledHtml(data: OrderCancelledData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">Your Order has been Cancelled</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;text-align:left;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;text-align:left;">
                We have cancelled order ${escapeHtml(data.orderNumber)} per request or automatic verification.
                ${data.refundAmount && data.refundAmount > 0 ? ` A refund of $${data.refundAmount.toFixed(2)} has been processed to your original payment method.` : ""}
              </p>
              ${data.reason ? `<p style="font-size:13px;color:${MUTED};margin:12px 0 0;line-height:1.6;text-align:left;font-style:italic;">Reason: "${escapeHtml(data.reason)}"</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 48px 0;background-color:${WHITE};">
        <h3 style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 16px;font-weight:600;">Cancelled Items</h3>
        ${itemsHtml}
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Branded Notification Email ──────────────────────────────────────────
export interface NotificationEmailData {
  title: string;
  message: string;
  customerName?: string;
  customer?: CustomerNameInput | null;
}

export function buildNotificationEmailHtml(data: NotificationEmailData): string {
  const resolvedName = getCustomerDisplayName(data.customer || { displayName: data.customerName });
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0 32px;text-align:left;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;">${escapeHtml(data.title)}</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;">
                ${data.message}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

export interface ReviewRequestProduct {
  name: string;
  imageUrl?: string;
  reviewUrl: string;
}

export interface ReviewRequestData {
  customerName?: string;
  products: ReviewRequestProduct[];
}

export function buildReviewRequestHtml(data: ReviewRequestData): string {
  const resolvedName = data.customerName || "Valued Customer";
  
  const productRows = data.products.map(p => `
    <tr style="border-bottom:1px solid ${BORDER};">
      <td style="padding:24px 0;width:80px;vertical-align:middle;">
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${escapeHtml(p.name)}" width="80" style="width:80px;height:auto;display:block;border:1px solid ${BORDER};" />` : `<div style="width:80px;height:80px;background-color:${LIGHT_BG};border:1px solid ${BORDER};"></div>`}
      </td>
      <td style="padding:24px 0 24px 20px;vertical-align:middle;text-align:left;">
        <h4 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:16px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:0.5px;">${escapeHtml(p.name)}</h4>
        <a href="${p.reviewUrl}" style="display:inline-block;background-color:${DARK};color:${WHITE};text-decoration:none;padding:10px 20px;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;margin-top:4px;">Review Purchase</a>
      </td>
    </tr>
  `).join("");

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 48px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:40px 0 24px;text-align:left;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;text-align:center;">Your ANORA Experience</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;">Dear ${escapeHtml(resolvedName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;">
                We hope your recent ANORA pieces are serving you beautifully. We invite you to share your thoughts on the fit, fabric, and craftsmanship of your selection.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${productRows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

