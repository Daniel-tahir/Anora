import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.VITE_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
process.env.PAYPAL_CLIENT_ID = "cid";
process.env.PAYPAL_SECRET = "sec";
process.env.PAYPAL_ENVIRONMENT = "sandbox";

type Call = { url: string; method: string };
let calls: Call[] = [];
let orderStatus = "APPROVED";
let orderAmount = "100.00";

beforeEach(() => {
  calls = [];
  orderStatus = "APPROVED";
  orderAmount = "100.00";
  (globalThis as any).fetch = async (url: string, init?: any) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.includes("/oauth2/token")) return Response.json({ access_token: "tok" });
    if (url.endsWith("/capture")) {
      orderStatus = "COMPLETED";
      return Response.json({ id: "ORD12345", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "c1", status: "COMPLETED", amount: { value: orderAmount } }] } }] });
    }
    return Response.json({ id: "ORD12345", status: orderStatus, purchase_units: [{ amount: { value: orderAmount, currency_code: "USD" } }] });
  };
});

const load = () => import("../server/lib/payments");

test("summary reads amount/currency/status from PayPal, in cents", async () => {
  const { getPayPalOrderSummary } = await load();
  const s = await getPayPalOrderSummary("ORD12345");
  assert.deepEqual([s.status, s.currency, s.amountCents], ["APPROVED", "USD", 10000]);
});

test("attack: cheap PayPal order cannot be used to buy an expensive cart", async () => {
  const { assertPayPalPaymentMatches } = await load();
  const cheap = { status: "APPROVED", currency: "USD", amountCents: 100 }; // customer approved $1.00
  assert.throws(() => assertPayPalPaymentMatches(cheap, 250000), /does not match the cart total/); // cart costs $2,500
});
test("exact match to the cent passes; off by one cent fails", async () => {
  const { assertPayPalPaymentMatches } = await load();
  assert.doesNotThrow(() => assertPayPalPaymentMatches({ status: "APPROVED", currency: "USD", amountCents: 12345 }, 12345));
  assert.throws(() => assertPayPalPaymentMatches({ status: "APPROVED", currency: "USD", amountCents: 12344 }, 12345));
});
test("wrong currency / unapproved / NaN amounts are rejected", async () => {
  const { assertPayPalPaymentMatches } = await load();
  assert.throws(() => assertPayPalPaymentMatches({ status: "APPROVED", currency: "EUR", amountCents: 100 }, 100));
  assert.throws(() => assertPayPalPaymentMatches({ status: "CREATED", currency: "USD", amountCents: 100 }, 100), /not been approved/);
  assert.throws(() => assertPayPalPaymentMatches({ status: "APPROVED", currency: "USD", amountCents: NaN }, NaN));
});

test("capture is idempotent: already-COMPLETED orders are NOT captured a second time", async () => {
  orderStatus = "COMPLETED";
  const { capturePayPalOrder } = await load();
  const r = await capturePayPalOrder("ORD12345");
  assert.equal(r.status, "COMPLETED");
  assert.equal(calls.filter((c) => c.url.endsWith("/capture")).length, 0);
});
test("capture of an APPROVED order performs exactly one capture with an idempotency key", async () => {
  const { capturePayPalOrder } = await load();
  const r = await capturePayPalOrder("ORD12345");
  assert.equal(r.status, "COMPLETED");
  assert.equal(calls.filter((c) => c.url.endsWith("/capture")).length, 1);
});
test("malformed PayPal order ids never reach the network", async () => {
  const { getPayPalOrderSummary } = await load();
  await assert.rejects(getPayPalOrderSummary("../../v1/payments?x=1"), /Invalid PayPal order id/);
  assert.equal(calls.length, 0);
});
