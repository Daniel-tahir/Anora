import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { Resend } from "https://esm.sh/resend@2.0.0";

interface Payload {
  invoice_id: string;
}

serve(async (req) => {
  try {
    const { invoice_id } = (await req.json()) as Payload;
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404 });
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    // Build modern responsive layout matching the main template styling
    const GOLD = "#C9A96E";
    const DARK = "#18181B";
    const LIGHT_BG = "#FAFAFA";
    const WHITE = "#FFFFFF";
    const TEXT = "#27272A";
    const MUTED = "#71717A";
    const BORDER = "#E4E4E7";

    const itemsHtml = invoice.invoice_items
      .map((item: any, i: number) => {
        const subtotal = (Number(item.unit_price) * item.quantity).toFixed(2);
        return `<tr>
          <td style="padding:16px 8px 16px 0;border-bottom:1px solid ${BORDER};">
            <p style="font-size:13px;color:${DARK};margin:0 0 4px;font-weight:500;">${item.product_name}</p>
            <p style="font-size:11px;color:${MUTED};margin:0;text-transform:uppercase;letter-spacing:0.5px;">Qty ${item.quantity}</p>
          </td>
          <td style="padding:16px 0 16px 8px;border-bottom:1px solid ${BORDER};text-align:right;vertical-align:top;font-size:13px;color:${DARK};font-weight:500;">
            $${subtotal}
          </td>
        </tr>`;
      })
      .join("");

    const emailHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice.invoice_number}</title>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table class="container" role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${WHITE};border:1px solid ${BORDER};">
          <!-- HEADER -->
          <tr>
            <td style="padding:48px 48px 32px;text-align:center;background-color:${WHITE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom:32px;border-bottom:1px solid ${BORDER};">
                    <a href="https://anora-elegance.com" style="text-decoration:none;display:inline-block;">
                      <h1 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:28px;letter-spacing:8px;color:${DARK};margin:0;font-weight:300;text-transform:uppercase;">ANORA</h1>
                      <p style="font-size:10px;letter-spacing:4px;color:${MUTED};margin:6px 0 0;text-transform:uppercase;font-weight:400;">Atelier</p>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- BODY -->
          <tr>
            <td style="padding:0 48px;background-color:${WHITE};">
              <h2 style="font-family:'Didot','Playfair Display','Times New Roman',serif;font-size:24px;color:${DARK};margin:0 0 16px;font-weight:400;letter-spacing:1px;text-align:center;">Invoice Details</h2>
              <p style="font-size:14px;color:${TEXT};margin:0 0 16px;line-height:1.6;">Dear ${invoice.customer_name || "Valued Customer"},</p>
              <p style="font-size:14px;color:${TEXT};margin:0 0 24px;line-height:1.6;">Thank you for your order. Please find your detailed invoice outline below.</p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border:1px solid ${BORDER};padding:24px;margin-bottom:24px;text-align:center;">
                <tr>
                  <td style="padding:0 8px;border-right:1px solid ${BORDER};width:33%;">
                    <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Invoice No</p>
                    <p style="font-size:13px;color:${DARK};margin:0;font-weight:500;">${invoice.invoice_number}</p>
                  </td>
                  <td style="padding:0 8px;border-right:1px solid ${BORDER};width:33%;">
                    <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Date</p>
                    <p style="font-size:13px;color:${DARK};margin:0;">${new Date(invoice.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                  </td>
                  <td style="padding:0 8px;width:33%;">
                    <p style="font-size:9px;letter-spacing:1px;text-transform:uppercase;color:${MUTED};margin:0 0 6px;">Status</p>
                    <p style="font-size:13px;color:${GOLD};margin:0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${invoice.status}</p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;">
                <thead>
                  <tr>
                    <th style="padding-bottom:12px;text-align:left;font-size:10px;letter-spacing:1px;color:${MUTED};text-transform:uppercase;font-weight:500;border-bottom:1px solid ${BORDER};">Selected Items</th>
                    <th style="padding-bottom:12px;text-align:right;font-size:10px;letter-spacing:1px;color:${MUTED};text-transform:uppercase;font-weight:500;border-bottom:1px solid ${BORDER};">Total</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
              </table>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="padding:12px 0;text-align:right;border-top:1px solid ${BORDER};"><span style="font-size:14px;color:${DARK};font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Grand Total</span></td>
                  <td style="padding:12px 0;text-align:right;border-top:1px solid ${BORDER};width:120px;"><span style="font-size:16px;color:${DARK};font-weight:600;">$${Number(invoice.total_amount).toFixed(2)}</span></td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- FOOTER -->
          <tr>
            <td style="padding:32px 48px 48px;background-color:${WHITE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:32px 0 0;border-top:1px solid ${BORDER};">
                    <p style="font-size:11px;color:${MUTED};text-align:center;margin:0 0 6px;line-height:1.6;letter-spacing:0.5px;">
                      ANORA Atelier — Elegance Crafted For Every Moment
                    </p>
                    <p style="font-size:11px;color:${MUTED};text-align:center;margin:0;line-height:1.6;">
                      <a href="mailto:support@anora-elegance.com" style="color:${DARK};text-decoration:none;font-weight:500;">support@anora-elegance.com</a>
                    </p>
                    <p style="font-size:10px;color:${MUTED};text-align:center;margin:16px 0 0;line-height:1.5;">
                      © ${new Date().getFullYear()} ANORA. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await resend.emails.send({
      from: Deno.env.get("FROM_EMAIL") || "invoices@anora-elegance.com",
      to: invoice.customer_email,
      subject: `Invoice ${invoice.invoice_number} from ANORA`,
      html: emailHtml,
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
      },
    );
  }
});
