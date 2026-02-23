import { prisma } from "@/shared/database";
import { outboxQueue } from "./queue";

export async function processOutbox() {
  let isRunning = true;

  while (isRunning) {
    try {
      console.info("👷👷 Outbox Relay started");
      // 1. Fetch PENDING events and 'Lock' them
      const outboxTransactions = await prisma.$transaction(async (tx) => {
        const pendingTransactions = await tx.outbox.findMany({
          where: { status: "PENDING" },
          take: 10, // Process in small batches
          orderBy: { createdAt: "asc" },
        });

        if (pendingTransactions.length === 0) return [];

        // 2. Immediately mark them as 'QUEUED'
        // to claim them so other workers don't grab them
        const ids = pendingTransactions.map((e) => e.id);
        await tx.outbox.updateMany({
          where: { id: { in: ids } },
          data: { status: "QUEUED", processedAt: new Date() },
        });

        return pendingTransactions;
      });

      // 3. Actually 'Deliver' the events (The "Relay")
      for (const transaction of outboxTransactions) {
        try {
          console.log(
            `📡 Relaying event ${transaction.type}:`,
            transaction.payload,
          );

          await outboxQueue.add(
            `outbox${transaction.id}`,
            {
              ...(transaction.payload as Record<string, string>),
              outboxId: transaction.id,
            },
            {
              delay: 0,
              removeOnComplete: false,
              attempts: 10,
              backoff: {
                type: "exponential",
                delay: 5000,
              },
            },
          );
        } catch (err) {
          console.error(
            `❌ Failed to add transaction ${transaction.id} to queue:`,
            err,
          );
        }
      }
    } catch (error: any) {
      console.error("❌ Failed to process the overall Outbox Relay:", error);
    } finally {
      console.log("Finally do this...");
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
