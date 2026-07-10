import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const envPath = join(__dirname, "..", ".env");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
}

const SUPABASE_URL = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const ALL_RPCS = [
  "has_admin_role",
  "is_admin",
  "is_staff",
  "get_analytics_summary",
  "get_sales_analytics",
  "get_revenue_analytics",
  "get_orders_by_status_distribution",
  "get_orders_by_category_distribution",
  "get_customer_analytics",
  "get_top_selling_products",
  "get_bottom_selling_products",
  "get_order_metrics",
  "get_orders_management",
  "get_order_details",
  "update_order_status",
  "create_return_request",
  "process_return",
  "create_refund",
  "process_refund",
  "get_products_management",
  "duplicate_product",
  "bulk_update_products",
  "bulk_delete_products",
  "get_categories_management",
  "create_category",
  "update_category",
  "delete_category",
  "get_inventory_management",
  "get_inventory_summary",
  "get_inventory_history",
  "get_inventory_alerts",
  "adjust_stock",
  "add_stock",
  "remove_stock",
  "resolve_alert",
  "get_customers_management",
  "get_customer_details",
  "get_customers_analytics",
  "get_reviews_management",
  "get_review_details",
  "get_review_stats",
  "approve_review",
  "reject_review",
  "delete_review",
  "get_coupons_management",
  "get_coupon_analytics",
  "create_coupon",
  "update_coupon",
  "delete_coupon",
  "toggle_coupon_status",
  "get_gift_cards_management",
  "get_gift_card_details",
  "get_gift_card_analytics",
  "create_gift_card",
  "toggle_gift_card_status",
  "redeem_gift_card",
  "get_finance_dashboard",
  "get_revenue_trend",
  "get_tax_trend",
  "get_refund_trend",
  "get_discount_trend",
  "get_monthly_comparison",
  "get_yearly_comparison",
  "get_invoices_management",
  "get_invoice_details",
  "generate_invoice",
  "update_invoice_status",
  "get_revenue_report",
  "get_financial_report",
  "get_customer_report",
  "get_inventory_report",
  "get_export_data",
  "get_activity_timeline",
  "get_audit_logs",
  "get_admin_activity",
  "get_failed_login_summary",
  "get_active_sessions",
  "get_security_overview",
  "end_user_session",
  "mark_cart_recovered",
  "mark_cart_converted",
  "record_admin_activity",
  "check_login_lockout",
  "record_failed_login",
  "get_abandoned_carts",
  "get_abandoned_cart_analytics",
];

const UUID_ZERO = "00000000-0000-0000-0000-000000000000";

const MIN_PARAMS = {
  has_admin_role: {},
  is_admin: {},
  is_staff: {},
  adjust_stock: { p_product_id: UUID_ZERO, p_new_stock: 0 },
  add_stock: { p_product_id: UUID_ZERO, p_quantity: 0 },
  remove_stock: { p_product_id: UUID_ZERO, p_quantity: 0 },
  resolve_alert: { p_alert_id: UUID_ZERO },
  end_user_session: { p_session_id: UUID_ZERO },
  mark_cart_recovered: { p_cart_id: UUID_ZERO },
  mark_cart_converted: { p_cart_id: UUID_ZERO, p_order_id: UUID_ZERO },
  create_category: { p_name: "test", p_slug: "test" },
  update_category: { p_id: UUID_ZERO, p_name: "test", p_slug: "test" },
  delete_category: { p_id: UUID_ZERO },
  delete_coupon: { p_coupon_id: UUID_ZERO },
  toggle_coupon_status: { p_coupon_id: UUID_ZERO },
  toggle_gift_card_status: { p_gift_card_id: UUID_ZERO },
  redeem_gift_card: { p_gift_card_id: UUID_ZERO, p_amount: 0, p_order_id: UUID_ZERO },
  delete_review: { p_review_id: UUID_ZERO },
  approve_review: { p_review_id: UUID_ZERO },
  reject_review: { p_review_id: UUID_ZERO, p_admin_note: "test" },
  record_admin_activity: { p_action: "verify_test" },
  record_failed_login: { p_email: "test@test.com" },
  check_login_lockout: { p_email: "test@test.com" },
};

async function verifyRPC(name) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`;
  const params = MIN_PARAMS[name] || {};
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(params),
    });
    if (res.status === 200) return { ok: true, status: 200 };
    if (res.status === 404) return { ok: false, status: 404, msg: "NOT FOUND" };
    if (res.status === 400) {
      const body = await res.text().catch(() => "");
      return { ok: false, status: 400, msg: body.slice(0, 150) };
    }
    const body = await res.text().catch(() => "");
    return { ok: false, status: res.status, msg: body.slice(0, 150) };
  } catch (err) {
    return { ok: false, status: 0, msg: err.message };
  }
}

async function main() {
  console.log(`\n🔍 Verifying ${ALL_RPCS.length} RPC functions against ${SUPABASE_URL}\n`);
  console.log("─".repeat(100));

  let passed = 0,
    failed = 0,
    warned = 0;
  const missing = [];

  for (const name of ALL_RPCS) {
    const result = await verifyRPC(name);
    if (result.ok) {
      passed++;
    } else if (result.status === 404) {
      failed++;
      missing.push(name);
      console.log(`  ❌ ${name.padEnd(42)} 404 — NOT FOUND`);
    } else if (result.status === 400) {
      warned++;
      console.log(`  ⚠️ ${name.padEnd(42)} 400 — ${result.msg}`);
    } else {
      warned++;
      console.log(`  ⚠️ ${name.padEnd(42)} ${result.status} — ${result.msg}`);
    }
  }

  console.log("─".repeat(100));

  if (missing.length > 0) {
    console.log(`\n❌ MISSING RPCs (${missing.length}):`);
    missing.forEach((n) => console.log(`    - ${n}`));
  }

  console.log(`\n📊 Results: ${passed} ✅ passed, ${warned} ⚠️ warnings, ${failed} ❌ failed\n`);

  if (missing.length > 0) {
    console.log("⚠️  The following migrations need to be applied:");
    console.log("   supabase/migrations/020_audit_logs.sql");
    console.log("   supabase/migrations/021_security_tracking.sql");
    console.log("   supabase/migrations/022_abandoned_carts.sql");
    console.log("   supabase/migrations/023_security_views_indexes.sql");
    console.log("   supabase/migrations/024_comprehensive_fix.sql");
    console.log("\n   Run: export SUPABASE_ACCESS_TOKEN=your_token");
    console.log("        supabase link --project-ref zqapvgxlnzpmdcwqlfyt");
    console.log("        supabase db push");
  }
}

main().catch(console.error);
