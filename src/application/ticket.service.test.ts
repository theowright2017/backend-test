import { describe, it, expect, beforeEach, vi } from "vitest";
import { ticketService } from "./ticket.service";
import { prisma } from "@/shared/database";

describe("TicketService", () => {
  describe("reserveSeat - Concurrency", () => {
    const eventId = "event_test";
    const seatId = "seat_test";

    beforeEach(async () => {
      await prisma.reservation.deleteMany();

      // 2. Setup 'Static' Data (Using upsert so it doesn't fail if already there)

      await prisma.event.upsert({
        where: { id: eventId },
        update: {},
        create: {
          id: eventId,
          title: "Test Event",
          startTime: new Date(Date.now() + 3000),
        },
      });

      await prisma.seat.upsert({
        where: { id: seatId },
        update: { status: "AVAILABLE" },
        create: {
          id: seatId,
          eventId: eventId,
          row: "A",
          number: 1,
          status: "AVAILABLE",
        },
      });
    });

    it("should only allow one reservation when 10 users click at once", async () => {
      const userIds = Array.from({ length: 10 }, (_, i) => `user_${i}`);
      await Promise.all(
        userIds.map((id) =>
          prisma.user.upsert({
            where: { id },
            update: {},
            create: {
              id,
              email: `${id}@test.com`,
              name: `User ${id}`,
            },
          }),
        ),
      );

      // Simulate 10 simultaneous requests
      const results = await Promise.allSettled(
        userIds.map((userId) =>
          ticketService.reserveSeat(eventId, seatId, userId),
        ),
      );

      // Count successes and failures
      const successes = results.filter((r) => r.status === "fulfilled");
      const failures = results.filter((r) => r.status === "rejected");

      // ASSERTIONS
      expect(successes.length).toBe(1); // Only ONE person should win
      expect(failures.length).toBe(9); // 9 people should get "Seat not available"

      // DB CHECK: Ensure only one row exists
      const count = await prisma.reservation.count({ where: { seatId } });
      expect(count).toBe(1);
    });

    it("should block reserving until expired then allow again", async () => {
      console.log("--TTL--", process.env.RESERVATION_TTL);
      const userIds = ["user1", "user2"];
      await Promise.all(
        userIds.map((id) =>
          prisma.user.upsert({
            where: { id },
            update: {},
            create: {
              id,
              email: `${id}@test.com`,
              name: `User ${id}`,
            },
          }),
        ),
      );

      await ticketService.reserveSeat(eventId, seatId, userIds[0]);

      await vi.waitFor(async () => {
        await expect(
          ticketService.reserveSeat(eventId, seatId, userIds[1]),
        ).rejects.toThrow("SEAT_NOT_AVAILABLE");
      }, 500);

      const shouldSuccess = vi.waitFor(async () => {
        const createAfterExpire = await ticketService.reserveSeat(
          eventId,
          seatId,
          userIds[1],
        );
        return createAfterExpire;
      }, 2000);

      expect(await shouldSuccess).toBeTruthy();
    });
  });

  describe("confirmOrder", () => {
    const userId = "test_user";
    const seatId = "seat_1";
    const eventId = "event_1";
    const resId = "res_test";

    beforeEach(async () => {
      await prisma.outbox.deleteMany();
      await prisma.orderItem.deleteMany();
      await prisma.order.deleteMany();
      await prisma.reservation.deleteMany();
      await prisma.seat.deleteMany();
      await prisma.user.deleteMany();

      // --- 1. SETUP: Create real data in the DB ---
      await prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: {
          id: userId,
          email: "junior@test.com",
          name: "test user",
        },
      });

      // 2. Create an Event
      await prisma.event.upsert({
        where: { id: eventId },
        update: {},
        create: {
          id: eventId,
          title: "System Design Mastery 2026",
          startTime: new Date("2026-12-01T20:00:00Z"),
        },
      });

      await prisma.seat.upsert({
        where: { id: seatId },
        update: {},
        create: {
          id: seatId,
          eventId: eventId,
          row: "A-",
          number: 1,
          status: "RESERVED",
        },
      });

      await prisma.reservation.upsert({
        where: { id: resId },
        update: {},
        create: {
          id: resId,
          userId: userId,
          seatId: seatId,
          expiresAt: new Date(Date.now() + 10000),
        },
      });
    });

    it("should successfully process a full order flow", async () => {
      // --- 2. ACT: Call the real function ---
      const order = await ticketService.confirmOrder(
        "res_test",
        "idempotency_key_123",
      );

      // --- 3. ASSERT: Verify everything changed correctly ---

      // Check Order
      expect(order.userId).toBe(userId);
      expect(order.idempotencyKey).toBe("idempotency_key_123");

      // Check Seat is now SOLD
      const updatedSeat = await prisma.seat.findUnique({
        where: { id: seatId },
      });
      expect(updatedSeat?.status).toBe("SOLD");

      // Check Reservation is GONE
      const deletedRes = await prisma.reservation.findUnique({
        where: { id: resId },
      });
      expect(deletedRes).toBeNull();

      // Check Outbox has the payload
      const outbox = await prisma.outbox.findFirst({
        where: { type: "TICKET_PURCHASED" },
      });
      expect(outbox?.payload).toMatchObject({
        email: "junior@test.com",
        seatInfo: `${eventId}-A--1`,
      });
    });

    it("should not create two orders or outboxes if idempotency key is duplicate", async () => {
      await prisma.seat.upsert({
        where: { id: "new_seat" },
        update: {},
        create: {
          id: "new_seat",
          eventId: eventId,
          row: "B",
          number: 2,
          status: "RESERVED",
        },
      });
      await prisma.reservation.upsert({
        where: { id: "new_res" },
        update: {},
        create: {
          id: "new_res",
          userId: userId,
          seatId: "new_seat",
          expiresAt: new Date(Date.now() + 10000),
        },
      });

      const idempotencyKey = "key_123";

      const order1 = await ticketService.confirmOrder(resId, idempotencyKey);

      // Check Order
      expect(order1.userId).toBe(userId);
      expect(order1.idempotencyKey).toBe("key_123");

      const updatedSeat = await prisma.seat.findUnique({
        where: { id: seatId },
      });
      expect(updatedSeat?.status).toBe("SOLD");

      // Check Reservation is GONE
      const deletedRes = await prisma.reservation.findUnique({
        where: { id: resId },
      });
      expect(deletedRes).toBeNull();

      // Check Outbox has the payload
      const outbox = await prisma.outbox.findFirst({
        where: { type: "TICKET_PURCHASED" },
      });
      expect(outbox?.payload).toMatchObject({
        email: "junior@test.com",
        seatInfo: `${eventId}-A--1`,
      });

      await expect(
        ticketService.confirmOrder("new_res", idempotencyKey),
      ).rejects.toMatchObject({
        code: "P2002",
      });
    });
  });
});
