import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const resolveReviewToken = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { token } = data;
    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    const supabase = container.supabase;

    // 1. Fetch token details
    const { data: tokenRec, error: tokenErr } = await (supabase
      .from("review_tokens") as any)
      .select("order_id, order_item_id, email, expires_at")
      .eq("token", token)
      .single();

    if (tokenErr || !tokenRec) {
      return { success: false, error: "The review link is invalid or has expired." };
    }

    // 2. Check expiration
    if (new Date(tokenRec.expires_at) < new Date()) {
      return { success: false, error: "The review link has expired (30-day limit)." };
    }

    // 3. Fetch order item & product details
    const { data: item, error: itemErr } = await (supabase
      .from("order_items") as any)
      .select("product_id, name, image_url")
      .eq("id", tokenRec.order_item_id)
      .single();

    if (itemErr || !item) {
      return { success: false, error: "Product or purchase record could not be found." };
    }

    // 4. Double check if already reviewed
    const { count, error: reviewCheckErr } = await (supabase
      .from("reviews") as any)
      .select("id", { count: "exact", head: true })
      .eq("order_item_id", tokenRec.order_item_id);

    if (!reviewCheckErr && (count ?? 0) > 0) {
      return { success: false, error: "A review has already been submitted for this item." };
    }

    return {
      success: true,
      data: {
        orderId: tokenRec.order_id,
        orderItemId: tokenRec.order_item_id,
        email: tokenRec.email,
        productId: item.product_id,
        productName: item.name,
        productImage: item.image_url,
      },
    };
  });

export const submitReview = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string(),
      rating: z.number().int().min(1).max(5),
      title: z.string().max(100).optional(),
      body: z.string().min(5).max(4000),
      reviewerName: z.string().min(2).max(50),
      accessToken: z.string().optional(),
    })
  )
  .handler(async ({ data }) => {
    const { token, rating, title, body, reviewerName, accessToken } = data;
    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    const supabase = container.supabase;

    // 1. Resolve token
    const resolution = await resolveReviewToken({ data: { token } });
    if (!resolution.success || !resolution.data) {
      throw new Error(resolution.error || "Invalid token");
    }

    const { orderId, orderItemId, productId } = resolution.data;

    // 2. Double check order delivery status
    const { data: order, error: orderErr } = await (supabase
      .from("orders") as any)
      .select("status, user_id, shipping_address")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      throw new Error("Order purchase record not found");
    }

    if (order.status !== "delivered") {
      throw new Error("You can only review items after they have been successfully delivered");
    }

    // 3. Resolve user ID if authenticated
    let resolvedUserId: string | null = null;
    if (accessToken) {
      const { data: userData } = await supabase.auth.getUser(accessToken);
      if (userData?.user) {
        resolvedUserId = userData.user.id;
      }
    } else if (order.user_id) {
      resolvedUserId = order.user_id;
    }

    // 4. Sanitize title & body (strip HTML tags completely for script safety)
    const cleanTitle = title ? title.replace(/<[^>]*>/g, "").trim() : null;
    const cleanBody = body.replace(/<[^>]*>/g, "").trim();
    const cleanName = reviewerName.replace(/<[^>]*>/g, "").trim();

    // 5. Insert review
    const { error: insertErr } = await (supabase
      .from("reviews") as any)
      .insert({
        product_id: productId,
        user_id: resolvedUserId,
        order_id: orderId,
        order_item_id: orderItemId,
        rating,
        title: cleanTitle,
        review_text: cleanBody,
        reviewer_name: cleanName,
        is_verified: true,
        status: "pending",
      });

    if (insertErr) {
      throw new Error(`Failed to save review: ${insertErr.message}`);
    }

    // 6. Invalidate review token
    await (supabase.from("review_tokens") as any).delete().eq("token", token);

    return { success: true };
  });
