import { ticketService } from "@/application/ticket.service";
import { prisma } from "@/shared/database";
import { redis } from "@/shared/redis";
import { Worker } from "bullmq";

export const outboxWorker = new Worker(
  "outbox-transaction",
  async (job) => {
    console.log("--- Passed to outbox worker..");
    const { userId, email, orderId } = job.data;
    try {
      ticketService.sendConfirmationEmail(userId, email, orderId);

      await prisma.outbox.update({
        where: { id: job.data.outboxId },
        data: { status: "PROCESSED", processedAt: new Date() },
      });
    } catch (error: any) {
      console.log("❌  Attempt failed for: ", job);

      if (job.attemptsMade >= (job.opts.attempts || 2)) {
        await prisma.outbox.update({
          where: { id: job.id },
          data: { status: "FAILED" },
        });
      }

      throw error;
    }
  },
  { connection: redis },
);

outboxWorker.on("ready", () => {
  console.log("✅ Outbox Worker is connected and ready to receive jobs");
});

outboxWorker.on("error", (err) => {
  console.error("❌ Outbox Worker connection error:", err);
});

outboxWorker.on("failed", (job, err) => {
  console.error(
    `❌ Outbox Permanent Failure: Job ${job?.id} could not be processed after ${job?.attemptsMade} attempts.`,
  );
  console.error(`Reason: ${err.message}`);
  // In production, you'd send this to Sentry or Slack here
});
