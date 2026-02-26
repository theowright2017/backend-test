import { beforeAll, afterAll, describe, it, expect } from "vitest";
import Fastify from "fastify";
import { redis } from "@/shared/redis";
import { rateLimitHook } from "@/interface/rateLimiter"; // your hook
import { ticketRoutes } from "@/interface/routes/ticket.routes";

describe("Global rate limiter", () => {
  const RATE_LIMIT = 10;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = Fastify({ logger: false });

    // Attach global rate limiter
    app.addHook("preHandler", rateLimitHook);

    // Register real routes (or a simple test route)
    app.register(ticketRoutes, { prefix: "/api/v1/tickets" });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await redis.quit(); // if using the real redis client in tests
  });

  it("allows up to 10 requests then returns 429", async () => {
    const url = "/api/v1/tickets/reserve";
    const payload = {
      eventId: "event_1",
      seatId: "A-1",
      userId: "user_test",
    };

    // First 10 should be allowed (or at least not 429)
    for (let i = 0; i < RATE_LIMIT; i++) {
      const res = await app.inject({
        method: "POST",
        url,
        payload,
      });
      expect(res.statusCode).not.toBe(429);
    }

    // 11th should be rate-limited
    const res11 = await app.inject({
      method: "POST",
      url,
      payload,
    });

    expect(res11.statusCode).toBe(429);
    expect(res11.headers["x-ratelimit-limit"]).toBe(String(RATE_LIMIT));
  });
});
