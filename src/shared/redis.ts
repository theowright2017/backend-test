import { Redis } from "ioredis";

//* Singleton pattern - ensures only one instance of the Redis client is created
// Senior Note: BullMQ requires 'maxRetriesPerRequest' to be null
// so it can handle its own reconnection logic.
export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

redis.on("error", (error) => {
  console.error("Redis connection error:", error);
});

redis.on("connect", () => {
  console.log("Successfully connected to Redis");
});
