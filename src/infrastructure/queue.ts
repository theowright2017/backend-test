import { Queue, Worker } from "bullmq";
import { redis } from "@/shared/redis";

// 1. Create the Queue
export const reservationQueue = new Queue("reservation-expiry", {
  connection: redis,
});

export const outboxQueue = new Queue("outbox-transaction", {
  connection: redis,
});
