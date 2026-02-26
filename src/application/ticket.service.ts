import { reservationQueue } from "@/infrastructure/queue";
import { ReservationJobData } from "@/domain/types/queue";
import { prisma } from "@/shared/database";
import { redis } from "@/shared/redis";

const reservationLockTime =
  process.env.NODE_ENV === "test"
    ? parseInt(process.env.RESERVATION_TEST_TTL ?? "")
    : parseInt(process.env.RESERVATION_TTL ?? "") * 6;

export const ticketService = {
  async reserveSeat(eventId: string, seatId: string, userId: string) {
    // --- STEP 1: THE REDIS SHIELD ---
    const lockKey = `lock:seat:${seatId}`;
    const locked = await redis.set(
      lockKey,
      userId,
      "PX",
      reservationLockTime,
      "NX",
    );

    if (!locked) {
      throw new Error("SEAT_IS_BEING_PURCHASED_BY_ANOTHER_USER");
    }
    try {
      // --- STEP 2: THE DATABASE SOURCE OF TRUTH ---
      const reservationProcess = await prisma.$transaction(async (tx) => {
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
          removeOnComplete: true, // Keep Redis clean
          removeOnFail: false, // KEEP failures for debugging!
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 2000, // Wait 2s, then 4s, 8s, 16s, 32s...
          },
        });

        return reservation;
      });
      console.log("------ after res process");
      // --- STEP 3: SUCCESS BROADCAST ---
      const seat = await prisma.seat.findUnique({
        where: { id: seatId },
      });

      await redis.publish(
        `events:${eventId}:seats`,
        JSON.stringify({
          type: "SEAT_UPDATED",
          status: "PENDING",
          seatId: `${seat?.row}${seat?.number}`,
          userId: userId,
        }),
      );

      return reservationProcess;
    } catch (error) {
      // --- STEP 4: ERROR CLEANUP ---
      // If the DB transaction fails (e.g., credit card declined),
      // we must release the lock so others can try.
      await redis.del(lockKey);
      throw error;
    }
  },

  async confirmOrder(reservationId: string, idempotencyKey: string) {
    const orderInfo = await prisma.$transaction(async (tx) => {
      // get res info
      const reservation = await tx.reservation.findFirst({
        where: { id: reservationId },
      });

      if (!reservation) {
        throw new Error("NO_RESERVATION_FOUND");
      }

      const seat = await tx.seat.findUnique({
        where: { id: reservation.seatId },
      });

      const user = await tx.user.findUnique({
        where: { id: reservation.userId },
      });

      if (!seat || seat.status !== "RESERVED") {
        throw new Error("Seat is no longer reserved or available");
      } else if (!user) {
        throw new Error("User not found");
      }

      // create order
      const order = await tx.order.create({
        data: {
          userId: reservation.userId,
          totalAmount: 100.0,
          idempotencyKey: idempotencyKey,
          items: {
            create: {
              seatId: reservation.seatId,
            },
          },
        },
      });

      // update seat status
      await tx.seat.update({
        where: { id: reservation.seatId },
        data: { status: "SOLD" },
      });

      // remove reservation
      await tx.reservation.delete({
        where: { id: reservation.id },
      });

      // create outbox transaction
      await tx.outbox.create({
        data: {
          type: "TICKET_PURCHASED",
          payload: {
            orderId: order.id,
            userId: user.id,
            email: user.email,
            seatInfo: `${seat.eventId}-${seat.row}-${seat.number}`,
          },
        },
      });

      return {
        order,
        seatId: reservation.seatId,
        eventId: seat.eventId,
        userId: order.userId,
      };
    });

    // DELETE LOCK
    await redis.del(`lock:seat:${orderInfo.seatId}`);

    // BROADCAST
    // This ensures we only broadcast if the DB actually saved the changes
    const channel = `events:${orderInfo.eventId}:seats`;
    const message = JSON.stringify({
      type: "SEAT_UPDATED",
      seatId: orderInfo.seatId,
      status: "SOLD",
      timestamp: new Date().toISOString(),
      userId: orderInfo.userId,
    });

    await redis.publish(channel, message);

    return orderInfo.order;
  },

  sendConfirmationEmail(userId: string, email: string, orderId: string) {
    if (email.includes("fail")) {
      console.log("❌ Email confirmation failed");
      throw new Error();
    }
    console.log(
      "✅  Email confirmation sent to user: ",
      userId,
      " to email: ",
      email,
    );
  },
};
