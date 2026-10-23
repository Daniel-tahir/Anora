import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const submitRefundRequest = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orderId: z.string(),
      reason: z.string(),
      description: z.string().optional(),
      attachments: z.array(z.string()).default([]),
      accessToken: z.string(),
      items: z
        .array(
          z.object({
            order_item_id: z.string(),
            quantity: z.number(),
            unit_price: z.number(),
          })
        )
        .optional(),
    })
  )
  .handler(async ({ data }) => {
    const { orderId, reason, description, attachments, accessToken, items } = data;
    const { supabaseAdmin } = await import("../../server/lib/supabase-admin");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
    if (userError || !userData?.user) {
      throw new Error("Authentication failed");
    }
    const userId = userData.user.id;

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.requestRefund(
      orderId,
      userId,
      reason,
      description,
      attachments,
      items
    );
  });

export const approveRefund = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.approveRefund(refundId, admin.id);
  });

export const rejectRefund = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      reason: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, reason, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.rejectRefund(refundId, reason, admin.id);
  });

export const requestMoreInfo = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      message: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, message, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.requestMoreInfo(refundId, message, admin.id);
  });

export const markProductReceived = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.markProductReceived(refundId, admin.id);
  });

export const passRefundInspection = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.passInspection(refundId, admin.id);
  });

export const initiateRefundExecution = createServerFn({ method: "POST" })
  .validator(
    z.object({
      refundId: z.string(),
      accessToken: z.string(),
    })
  )
  .handler(async ({ data }) => {
    const { refundId, accessToken } = data;
    const { verifyAdminAccess } = await import("../../server/lib/admin");
    const admin = await verifyAdminAccess(accessToken);

    const { initContainer } = await import("../../server/container");
    const container = await initContainer();
    return await container.refund.initiateRefund(refundId, admin.id);
  });

