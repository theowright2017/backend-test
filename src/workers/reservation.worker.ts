import { Worker } from "bullmq";
import { prisma } from "@/shared/database";
import { redis } from "@/shared/redis";

// 2. The Worker (The Janitor)
export const reservationWorker = new Worker(
  "reservation-expiry",
  async (job) => {
    console.log("registered worker !!!");
    const { seatId, userId, lockKey } = job.data;

    // We use a transaction to ensure we don't accidentally release a SOLD seat
    await prisma.$transaction(async (tx) => {
      console.log("TRANSACTION !!");
      // Only delete if it hasn't been sold in the meantime
      const seat = await tx.seat.findUnique({ where: { id: seatId } });

      if (seat?.status === "RESERVED") {
        await tx.seat.update({
          where: { id: seatId },
          data: { status: "AVAILABLE" },
        });
        // Also delete the specific reservation record
        await tx.reservation.deleteMany({ where: { seatId, userId } });
      }
    });

    // Clean up Redis
    await redis.del(lockKey);
  },
  { connection: redis },
);

reservationWorker.on("ready", () => {
  console.log("✅ Reservation Worker is connected and ready to receive jobs");
});

reservationWorker.on("error", (err) => {
  console.error("❌ Reservation Worker connection error:", err);
});

reservationWorker.on("failed", (job, err) => {
  console.error(
    `❌ Reservation Permanent Failure: Job ${job?.id} could not be processed after ${job?.attemptsMade} attempts.`,
  );
  console.error(`Reason: ${err.message}`);
  // In production, you'd send this to Sentry or Slack here
});
