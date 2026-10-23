import { createFileRoute } from "@tanstack/react-router";
import { verifyAdminAccess } from "../../server/lib/admin";
import { supabaseAdmin } from "../../server/lib/supabase-admin";
import crypto from "node:crypto";
import { toSafeWebp } from "../../server/lib/image-upload";

export const Route = createFileRoute("/api/admin/products/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
          if (!accessToken) {
            return new Response(JSON.stringify({ error: "Authentication required" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            });
          }

          try {
            await verifyAdminAccess(accessToken);
          } catch (err: any) {
            return new Response(JSON.stringify({ error: err.statusMessage || "Access denied" }), {
              status: err.statusCode || 403,
              headers: { "Content-Type": "application/json" },
            });
          }

          const formData = await request.formData();
          const productId = formData.get("productId") as string;
          const variantId = formData.get("variantId") as string | null;
          const file = formData.get("file") as File | null;

          if (!productId || !file) {
            return new Response(JSON.stringify({ error: "Missing required fields" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          if (variantId) {
            const { data: variantCheck, error: checkError } = await supabaseAdmin
              .from("product_variants")
              .select("product_id")
              .eq("id", variantId)
              .single();

            if (checkError || !variantCheck || variantCheck.product_id !== productId) {
              return new Response(JSON.stringify({ error: "Invalid variant ID for product" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          let outputData: Buffer;
          const outputMimeType = "image/webp";
          try {
            outputData = await toSafeWebp(Buffer.from(await file.arrayBuffer()));
          } catch (err: any) {
            return new Response(
              JSON.stringify({ error: err?.statusCode === 400 ? err.message : "Unsupported or invalid image" }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }

          const uuid = crypto.randomUUID();
          const filePath = `products/${productId}/${uuid}.webp`;

          const { error: uploadError } = await supabaseAdmin.storage
            .from("product-images")
            .upload(filePath, outputData, {
              contentType: outputMimeType,
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            return new Response(JSON.stringify({ error: "Storage upload failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: urlData } = supabaseAdmin.storage.from("product-images").getPublicUrl(filePath);
          const imageUrl = urlData?.publicUrl ?? "";
          if (!imageUrl) {
            return new Response(JSON.stringify({ error: "Failed to generate public URL" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const { data: insertData, error: insertError } = await supabaseAdmin
            .from("product_images")
            .insert({
              product_id: productId,
              variant_id: variantId || null,
              image_url: imageUrl,
              sort_order: 0,
            })
            .select("id, image_url")
            .single();

          if (insertError) {
            return new Response(JSON.stringify({ error: "Database insert failed" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ image_url: insertData.image_url, id: insertData.id }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
