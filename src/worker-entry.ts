import { reservationWorker } from "./workers/reservation.worker";
import { processOutbox } from "./infrastructure/outbox.relay";
import { redis } from "@/shared/redis";
import { prisma } from "@/shared/database";
import { outboxWorker } from "./workers/outbox.worker";

const handleSetup = async () => {
  console.log("👷 Worker process is running and watching Redis...");

  // Explicitly checking the worker status to ensure the import wasn't tree-shaken
  reservationWorker.waitUntilReady().then(() => {
    console.log("👷 Reservation Worker is actively polling Redis for jobs.");
  });

  outboxWorker.waitUntilReady().then(() => {
    console.log("👷 Outbox Worker is actively polling Redis for jobs.");
  });

  await processOutbox();
};

const handleShutdown = async (signal: string) => {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);

  // 1. Tell BullMQ to stop taking new jobs from Redis
  // The 'close()' method waits for any active jobs to finish processing
  await reservationWorker.close();
  await outboxWorker.close();
  console.log("✅ Worker has stopped taking new jobs.");

  // 2. Close the Redis connection
  await redis.quit();
  console.log("✅ Redis connection closed.");

  // 3. Close the Database connection
  await prisma.$disconnect();
  console.log("✅ Postgres connection closed.");

  console.log("👋 Shutdown complete. Exit.");
  process.exit(0);
};

// Run setup
handleSetup().catch(console.error);

// Listen for the shutdown signals
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
