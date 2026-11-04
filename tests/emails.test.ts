import { test } from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.PUBLIC_APP_URL = "https://shop.example.test";
process.env.FROM_EMAIL = "help@example.test";

const items = [{ name: "Silk Dress", size: "M", quantity: 2, unitPrice: 120, color: "Ivory" }];
const load = () => import("../server/templates");

const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

test("no em dashes, en dashes or placeholder text in any email", async () => {
  const t = await load();
  const outputs: Record<string, string> = {
    shipped: t.buildShippingUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", status: "shipped", trackingNumber: "TCS 123", trackingUrl: "https://x.test/t", estimatedDelivery: "Nov 9, 2026", items }),
    delivered: t.buildShippingUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", status: "delivered", items }),
    cancelled: t.buildOrderCancelledHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", reason: "Changed my mind", refundAmount: 240, items } as never),
    contactReply: t.buildContactAutoReplyHtml({ name: "Sara", message: "Hi" } as never),
    contactAdmin: t.buildContactNotificationHtml({ name: "Sara", email: "s@x.test", phone: "1", message: "Hi" } as never),
    newsletter: t.buildNewsletterWelcomeHtml({ unsubscribeUrl: "https://shop.example.test/api/newsletter/unsubscribe?token=abc" }),
    paymentFailed: t.buildPaymentFailedHtml({ customerName: "Sara Khan", totalAmount: 240 } as never),
    paymentFailedWithOrder: t.buildPaymentFailedHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", totalAmount: 240 } as never),
    welcome: t.buildWelcomeEmailHtml({ customerName: "Sara Khan" } as never),
    reset: t.buildPasswordResetHtml({ customerName: "Sara Khan", resetUrl: "https://x.test/r" } as never),
    verify: t.buildEmailVerificationHtml({ customerName: "Sara Khan", verificationUrl: "https://x.test/v" } as never),
    refundProcessed: t.buildRefundUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", refundStatus: "processed", amount: 50, items } as never),
    refundCompleted: t.buildRefundUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", refundStatus: "completed", amount: 50, items } as never),
    return: t.buildReturnUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", returnStatus: "approved", items } as never),
    review: t.buildReviewRequestHtml({ customerName: "Sara Khan", products: [{ name: "Silk Dress", reviewUrl: "https://x.test/review/1" }] } as never),
  };
  const banned = /[\u2014\u2013]|undefined|\[object|NaN|anora-elegance\.com|atelier|elegance|curated|seamless|journey|crafted|concierge/i;
  for (const [name, html] of Object.entries(outputs)) {
    const visible = text(html);
    assert.doesNotMatch(visible, banned, `${name}: ${visible.match(banned)?.[0]}`);
    assert.doesNotMatch(html, /anora-elegance\.com/, `${name} hardcodes a domain`);
  }
});

test("links come from the configured site URL", async () => {
  const t = await load();
  const html = t.buildWelcomeEmailHtml({ customerName: "Sara Khan" } as never);
  assert.match(html, /https:\/\/shop\.example\.test\/shop/);
  assert.match(t.buildPaymentFailedHtml({ totalAmount: 5 } as never), /https:\/\/shop\.example\.test\/checkout/);
});

test("shipped email shows tracking details; delivered does not invent any", async () => {
  const t = await load();
  const shipped = text(t.buildShippingUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", status: "shipped", trackingNumber: "TCS 123", estimatedDelivery: "Nov 9, 2026", items }));
  assert.match(shipped, /Your order has been shipped/);
  assert.match(shipped, /TCS 123/);
  assert.match(shipped, /Nov 9, 2026/);
  const delivered = text(t.buildShippingUpdateHtml({ customerName: "Sara Khan", orderNumber: "ANR-1", status: "delivered", items }));
  assert.match(delivered, /has been delivered/);
  assert.doesNotMatch(delivered, /Tracking/);
});

test("cancelled email mentions a refund only when there is one", async () => {
  const t = await load();
  const withRefund = text(t.buildOrderCancelledHtml({ customerName: "Sara", orderNumber: "ANR-1", refundAmount: 240, items } as never));
  assert.match(withRefund, /refund of \$240\.00/);
  const noRefund = text(t.buildOrderCancelledHtml({ customerName: "Sara", orderNumber: "ANR-1", items } as never));
  assert.doesNotMatch(noRefund, /refund/i);
});

test("payment failed email works with and without an order number", async () => {
  const t = await load();
  const a = text(t.buildPaymentFailedHtml({ customerName: "Sara", totalAmount: 240 } as never));
  assert.match(a, /payment of \$240\.00\. No order has been placed/);
  const b = text(t.buildPaymentFailedHtml({ customerName: "Sara", orderNumber: "ANR-1", totalAmount: 240 } as never));
  assert.match(b, /for order ANR-1/);
});

test("customer-typed text is escaped (no HTML injection)", async () => {
  const t = await load();
  const evil = `<img src=x onerror=alert(1)>`;
  const html = t.buildContactNotificationHtml({ name: evil, email: "a@b.test", phone: evil, message: evil } as never);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  const cancelled = t.buildOrderCancelledHtml({ customerName: evil, orderNumber: "A", reason: evil, items } as never);
  assert.doesNotMatch(cancelled, /<img src=x/);
});

test("newsletter email always has an unsubscribe link", async () => {
  const t = await load();
  const html = t.buildNewsletterWelcomeHtml({ unsubscribeUrl: "https://shop.example.test/api/newsletter/unsubscribe?token=t1" });
  assert.match(html, /unsubscribe\?token=t1/);
  assert.match(text(html), /Unsubscribe/);
});
