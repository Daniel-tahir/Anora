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

    const itemsHtml = invoice.invoice_items
      .map(
        (item: any) =>
          `<tr><td>${item.product_name}</td><td>${item.quantity}</td><td>$${Number(item.unit_price).toFixed(2)}</td><td>$${Number(item.total_price).toFixed(2)}</td></tr>`,
      )
      .join("");

    await resend.emails.send({
      from: Deno.env.get("FROM_EMAIL") || "invoices@anora-elegance.com",
      to: invoice.customer_email,
      subject: `Invoice ${invoice.invoice_number} from ANORA`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="font-size: 24px;">Invoice ${invoice.invoice_number}</h1>
          <p>Dear ${invoice.customer_name},</p>
          <p>Thank you for your order. Please find your invoice attached.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="text-align: left; padding: 8px;">Item</th>
                <th style="text-align: center; padding: 8px;">Qty</th>
                <th style="text-align: right; padding: 8px;">Price</th>
                <th style="text-align: right; padding: 8px;">Total</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p><strong>Total: $${Number(invoice.total_amount).toFixed(2)}</strong></p>
          <p>Status: <strong>${invoice.status}</strong></p>
          <hr />
          <p style="color: #666; font-size: 12px;">ANORA — Elegance Crafted For Every Moment</p>
        </div>
      `,
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
