// ─── Color Constants ─────────────────────────────────────────────────
export const GOLD = "#C9A96E";
export const DARK = "#1A1A1A";
export const LIGHT_BG = "#F9F9F9";
export const WHITE = "#FFFFFF";
export const TEXT = "#2D2D2D";
export const MUTED = "#888888";
export const BORDER = "#E8E8E8";
export const EMERALD = "#059669";

// ─── Shared Types ────────────────────────────────────────────────────
export interface EmailItem {
  name: string;
  imageUrl?: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

export interface ThankYouData {
  customerName: string;
  orderNumber: string;
  orderDate: string;
  items: EmailItem[];
  subtotal: number;
  shippingAddress: string;
  estimatedDelivery: string;
}

export interface InvoiceEmailData {
  customerName: string;
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
  customerName: string;
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
  customerName: string;
  orderNumber: string;
  status: "processing" | "packed" | "shipped" | "delivered";
  trackingNumber?: string;
  trackingUrl?: string;
  estimatedDelivery?: string;
  items: EmailItem[];
}

export interface ReturnUpdateData {
  customerName: string;
  orderNumber: string;
  returnStatus: "requested" | "approved" | "rejected";
  reason?: string;
  items: EmailItem[];
}

export interface RefundUpdateData {
  customerName: string;
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
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: ${LIGHT_BG}; -webkit-font-smoothing: antialiased; }
    a { color: ${GOLD}; text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 24px 20px !important; }
      .item-image { width: 60px !important; height: 60px !important; }
      .logo { font-size: 22px !important; }
    }
    @media (prefers-color-scheme: dark) {
      body { background-color: #121212 !important; }
      .container { background-color: #1E1E1E !important; }
      .content { background-color: #1E1E1E !important; }
      h1, h2, h3, h4, p, td, th { color: #E0E0E0 !important; }
      .muted { color: #999 !important; }
      .border { border-color: #333 !important; }
      .bg-light { background-color: #2A2A2A !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT_BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${WHITE};border-radius:4px;overflow:hidden;">
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
    <td class="content" style="padding:40px 40px 20px;text-align:center;background-color:${WHITE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-bottom:20px;border-bottom:1px solid ${BORDER};">
            <a href="https://anora-elegance.com" style="text-decoration:none;">
              <h1 class="logo" style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:26px;letter-spacing:6px;color:${GOLD};margin:0;font-weight:400;">ANORA</h1>
              <p style="font-size:10px;letter-spacing:3px;color:${MUTED};margin:4px 0 0;text-transform:uppercase;">Elegance Crafted For Every Moment</p>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function footer(): string {
  return `<tr>
    <td class="content" style="padding:20px 40px 40px;background-color:${WHITE};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:20px 0 0;border-top:1px solid ${BORDER};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <a href="https://instagram.com/anora_ny" style="display:inline-block;margin:0 6px;color:${MUTED};font-size:12px;letter-spacing:1px;text-transform:uppercase;">Instagram</a>
                  <span style="color:${BORDER};margin:0 4px;">|</span>
                  <a href="https://facebook.com/anora" style="display:inline-block;margin:0 6px;color:${MUTED};font-size:12px;letter-spacing:1px;text-transform:uppercase;">Facebook</a>
                  <span style="color:${BORDER};margin:0 4px;">|</span>
                  <a href="https://pinterest.com/anora" style="display:inline-block;margin:0 6px;color:${MUTED};font-size:12px;letter-spacing:1px;text-transform:uppercase;">Pinterest</a>
                </td>
              </tr>
            </table>
            <p style="font-size:11px;color:${MUTED};text-align:center;margin:0 0 4px;line-height:1.6;">
              ANORA — Elegance Crafted For Every Moment
            </p>
            <p style="font-size:11px;color:${MUTED};text-align:center;margin:0;line-height:1.6;">
              <a href="mailto:support@anora-elegance.com" style="color:${MUTED};text-decoration:underline;">support@anora-elegance.com</a>
              &nbsp;|&nbsp; +1 (347) 325-6525
            </p>
            <p style="font-size:10px;color:${MUTED};text-align:center;margin:12px 0 0;line-height:1.5;">
              If you have any questions, please reply to this email or contact our support team.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

export function orderSummaryTable(items: EmailItem[]): string {
  if (items.length === 0) return "";
  const rows = items
    .map((item, i) => {
      const imageCell = item.imageUrl
        ? `<img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" width="64" height="64" style="display:block;width:64px;height:64px;border-radius:2px;object-fit:cover;" />`
        : `<div style="width:64px;height:64px;background-color:${LIGHT_BG};border-radius:2px;"></div>`;

      const subtotal = (item.unitPrice * item.quantity).toFixed(2);

      return `<tr${i % 2 === 0 ? ` bgcolor="${LIGHT_BG}"` : ""}>
      <td style="padding:12px 8px;border-bottom:1px solid ${BORDER};">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:middle;padding-right:12px;">${imageCell}</td>
            <td style="vertical-align:middle;">
              <p style="font-size:13px;color:${TEXT};margin:0 0 2px;font-weight:500;">${escapeHtml(item.name)}</p>
              <p style="font-size:11px;color:${MUTED};margin:0;">Size: ${escapeHtml(item.size)}</p>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:12px 8px;border-bottom:1px solid ${BORDER};text-align:center;font-size:13px;color:${TEXT};">${item.quantity}</td>
      <td style="padding:12px 8px;border-bottom:1px solid ${BORDER};text-align:right;font-size:13px;color:${TEXT};">$${item.unitPrice.toFixed(2)}</td>
      <td style="padding:12px 8px;border-bottom:1px solid ${BORDER};text-align:right;font-size:13px;color:${TEXT};font-weight:500;">$${subtotal}</td>
    </tr>`;
    })
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <thead>
      <tr style="background-color:${DARK};">
        <th style="padding:10px 8px;text-align:left;font-size:9px;letter-spacing:2px;color:${WHITE};text-transform:uppercase;font-weight:400;">Item</th>
        <th style="padding:10px 8px;text-align:center;font-size:9px;letter-spacing:2px;color:${WHITE};text-transform:uppercase;font-weight:400;">Qty</th>
        <th style="padding:10px 8px;text-align:right;font-size:9px;letter-spacing:2px;color:${WHITE};text-transform:uppercase;font-weight:400;">Price</th>
        <th style="padding:10px 8px;text-align:right;font-size:9px;letter-spacing:2px;color:${WHITE};text-transform:uppercase;font-weight:400;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function shippingBlock(label: string, address: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
    <tr>
      <td style="padding:16px 0 8px;">
        <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;font-weight:500;">${escapeHtml(label)}</p>
        <p style="font-size:13px;color:${TEXT};margin:0;line-height:1.6;">${escapeHtml(address).replace(/\n/g, "<br>")}</p>
      </td>
    </tr>
  </table>`;
}

export function totalRow(label: string, value: string, bold = false, color = TEXT): string {
  const weight = bold ? "font-weight:600;" : "";
  return `<tr>
    <td style="padding:4px 0;text-align:right;"><span style="font-size:13px;color:${MUTED};">${escapeHtml(label)}</span></td>
    <td style="padding:4px 0;text-align:right;width:100px;"><span style="font-size:13px;color:${color};${weight}">${value}</span></td>
  </tr>`;
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;"><p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 2px;">${escapeHtml(label)}</p>
    <p style="font-size:13px;color:${TEXT};margin:0;">${value}</p></td>
  </tr>`;
}

export function statusBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;font-size:11px;color:${color};border:1px solid ${color};border-radius:2px;text-transform:capitalize;">${escapeHtml(text)}</span>`;
}

export function divider(): string {
  return `<tr><td style="padding:0 40px;background-color:${WHITE};"><div style="height:1px;background-color:${BORDER};"></div></td></tr>`;
}

// ─── Thank You Email ─────────────────────────────────────────────────
export function buildThankYouHtml(data: ThankYouData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:50%;background-color:${GOLD};display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="color:${WHITE};font-size:24px;">✓</span>
              </div>
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">Thank You for Your Order</h2>
              <p style="font-size:14px;color:${MUTED};margin:0 0 4px;line-height:1.6;">Dear ${escapeHtml(data.customerName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;">We are delighted to confirm your order. Your pieces are being prepared with the utmost care and will be on their way to you shortly.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order Number</p>
              <p style="font-size:15px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order Date</p>
              <p style="font-size:15px;color:${DARK};margin:0;">${escapeHtml(data.orderDate)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Est. Delivery</p>
              <p style="font-size:15px;color:${DARK};margin:0;">${escapeHtml(data.estimatedDelivery)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Order Summary</h3>
        ${itemsHtml}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:16px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;text-align:right;"><span style="font-size:13px;color:${MUTED};">Subtotal</span></td>
            <td style="padding:8px 0;text-align:right;width:100px;"><span style="font-size:13px;color:${TEXT};">$${data.subtotal.toFixed(2)}</span></td>
          </tr>
          <tr>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};"><span style="font-size:15px;color:${DARK};font-weight:600;">Total</span></td>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};width:100px;"><span style="font-size:15px;color:${GOLD};font-weight:600;">$${data.subtotal.toFixed(2)}</span></td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        ${shippingBlock("Shipping Address", data.shippingAddress)}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:10px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0;text-align:center;border-top:1px solid ${BORDER};">
              <p style="font-size:12px;color:${MUTED};margin:0 0 8px;line-height:1.6;">
                Need help with your order? Contact us at
                <a href="mailto:support@anora-elegance.com" style="color:${GOLD};text-decoration:underline;">support@anora-elegance.com</a>
                or call <a href="tel:+13473256525" style="color:${GOLD};text-decoration:none;">+1 (347) 325-6525</a>
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

// ─── Invoice Email ────────────────────────────────────────────────────
export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">Invoice</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">Dear ${escapeHtml(data.customerName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:8px 0 0;line-height:1.6;">Please find your invoice below. A PDF copy is attached for your records.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Invoice</p>
              <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.invoiceNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Date</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.orderDate)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Status</p>
              <p style="font-size:13px;color:${GOLD};margin:0;font-weight:500;text-transform:capitalize;">${escapeHtml(data.paymentStatus)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;padding-right:10px;">${shippingBlock("Billing Address", data.billingAddress)}</td>
            <td style="vertical-align:top;width:50%;padding-left:10px;">${shippingBlock("Shipping Address", data.shippingAddress)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Items</h3>
        ${itemsHtml}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:16px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${totalRow("Subtotal", `$${data.subtotal.toFixed(2)}`)}
          ${data.shipping > 0 ? totalRow("Shipping", `$${data.shipping.toFixed(2)}`) : ""}
          ${data.tax > 0 ? totalRow("Tax", `$${data.tax.toFixed(2)}`) : ""}
          <tr>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};">
              <span style="font-size:15px;color:${DARK};font-weight:600;">Grand Total</span>
            </td>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};width:100px;">
              <span style="font-size:15px;color:${GOLD};font-weight:600;">$${data.total.toFixed(2)}</span>
            </td>
          </tr>
          <tr>
            <td colspan="2" style="padding:12px 0 0;text-align:right;">
              <p style="font-size:11px;color:${MUTED};margin:0;">
                Paid via ${escapeHtml(data.paymentMethod)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:20px 0;border-top:1px solid ${BORDER};">
              <p style="font-size:11px;color:${MUTED};margin:0 0 4px;line-height:1.6;">
                <strong>ANORA</strong> — Elegance Crafted For Every Moment
              </p>
              <p style="font-size:11px;color:${MUTED};margin:0;line-height:1.6;">
                support@anora-elegance.com | +1 (347) 325-6525
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
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">New Order Received</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">A new order has been placed and requires attention.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order</p>
              <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Invoice</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.invoiceNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Amount</p>
              <p style="font-size:13px;color:${GOLD};margin:0;font-weight:500;">$${data.amountPaid.toFixed(2)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Time</p>
              <p style="font-size:11px;color:${DARK};margin:0;">${escapeHtml(data.orderTime)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Customer", escapeHtml(data.customerName))}
                ${infoRow("Email", `<a href="mailto:${escapeHtml(data.customerEmail)}" style="color:${GOLD};">${escapeHtml(data.customerEmail)}</a>`)}
                ${infoRow("Phone", escapeHtml(data.phone))}
              </table>
            </td>
            <td style="vertical-align:top;width:50%;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Payment", escapeHtml(data.paymentMethod))}
                ${infoRow("Status", statusBadge(data.paymentStatus, GOLD))}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        ${shippingBlock("Shipping Address", data.shippingAddress)}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Ordered Products</h3>
        ${itemsHtml}
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:16px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};">
              <span style="font-size:15px;color:${DARK};font-weight:600;">Total</span>
            </td>
            <td style="padding:8px 0;text-align:right;border-top:2px solid ${GOLD};width:100px;">
              <span style="font-size:15px;color:${GOLD};font-weight:600;">$${data.total.toFixed(2)}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${footer()}
  `;
  return wrap(body);
}

// ─── Shipping Update Email ────────────────────────────────────────────
export function buildShippingUpdateHtml(data: ShippingUpdateData): string {
  const itemsHtml = orderSummaryTable(data.items);
  const statusLabels: Record<string, string> = {
    processing: "Order Processing",
    packed: "Order Packed",
    shipped: "Order Shipped",
    delivered: "Order Delivered",
  };
  const statusIcons: Record<string, string> = {
    processing: "⚙",
    packed: "📦",
    shipped: "🚚",
    delivered: "✓",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:50%;background-color:${GOLD};display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:24px;color:${WHITE};">
                ${statusIcons[data.status] || "✓"}
              </div>
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">${statusLabels[data.status] || "Order Update"}</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">Dear ${escapeHtml(data.customerName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:8px 0 0;line-height:1.6;">
                ${data.status === "delivered" ? "Your order has been delivered. We hope you love your pieces." : `Your order is being updated. Here is the latest information.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order</p>
              <p style="font-size:15px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            ${
              data.trackingNumber
                ? `<td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Tracking</p>
              <p style="font-size:13px;color:${DARK};margin:0;">${escapeHtml(data.trackingNumber)}</p>
            </td>`
                : ""
            }
            ${
              data.estimatedDelivery
                ? `<td style="text-align:center;padding:0 10px;">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Est. Delivery</p>
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
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;padding:16px 0;">
              <a href="${escapeHtml(data.trackingUrl)}" style="display:inline-block;background-color:${GOLD};color:${WHITE};padding:12px 32px;font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;border-radius:2px;">Track Your Order</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
        : ""
    }
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Items in This Order</h3>
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
  const returnLabels: Record<string, string> = {
    requested: "Return Requested",
    approved: "Return Approved",
    rejected: "Return Rejected",
  };
  const returnColors: Record<string, string> = {
    requested: GOLD,
    approved: EMERALD,
    rejected: "#DC2626",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">${returnLabels[data.returnStatus] || "Return Update"}</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">Dear ${escapeHtml(data.customerName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:8px 0 0;line-height:1.6;">
                ${data.returnStatus === "requested" ? "We have received your return request and will review it shortly." : data.returnStatus === "approved" ? "Your return has been approved. Please ship the items back to us." : "We have reviewed your return request and are unable to process it at this time."}
              </p>
              ${data.reason ? `<p style="font-size:13px;color:${MUTED};margin:8px 0 0;line-height:1.6;">Reason: ${escapeHtml(data.reason)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;padding:16px 0;">
              ${statusBadge(returnLabels[data.returnStatus], returnColors[data.returnStatus])}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Items in Return</h3>
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
  const refundLabels: Record<string, string> = {
    processed: "Refund Processed",
    completed: "Refund Completed",
  };

  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <div style="width:56px;height:56px;border-radius:50%;background-color:${EMERALD};display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
                <span style="color:${WHITE};font-size:24px;">✓</span>
              </div>
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">${refundLabels[data.refundStatus] || "Refund Update"}</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">Dear ${escapeHtml(data.customerName)},</p>
              <p style="font-size:14px;color:${TEXT};margin:8px 0 0;line-height:1.6;">
                ${data.refundStatus === "processed" ? `A refund of $${data.amount.toFixed(2)} has been initiated for your order. It may take 5-10 business days to appear in your account.` : `Your refund of $${data.amount.toFixed(2)} has been completed.`}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td style="text-align:center;padding:0 10px;border-right:1px solid ${BORDER};">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Order</p>
              <p style="font-size:15px;color:${DARK};margin:0;font-weight:500;">${escapeHtml(data.orderNumber)}</p>
            </td>
            <td style="text-align:center;padding:0 10px;">
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Refund Amount</p>
              <p style="font-size:15px;color:${EMERALD};margin:0;font-weight:600;">$${data.amount.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <h3 style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${DARK};margin:0 0 16px;font-weight:500;">Items</h3>
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
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">We Received Your Message</h2>
              <p style="font-size:14px;color:${MUTED};margin:0 0 4px;line-height:1.6;">Dear ${escapeHtml(data.name)},</p>
              <p style="font-size:14px;color:${TEXT};margin:0;line-height:1.6;">Thank you for reaching out. We have received your message and will respond within 24 hours.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td>
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 8px;">Your Message</p>
              <p style="font-size:13px;color:${TEXT};margin:0;line-height:1.6;font-style:italic;">"${escapeHtml(data.message)}"</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:24px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px 0;border-top:1px solid ${BORDER};text-align:center;">
              <p style="font-size:12px;color:${MUTED};margin:0 0 8px;line-height:1.6;">
                In the meantime, visit our <a href="https://anora-elegance.com/shop" style="color:${GOLD};text-decoration:underline;">shop</a> or follow us on social media.
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

// ─── Contact Notification (Admin) Email ──────────────────────────────
export function buildContactNotificationHtml(data: ContactNotificationData): string {
  const body = `
    ${header()}
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:30px 0 20px;text-align:center;">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:22px;color:${DARK};margin:0 0 8px;font-weight:400;letter-spacing:1px;">New Contact Message</h2>
              <p style="font-size:14px;color:${MUTED};margin:0;line-height:1.6;">A customer has submitted a contact form.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:0 40px;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;width:50%;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                ${infoRow("Name", escapeHtml(data.name))}
                ${infoRow("Email", `<a href="mailto:${escapeHtml(data.email)}" style="color:${GOLD};">${escapeHtml(data.email)}</a>`)}
                ${infoRow("Phone", escapeHtml(data.phone))}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td class="content" style="padding:20px 40px 0;background-color:${WHITE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:2px;padding:20px;">
          <tr>
            <td>
              <p style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:${MUTED};margin:0 0 8px;">Message</p>
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
