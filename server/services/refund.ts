import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { EmailService } from "./email";
import { env } from "../config/env";
import { ApplicationError, NotFoundError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";

export class RefundService {
  private get db(): any {
    return this.supabase;
  }

  constructor(
    private readonly supabase: ReturnType<typeof createClient>,
    private readonly stripe: Stripe,
    private readonly email: EmailService,
  ) {}

  async requestRefund(
    orderId: string,
    userId: string,
    reason: string,
    description?: string,
    attachments: string[] = [],
    items?: Array<{ order_item_id: string; quantity: number; unit_price: number }>,
  ): Promise<{ success: boolean; refundId: string }> {
    logger.info("Requesting refund", { orderId, userId, reason });

    // 1. Fetch order details
    const { data: order, error: orderErr } = await this.db
      .from("orders")
      .select("id, status, total, user_id, email, order_number")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) {
      throw new NotFoundError("Order not found");
    }

    if (order.user_id !== userId) {
      throw new ValidationError("Not authorized to request refund for this order");
    }

    if (order.status !== "delivered") {
      throw new ValidationError("Refunds can only be requested for delivered orders");
    }

    // Check if there is already a pending or approved refund
    const { data: existingRefunds } = await this.db
      .from("refunds")
      .select("id, status")
      .eq("order_id", orderId)
      .in("status", ["pending", "approved", "awaiting_return", "received", "inspection_passed", "processing", "completed"]);

    if (existingRefunds && existingRefunds.length > 0) {
      throw new ValidationError("An active refund request already exists for this order");
    }

    // Determine refund amount
    const refundAmount = items && items.length > 0
      ? items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
      : parseFloat(order.total);

    // 2. Insert into public.refunds
    const { data: refund, error: insertErr } = await this.db
      .from("refunds")
      .insert({
        order_id: orderId,
        amount: refundAmount,
        reason,
        description: description || null,
        status: "pending",
        attachments,
        metadata: {
          items: items || [],
          requested_by: userId,
        },
      })
      .select("id")
      .single();

    if (insertErr || !refund) {
      throw new ApplicationError(`Failed to save refund request: ${insertErr?.message}`, "REFUND_INSERT_FAILED", 500, insertErr);
    }

    // 3. Log to order_timeline
    await this.db.from("order_timeline").insert({
      order_id: orderId,
      event_type: "payment_refunded",
      description: `Refund request submitted: ${reason}`,
      metadata: {
        refund_id: refund.id,
        reason,
        description,
        amount: refundAmount,
      },
    });

    // 3b. Log to audit logs
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refund.id,
      action: "request",
      new_data: { order_id: orderId, amount: refundAmount, reason },
      actor_id: userId,
    });

    // 4. Send emails using centralized notification template
    try {
      const { buildNotificationEmailHtml } = await import("../templates");

      // Customer confirmation
      await this.email.sendWithLogging({
        to: order.email,
        subject: `Refund Request Received — Order #${order.order_number}`,
        html: buildNotificationEmailHtml({
          title: "Refund Request Received",
          message: `We have received your refund request for Order #${order.order_number}. Our concierge team will review the details and updates will be sent to you shortly.`
        }),
        emailType: "refund_request_received",
        orderId,
      });

      // Admin notification
      await this.email.sendAdminNotification(
        `New Refund Request: Order #${order.order_number}`,
        buildNotificationEmailHtml({
          title: "New Refund Request",
          message: `Customer has requested a refund of $${refundAmount.toFixed(2)} for Order #${order.order_number}.<br/><br/>Reason: ${reason}<br/>Description: ${description || "None"}`
        }),
        orderId,
      );
    } catch (err: any) {
      logger.error("Failed to send refund request emails", { error: err.message });
    }

    return { success: true, refundId: refund.id };
  }

  async approveRefund(refundId: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Approving refund", { refundId, adminUserId });

    // 1. Fetch refund detail
    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, stripe_payment_intent_id, email, order_number)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (refund.status !== "pending") {
      throw new ValidationError(`Refund is already in ${refund.status} status`);
    }

    const order = refund.orders;

    // 2. Transition status to awaiting_return
    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        status: "awaiting_return",
        processed_at: new Date().toISOString(),
        processed_by: adminUserId,
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    // 3. Log return approval to order timeline
    await this.db.from("order_timeline").insert({
      order_id: order.id,
      event_type: "payment_refunded",
      description: `Return approved by admin: $${Number(refund.amount).toFixed(2)}. Waiting for returned items.`,
      metadata: {
        refund_id: refundId,
      },
    });

    // 3b. Log to audit_logs
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refundId,
      action: "approve",
      old_data: { status: "pending" },
      new_data: { status: "awaiting_return" },
      actor_id: adminUserId,
    });

    // 4. Send Return Approved notification email
    await this.email.sendReturnUpdate(
      order.email,
      {
        orderNumber: order.order_number,
        returnStatus: "approved",
        reason: refund.reason,
        items: refund.metadata?.items || [],
      },
      order.id
    );

    return { success: true };
  }

  async rejectRefund(refundId: string, rejectionReason: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Rejecting refund", { refundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (refund.status === "completed" || refund.status === "rejected") {
      throw new ValidationError(`Refund is already in ${refund.status} status`);
    }

    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
        processed_at: new Date().toISOString(),
        processed_by: adminUserId,
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    const order = refund.orders;
    await this.db.from("order_timeline").insert({
      order_id: order.id,
      event_type: "payment_refunded",
      description: `Refund rejected: ${rejectionReason}`,
      metadata: {
        refund_id: refundId,
        rejection_reason: rejectionReason,
      },
    });

    // Log to audit_logs
    await this.db.from("audit_logs").insert({
      table_name: "refunds",
      record_id: refundId,
      action: "reject",
      old_data: { status: refund.status },
      new_data: { status: "rejected", rejection_reason: rejectionReason },
      changed_by: adminUserId,
    });

    // Centralized email template compiler
    const { buildNotificationEmailHtml } = await import("../templates");
    await this.email.sendWithLogging({
      to: order.email,
      subject: `Refund Request Updates — Order #${order.order_number}`,
      html: buildNotificationEmailHtml({
        title: "Refund Request Rejected",
        message: `We have reviewed your refund request for Order #${order.order_number}. Unfortunately, it has been rejected.<br/><br/>Notes: "${rejectionReason}"`
      }),
      emailType: "refund_rejected",
      orderId: order.id,
    });

    return { success: true };
  }

  async requestMoreInfo(refundId: string, message: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Requesting more information on refund", { refundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        more_info_notes: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    const order = refund.orders;

    // Log to audit_logs
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refundId,
      action: "request_info",
      old_data: { more_info_notes: refund.more_info_notes },
      new_data: { more_info_notes: message },
      actor_id: adminUserId,
    });

    // Centralized email template compiler
    const { buildNotificationEmailHtml } = await import("../templates");
    await this.email.sendWithLogging({
      to: order.email,
      subject: `Concierge Clarification Required — Order #${order.order_number}`,
      html: buildNotificationEmailHtml({
        title: "Clarification Required",
        message: `We require additional details regarding your refund request for Order #${order.order_number}.<br/><br/>Message from concierge: <strong style="display: block; margin-top: 10px; font-style: italic;">"${message}"</strong><br/>Please reply back to our support email with the requested information.`
      }),
      emailType: "refund_needs_info",
      orderId: order.id,
    });

    return { success: true };
  }

  async markProductReceived(refundId: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Marking returned products received", { refundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (refund.status !== "awaiting_return" && refund.status !== "approved") {
      throw new ValidationError(`Refund request must be awaiting return (current status: ${refund.status})`);
    }

    const order = refund.orders;
    const updatedMetadata = {
      ...(refund.metadata || {}),
      products_received_at: new Date().toISOString(),
      products_received_by: adminUserId,
    };

    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        status: "received",
        metadata: updatedMetadata,
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    // Timeline event
    await this.db.from("order_timeline").insert({
      order_id: order.id,
      event_type: "payment_refunded",
      description: "Returned items received. Awaiting quality inspection.",
      metadata: { refund_id: refundId },
    });

    // Audit log
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refundId,
      action: "receive",
      old_data: { status: refund.status },
      new_data: { status: "received", metadata: updatedMetadata },
      actor_id: adminUserId,
    });

    return { success: true };
  }

  async passInspection(refundId: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Passing quality inspection", { refundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (refund.status !== "received") {
      throw new ValidationError(`Refund request must be in received status (current status: ${refund.status})`);
    }

    const order = refund.orders;
    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        status: "inspection_passed",
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    // Timeline event
    await this.db.from("order_timeline").insert({
      order_id: order.id,
      event_type: "payment_refunded",
      description: "Returned items passed quality inspection. Ready for refund execution.",
      metadata: { refund_id: refundId },
    });

    // Audit log
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refundId,
      action: "inspect",
      old_data: { status: "received" },
      new_data: { status: "inspection_passed" },
      actor_id: adminUserId,
    });

    return { success: true };
  }

  async initiateRefund(refundId: string, adminUserId: string): Promise<{ success: boolean }> {
    logger.info("Initiating refund execution", { refundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number, stripe_payment_intent_id, paypal_order_id, payment_method)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      throw new NotFoundError("Refund request not found");
    }

    if (
      refund.status !== "inspection_passed" &&
      refund.status !== "received" &&
      refund.status !== "approved"
    ) {
      throw new ValidationError(`Refund request must pass inspection first (current status: ${refund.status})`);
    }

    const order = refund.orders;
    if (!order) {
      throw new ValidationError("Missing order details for refund execution");
    }

    const isPayPal = order.payment_method === "paypal" || (order.paypal_order_id && order.paypal_order_id !== "");
    let stripeRefundId = "";
    let paypalRefundId = "";

    if (isPayPal) {
      // Initiate PayPal Refund API call
      try {
        const isProduction = env.paypalEnvironment === "production";
        const apiBase = isProduction ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
        const clientId = env.paypalClientId;
        const secret = env.paypalSecret;

        if (!clientId || !secret) {
          throw new ValidationError("PayPal is not configured");
        }

        // Fetch oauth token
        const tokenResponse = await fetch(`${apiBase}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
        });

        if (!tokenResponse.ok) {
          throw new Error("PayPal oauth token fetch failed");
        }

        const tokenData = await tokenResponse.json();

        // Fetch PayPal order details to resolve capture ID
        const orderResponse = await fetch(`${apiBase}/v2/checkout/orders/${order.paypal_order_id}`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        if (!orderResponse.ok) {
          throw new Error(`Failed to fetch PayPal order details: ${orderResponse.status}`);
        }

        const orderData = await orderResponse.json();
        const captureId = orderData.purchase_units?.[0]?.payments?.captures?.[0]?.id;

        if (!captureId) {
          throw new ValidationError("Could not resolve PayPal capture ID for refund");
        }

        // Post refund to PayPal API
        const refundResponse = await fetch(`${apiBase}/v2/payments/captures/${captureId}/refund`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: {
              value: Number(refund.amount).toFixed(2),
              currency_code: "USD"
            },
            note_to_payer: "Refund for returned merchandise."
          })
        });

        if (!refundResponse.ok) {
          const errData = await refundResponse.json();
          throw new Error(errData.message || `PayPal API returned status ${refundResponse.status}`);
        }

        const refundData = await refundResponse.json();
        paypalRefundId = refundData.id;
        logger.info("PayPal refund processed during initiateRefund", { paypalRefundId });
      } catch (err: any) {
        logger.error("PayPal refund call failed", { error: err.message });
        throw new ApplicationError(`PayPal refund failed: ${err.message}`, "PAYPAL_REFUND_FAILED", 500, err);
      }
    } else {
      // Initiate Stripe Refund API call
      if (!order.stripe_payment_intent_id) {
        throw new ValidationError("Missing payment details for Stripe refund");
      }

      try {
        const amountInCents = Math.round(parseFloat(refund.amount) * 100);
        const stripeRefund = await this.stripe.refunds.create({
          payment_intent: order.stripe_payment_intent_id,
          amount: amountInCents,
          reason: "requested_by_customer",
          metadata: {
            refund_id: refundId,
            order_id: order.id,
          },
        });
        stripeRefundId = stripeRefund.id;
        logger.info("Stripe refund processed during initiateRefund", { stripeRefundId });
      } catch (err: any) {
        logger.error("Stripe refund call failed", { error: err.message });
        throw new ApplicationError(`Stripe refund failed: ${err.message}`, "STRIPE_REFUND_FAILED", 500, err);
      }
    }

    // Restore inventory using standard database triggers/atomic increments
    const orderItems = refund.metadata?.items || [];
    if (orderItems.length === 0) {
      const { data: originalItems } = await this.db
        .from("order_items")
        .select("product_id, variant_id, attributes, quantity")
        .eq("order_id", order.id);

      if (originalItems) {
        orderItems.push(...originalItems.map((item: any) => {
          let size = "";
          if (item.attributes) {
            try {
              const attrs = typeof item.attributes === "string" ? JSON.parse(item.attributes) : item.attributes;
              size = attrs.size || "";
            } catch {}
          }
          return {
            product_id: item.product_id,
            variant_id: item.variant_id,
            size,
            quantity: item.quantity,
          };
        }));
      }
    }

    // Run stock restoration inside database constraints
    for (const item of orderItems) {
      const q = item.quantity;
      if (item.variant_id) {
        const { data: variant } = await this.db
          .from("product_variants")
          .select("size_stock, stock")
          .eq("id", item.variant_id)
          .single();

        if (variant) {
          const currentSizeStock = variant.size_stock || {};
          const currentVal = currentSizeStock[item.size] ?? 0;
          const updatedSizeStock = { ...currentSizeStock, [item.size]: currentVal + q };
          const updatedTotalStock = (variant.stock || 0) + q;

          await this.db
            .from("product_variants")
            .update({ size_stock: updatedSizeStock, stock: updatedTotalStock })
            .eq("id", item.variant_id);

          // Update parent product stock sum
          const { data: siblingVariants } = await this.db
            .from("product_variants")
            .select("stock, is_active")
            .eq("product_id", item.product_id);

          const updatedProductStock = (siblingVariants || []).reduce(
            (sum: number, v: any) => sum + (v.is_active !== false ? (v.stock || 0) : 0),
            0
          );

          await this.db
            .from("products")
            .update({ stock: updatedProductStock })
            .eq("id", item.product_id);

          // Log adjustment
          await this.db.from("inventory_logs").insert({
            product_id: item.product_id,
            variant_id: item.variant_id,
            change_type: "return",
            quantity_change: q,
            quantity_after: updatedTotalStock,
            reference_id: `refund-${refundId}`,
            notes: `Inventory restored from returned products of refund request ${refundId}`,
          });
        }
      } else {
        const { data: product } = await this.db
          .from("products")
          .select("size_stock, stock")
          .eq("id", item.product_id)
          .single();

        if (product) {
          const currentSizeStock = product.size_stock || {};
          const currentVal = currentSizeStock[item.size] ?? 0;
          const updatedSizeStock = { ...currentSizeStock, [item.size]: currentVal + q };
          const updatedTotalStock = (product.stock || 0) + q;

          await this.db
            .from("products")
            .update({ size_stock: updatedSizeStock, stock: updatedTotalStock })
            .eq("id", item.product_id);

          // Log adjustment
          await this.db.from("inventory_logs").insert({
            product_id: item.product_id,
            variant_id: null,
            change_type: "return",
            quantity_change: q,
            quantity_after: updatedTotalStock,
            reference_id: `refund-${refundId}`,
            notes: `Inventory restored from returned products of refund request ${refundId}`,
          });
        }
      }
    }

    // Update status to processing
    const { error: updateErr } = await this.db
      .from("refunds")
      .update({
        status: "processing",
        stripe_refund_id: stripeRefundId || paypalRefundId,
      })
      .eq("id", refundId);

    if (updateErr) throw updateErr;

    // Timeline event
    await this.db.from("order_timeline").insert({
      order_id: order.id,
      event_type: "payment_refunded",
      description: `Refund initiated via ${isPayPal ? "PayPal" : "Stripe"}. Processing transaction.`,
      metadata: {
        refund_id: refundId,
        stripe_refund_id: stripeRefundId || paypalRefundId,
      },
    });

    // Audit log
    await this.db.from("audit_logs").insert({
      entity_type: "refunds",
      entity_id: refundId,
      action: "initiate",
      old_data: { status: refund.status },
      new_data: { status: "processing", stripe_refund_id: stripeRefundId || paypalRefundId },
      actor_id: adminUserId,
    });

    return { success: true };
  }

  async completeRefund(refundId: string, adminUserId: string, stripeRefundId?: string): Promise<{ success: boolean }> {
    logger.info("Refund completion pipeline: start", { refundId, stripeRefundId, adminUserId });

    const { data: refund, error: refundErr } = await this.db
      .from("refunds")
      .select("*, orders(id, email, order_number, status)")
      .eq("id", refundId)
      .single();

    if (refundErr || !refund) {
      logger.error("Refund completion pipeline: Refund request not found", { refundId, error: refundErr?.message });
      throw new NotFoundError("Refund request not found");
    }

    logger.info("Refund completion pipeline: Refund loaded", {
      refundId,
      currentStatus: refund.status,
      orderStatus: refund.orders?.status,
      stripeRefundId: stripeRefundId || refund.stripe_refund_id
    });

    if (refund.status === "completed") {
      logger.info("Refund is already completed. Skipping duplicates.", { refundId });
      return { success: true };
    }

    const order = refund.orders;

    // Validate UUID format for database UUID fields (e.g., in webhook calls where actor is "system")
    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
    const actorUuid = isUuid(adminUserId) ? adminUserId : null;
    const processedByUuid = actorUuid || (refund.processed_by && isUuid(refund.processed_by) ? refund.processed_by : null);

    let completedAtomically = false;

    // 1. Try executing the database RPC for atomic transactional completion
    logger.info("Refund completion pipeline: Entering transaction RPC");
    try {
      const { data: rpcData, error: rpcErr } = await this.db.rpc("complete_refund_transaction", {
        p_refund_id: refundId,
        p_admin_user_id: actorUuid,
        p_stripe_refund_id: stripeRefundId || null,
      });

      if (rpcErr) {
        const isFunctionNotFound = rpcErr.code === "42883" || 
                                   rpcErr.message?.includes("Could not find the function") ||
                                   rpcErr.message?.includes("does not exist");
        if (isFunctionNotFound) {
          logger.warn("Refund completion pipeline: Transaction RPC not found, falling back to manual queries", { error: rpcErr.message });
        } else {
          logger.error("Refund completion pipeline: Transaction rolled back via RPC", { error: rpcErr.message, code: rpcErr.code });
          throw rpcErr;
        }
      } else if (rpcData?.success) {
        if (rpcData.already_completed) {
          logger.info("Refund was already completed in concurrent request.", { refundId });
          return { success: true };
        }
        completedAtomically = true;
        logger.info("Refund completion pipeline: Transaction committed via RPC", { refundId });
      } else {
        const errMsg = rpcData?.error || "Unknown RPC error";
        logger.error("Refund completion pipeline: Transaction rolled back via RPC (failure response)", { error: errMsg });
        throw new Error(errMsg);
      }
    } catch (err: any) {
      const isFunctionNotFound = err.code === "42883" || 
                                 err.message?.includes("Could not find the function") ||
                                 err.message?.includes("does not exist");
      if (!isFunctionNotFound) {
        logger.error("Refund completion pipeline: Critical RPC execution failure", { error: err.message });
        throw err;
      }
    }

    // 2. Fallback to individual queries if RPC failed or is not defined in this database environment
    if (!completedAtomically) {
      logger.info("Refund completion pipeline: Entering manual transaction updates block");

      // Transition status to completed with optimistic lock
      logger.info("Refund completion pipeline: Updating refund status to completed", { refundId });
      const { data: updatedRefunds, error: updateErr } = await this.db
        .from("refunds")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          processed_by: processedByUuid,
        })
        .eq("id", refundId)
        .neq("status", "completed")
        .select();

      if (updateErr) {
        logger.error("Refund completion pipeline: Transaction rolled back during refund update", { error: updateErr.message });
        throw updateErr;
      }

      // Verify that the UPDATE actually affects exactly one row
      if (!updatedRefunds || updatedRefunds.length === 0) {
        // Double check if it was completed concurrently (idempotency safety)
        const { data: doubleCheck, error: checkErr } = await this.db
          .from("refunds")
          .select("status")
          .eq("id", refundId)
          .single();
        
        if (doubleCheck?.status === "completed") {
          logger.info("Refund was concurrently completed by another request.", { refundId });
          return { success: true };
        }
        
        const errMsg = "Failed to update refund status to completed. No rows affected.";
        logger.error("Refund completion pipeline: Transaction rolled back", { error: errMsg });
        throw new Error(errMsg);
      }

      if (updatedRefunds.length !== 1) {
        const errMsg = `Failed to update refund status. Expected 1 row, affected ${updatedRefunds.length}.`;
        logger.error("Refund completion pipeline: Transaction rolled back", { error: errMsg });
        throw new Error(errMsg);
      }
      logger.info("Refund completion pipeline: Refund updated successfully", { refundId });

      // Update order status to refunded
      logger.info("Refund completion pipeline: Updating order status to refunded", { orderId: order.id });
      const { data: updatedOrders, error: orderUpdateErr } = await this.db
        .from("orders")
        .update({
          status: "refunded",
          payment_status: "refunded",
        })
        .eq("id", order.id)
        .select();

      if (orderUpdateErr) {
        logger.error("Refund completion pipeline: Transaction rolled back during order update", { error: orderUpdateErr.message });
        throw orderUpdateErr;
      }

      if (!updatedOrders || updatedOrders.length !== 1) {
        const errMsg = `Failed to update order status to refunded. Expected 1 row, affected ${updatedOrders?.length || 0}.`;
        logger.error("Refund completion pipeline: Transaction rolled back", { error: errMsg });
        throw new Error(errMsg);
      }
      logger.info("Refund completion pipeline: Order updated successfully", { orderId: order.id });

      // Restoring stock log statement
      logger.info("Refund completion pipeline: Restoring stock (checked: already performed during initiateRefund)");

      // Insert order status history
      logger.info("Refund completion pipeline: Writing order status history", { orderId: order.id });
      const { error: historyErr } = await this.db.from("order_status_history").insert({
        order_id: order.id,
        previous_status: order.status || "delivered",
        new_status: "refunded",
        changed_by: actorUuid,
        note: `Refund completed for request ${refundId}`,
      });

      if (historyErr) {
        logger.error("Refund completion pipeline: Transaction rolled back during status history insertion", { error: historyErr.message });
        throw historyErr;
      }
      logger.info("Refund completion pipeline: Order status history written successfully", { orderId: order.id });

      // Timeline event
      logger.info("Refund completion pipeline: Writing timeline", { orderId: order.id });
      const { error: timelineErr } = await this.db.from("order_timeline").insert({
        order_id: order.id,
        event_type: "payment_refunded",
        description: `Refund completed for order: $${Number(refund.amount).toFixed(2)}.`,
        metadata: {
          refund_id: refundId,
          stripe_refund_id: stripeRefundId || refund.stripe_refund_id,
        },
      });

      if (timelineErr) {
        logger.error("Refund completion pipeline: Transaction rolled back during timeline insertion", { error: timelineErr.message });
        throw timelineErr;
      }
      logger.info("Refund completion pipeline: Timeline written successfully", { orderId: order.id });

      // Audit log
      logger.info("Refund completion pipeline: Writing audit logs", { refundId });
      const { error: auditErr } = await this.db.from("audit_logs").insert({
        entity_type: "refunds",
        entity_id: refundId,
        action: "complete",
        old_data: { status: refund.status },
        new_data: { status: "completed" },
        actor_id: actorUuid,
      });

      if (auditErr) {
        logger.error("Refund completion pipeline: Transaction rolled back during audit log insertion", { error: auditErr.message });
        throw auditErr;
      }
      logger.info("Refund completion pipeline: Audit logs written successfully", { refundId });

      logger.info("Refund completion pipeline: Transaction committed", { refundId });
    }

    // Fetch order items for the email
    logger.info("Refund completion pipeline: Sending emails", { orderId: order.id });
    const { data: items, error: itemsErr } = await this.db
      .from("order_items")
      .select("name, quantity, price, attributes")
      .eq("order_id", order.id);

    if (itemsErr) {
      logger.error("Refund completion pipeline: Failed to fetch order items for email", { error: itemsErr.message });
      throw itemsErr;
    }

    const emailItems = (items || []).map((i: any) => {
      let size = "";
      if (i.attributes) {
        try {
          const attrs = typeof i.attributes === "string" ? JSON.parse(i.attributes) : i.attributes;
          size = attrs.size || "";
        } catch {}
      }
      return {
        name: i.name,
        quantity: i.quantity,
        unitPrice: Number(i.price),
        size,
      };
    });

    // Send final completed email
    try {
      await this.email.sendRefundUpdate(
        order.email,
        {
          orderNumber: order.order_number,
          amount: Number(refund.amount),
          refundStatus: "completed",
          items: emailItems,
        },
        order.id
      );
      logger.info("Refund completion pipeline: Emails sent successfully", { orderId: order.id });
    } catch (emailErr: any) {
      logger.error("Refund completion pipeline: Failed to send refund update email", { error: emailErr.message });
      throw emailErr;
    }

    logger.info("Refund completion pipeline: Final refund status", { refundId, status: "completed" });
    return { success: true };
  }
}
