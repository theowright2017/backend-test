import { reservationQueue } from "@/infrastructure/queue";
import { ReservationJobData } from "@/domain/types/queue";
import { prisma } from "@/shared/database";
// ... other imports

const reservationLockTime =
  process.env.NODE_ENV === "test"
    ? Number(process.env.RESERVATION_TTL)
    : 10 * 60 * 1000;

export const ticketService = {
  async reserveSeat(eventId: string, seatId: string, userId: string) {
    const lockKey = `lock:event:${eventId}:seat:${seatId}`;

    return await prisma.$transaction(async (tx) => {
      // 1. FAIL FAST: Find the seat first and check status
      // Senior Note: In a high-concurrency app, we'd use a 'SELECT FOR UPDATE' here
      const seat = await tx.seat.findUnique({
        where: { id: seatId },
      });

      if (!seat || seat.status !== "AVAILABLE") {
        throw new Error("SEAT_NOT_AVAILABLE");
        // This rollback ensures no reservation record is created
      }

      // 2. ACT: Update the seat status FIRST
      // This effectively "claims" the seat for this transaction
      await tx.seat.update({
        where: { id: seatId },
        data: { status: "RESERVED" },
      });

      // 3. RECORD: Create the reservation now that we know we own the seat
      const reservation = await tx.reservation.create({
        data: {
          seatId,
          userId,
          expiresAt: new Date(Date.now() + reservationLockTime),
        },
      });

      // 4. SCHEDULE: Queue the janitor
      const jobPayload: ReservationJobData = { seatId, userId, lockKey };
      await reservationQueue.add(`expire-${seatId}`, jobPayload, {
        delay: reservationLockTime,
        removeOnComplete: true,
        attempts: 3,
      });

      return reservation;
    });
  },
};
