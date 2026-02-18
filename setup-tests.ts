import { Queue } from "bullmq";
import Redis from "ioredis";
import { afterAll, beforeEach } from "vitest";

const connection = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);
const reservationQueue = new Queue("reservation-expiry", { connection });

beforeEach(async () => {
  await reservationQueue.pause();
  await reservationQueue.obliterate({ force: true });
  await reservationQueue.resume();
});

afterAll(async () => {
  await reservationQueue.close();
  await connection.quit();
});
