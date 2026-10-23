import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";
import { QueueError } from "../lib/errors";
import { config } from "../config";

export type JobType =
  | "generate_invoice"
  | "generate_invoice_pdf"
  | "send_thank_you_email"
  | "send_invoice_email"
  | "send_admin_email"
  | "analytics_events"
  | "application_logs"
  | "send_review_email";

export type JobRecord = {
  id: string;
  order_id: string;
  job_type: JobType;
  sequence: number;
  status: "pending" | "processing" | "completed" | "failed" | "dlq";
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  next_retry_at: string | null;
  scheduled_at: string | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type JobHandler = (job: JobRecord) => Promise<void>;

const JOB_TYPES: JobType[] = [
  "generate_invoice",
  "generate_invoice_pdf",
  "send_thank_you_email",
  "send_invoice_email",
  "send_admin_email",
  "analytics_events",
  "application_logs",
  "send_review_email",
];

const DEFAULT_ORDER_JOBS: JobType[] = [
  "generate_invoice",
  "generate_invoice_pdf",
  "send_thank_you_email",
  "send_invoice_email",
  "send_admin_email",
  "analytics_events",
  "application_logs",
];

const JOB_SEQUENCE: Record<JobType, number> = {
  generate_invoice: 1,
  generate_invoice_pdf: 2,
  send_thank_you_email: 3,
  send_invoice_email: 4,
  send_admin_email: 5,
  analytics_events: 6,
  application_logs: 7,
  send_review_email: 8,
};

export class QueueService {
  private readonly handlers = new Map<JobType, JobHandler>();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly supabase: ReturnType<typeof createClient>) {}

  register(jobType: JobType, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  private ensureHandler(jobType: JobType): JobHandler {
    const handler = this.handlers.get(jobType);
    if (!handler) throw new QueueError(`No handler registered for job type: ${jobType}`);
    return handler;
  }

  async enqueue(orderId: string, payload: Record<string, unknown>): Promise<void> {
    const jobs = DEFAULT_ORDER_JOBS.map((jobType) => ({
      order_id: orderId,
      job_type: jobType,
      sequence: JOB_SEQUENCE[jobType],
      status: "pending" as const,
      payload,
      max_retries: config.queue.maxRetries,
    }));

    const { error } = await (this.supabase.from("background_jobs") as any).insert(jobs);
    if (error) throw new QueueError(`Failed to enqueue jobs: ${error.message}`, error);

    logger.info("Jobs enqueued", { orderId, count: jobs.length });

    // Process them in the background without blocking the HTTP request thread
    // using a non-blocking asynchronous call
    this.processPending().catch((err) => {
      logger.error("Failed to process enqueued jobs in background", { orderId, error: String(err) });
    });
  }

  async enqueueSingle(orderId: string, jobType: JobType, payload: Record<string, unknown>, scheduledAt?: string): Promise<void> {
    const job = {
      order_id: orderId,
      job_type: jobType,
      sequence: JOB_SEQUENCE[jobType] || 1,
      status: "pending" as const,
      payload,
      max_retries: config.queue.maxRetries,
      scheduled_at: scheduledAt || null,
    };

    const { error } = await (this.supabase.from("background_jobs") as any).insert(job);
    if (error) throw new QueueError(`Failed to enqueue single job: ${error.message}`, error);

    logger.info("Single job enqueued", { orderId, jobType, scheduledAt });
  }

  async processPending(limit: number = config.queue.batchSize): Promise<number> {
    // Recover stale jobs in processing state for over 15 minutes back to pending
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: recovered, error: recoveryError } = await (this.supabase
        .from("background_jobs") as any)
        .update({ status: "pending", error: "Stale job recovered by queue sweeper" })
        .eq("status", "processing")
        .lt("started_at", fifteenMinutesAgo)
        .select("id");

      if (recovered && recovered.length > 0) {
        logger.info("Queue Sweeper: Recovered stale background jobs back to pending", {
          count: recovered.length,
          jobIds: recovered.map((j: any) => j.id),
        });
      }
    } catch (err) {
      logger.error("Queue Sweeper: Failed to sweep stale jobs", { error: String(err) });
    }

    // Process failed/retryable jobs first
    try {
      await this.retryFailed(limit);
    } catch (err) {
      logger.error("Queue retry failed during processPending", { error: String(err) });
    }

    let totalProcessed = 0;
    let loopCount = 0;
    const maxLoops = 20;

    // Loop to process sequential steps for the enqueued orders
    while (loopCount < maxLoops) {
      const { data: jobs, error } = await (this.supabase as any).rpc("get_pending_jobs", {
        p_limit: limit,
      });

      if (error) {
        logger.error("Failed to fetch pending jobs", { error: error.message });
        break;
      }

      if (!jobs || jobs.length === 0) {
        break;
      }

      let processedInLoop = 0;
      for (const job of jobs) {
        const ok = await this.execute(job);
        if (ok) processedInLoop++;
      }

      totalProcessed += processedInLoop;
      loopCount++;

      // If no jobs were successfully processed in this loop, break to avoid infinite loop
      if (processedInLoop === 0) {
        break;
      }
    }

    return totalProcessed;
  }

  private async execute(job: JobRecord): Promise<boolean> {
    const jobId = job.id;

    // Atomic claim — update to processing only if still pending, and log start time
    const { data: claimed, error: claimError } = await (this.supabase
      .from("background_jobs") as any)
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("status", "pending")
      .select()
      .single();

    if (claimError || !claimed) {
      // Another worker already claimed this job
      return false;
    }

    logger.info("Processing job", { jobId, jobType: job.job_type, orderId: job.order_id });

    try {
      const handler = this.ensureHandler(job.job_type);
      await handler(claimed);

      // Mark completed
      await (this.supabase
        .from("background_jobs") as any)
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      logger.info("Job completed", { jobId, jobType: job.job_type });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const newRetryCount = (job.retry_count || 0) + 1;
      const maxRetries = job.max_retries || config.queue.maxRetries;

      logger.error("Job failed", {
        jobId,
        jobType: job.job_type,
        retryCount: newRetryCount,
        maxRetries,
        error: errorMessage,
      });

      if (newRetryCount >= maxRetries) {
        // Move to dead letter queue
        await this.moveToDlq(jobId, errorMessage);
      } else {
        // Schedule retry
        const delaySec =
          config.queue.retryDelaysSec[
            Math.min(newRetryCount - 1, config.queue.retryDelaysSec.length - 1)
          ] || config.queue.retryDelaysSec[config.queue.retryDelaysSec.length - 1];

        const nextRetryAt = new Date(Date.now() + delaySec * 1000).toISOString();

        await (this.supabase
          .from("background_jobs") as any)
          .update({
            status: "failed",
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt,
            error_message: errorMessage,
          })
          .eq("id", jobId);
      }

      return false;
    }
  }

  private async moveToDlq(jobId: string, errorMessage: string): Promise<void> {
    try {
      await (this.supabase as any).rpc("move_to_dead_letter", {
        p_job_id: jobId,
        p_error: errorMessage,
      });
    } catch {
      // Fallback: direct update
      await (this.supabase
        .from("background_jobs") as any)
        .update({
          status: "dlq",
          error_message: errorMessage,
        })
        .eq("id", jobId);
    }

    logger.warn("Job moved to DLQ", { jobId, error: errorMessage });
  }

  async retryFailed(limit: number = config.queue.batchSize): Promise<number> {
    const { data: jobs, error } = await (this.supabase as any).rpc("get_retryable_jobs", {
      p_limit: limit,
    });

    if (error) {
      logger.error("Failed to fetch retryable jobs", { error: error.message });
      return 0;
    }

    if (!jobs || jobs.length === 0) return 0;

    let retried = 0;
    for (const job of jobs) {
      const ok = await this.execute(job);
      if (ok) retried++;
    }

    return retried;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    logger.info("Queue service starting", {
      pollIntervalMs: config.queue.pollIntervalMs,
      retryIntervalMs: config.queue.retryIntervalMs,
    });

    // Initial tick
    this.tickPoll();
    this.tickRetry();

    // Periodic polling
    this.pollTimer = setInterval(() => this.tickPoll(), config.queue.pollIntervalMs);
    this.retryTimer = setInterval(() => this.tickRetry(), config.queue.retryIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
    logger.info("Queue service stopped");
  }

  private async tickPoll(): Promise<void> {
    try {
      await this.processPending();
    } catch (err) {
      logger.error("Queue poll tick failed", { error: String(err) });
    }
  }

  private async tickRetry(): Promise<void> {
    try {
      await this.retryFailed();
    } catch (err) {
      logger.error("Queue retry tick failed", { error: String(err) });
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
