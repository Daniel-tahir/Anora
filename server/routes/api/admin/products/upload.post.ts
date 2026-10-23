import { getHeader, createError, defineEventHandler, readMultipartFormData } from "h3";
import { verifyAdminAccess } from "../../../../lib/admin";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import crypto from "node:crypto";
import { toSafeWebp } from "../../../../lib/image-upload";

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, "authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) {
    throw createError({ statusCode: 401, statusMessage: "Authentication required" });
  }

  await verifyAdminAccess(accessToken);

  const form = await readMultipartFormData(event);
  if (!form) {
    throw createError({ statusCode: 400, statusMessage: "No form data received" });
  }

  let productId = "";
  let variantId = "";
  let fileData: Buffer | null = null;
  let filename = "";
  let mimeType = "";

  for (const part of form) {
    if (part.name === "productId") {
      productId = Buffer.from(part.data).toString("utf-8");
    } else if (part.name === "variantId") {
      variantId = Buffer.from(part.data).toString("utf-8");
    } else if (part.name === "file") {
      fileData = Buffer.from(part.data);
      filename = part.filename ?? "image.jpg";
      mimeType = part.type ?? "image/jpeg";
    }
  }

  if (!productId || !fileData) {
    throw createError({ statusCode: 400, statusMessage: "Missing required fields" });
  }

  if (variantId) {
    const { data: variantCheck, error: checkError } = await supabaseAdmin
      .from("product_variants")
      .select("product_id")
      .eq("id", variantId)
      .single();

    if (checkError || !variantCheck || variantCheck.product_id !== productId) {
      throw createError({ statusCode: 400, statusMessage: "Invalid variant ID for product" });
    }
  }

  let outputData: Buffer;
  const outputMimeType = "image/webp";
  try {
    outputData = await toSafeWebp(fileData);
  } catch (err: any) {
    throw createError({
      statusCode: err?.statusCode ?? 400,
      statusMessage: err?.statusCode === 400 ? err.message : "Unsupported or invalid image",
    });
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
    throw createError({
      statusCode: 500,
      statusMessage: "Storage upload failed",
    });
  }

  const { data: urlData } = supabaseAdmin.storage.from("product-images").getPublicUrl(filePath);
  const imageUrl = urlData?.publicUrl ?? "";
  if (!imageUrl) {
    throw createError({ statusCode: 500, statusMessage: "Failed to generate public URL" });
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
    throw createError({
      statusCode: 500,
      statusMessage: "Database insert failed",
    });
  }

  return { image_url: insertData.image_url, id: insertData.id };
});
