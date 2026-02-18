import { describe, it, expect, beforeEach, vi } from "vitest";
import { ticketService } from "./ticket.service";
import { prisma } from "@/shared/database";

describe("TicketService Concurrency", () => {
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
