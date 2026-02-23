import { FastifyInstance, FastifySchema } from "fastify";
import { ticketService } from "@/application/ticket.service";
import { prisma } from "@/shared/database";

// Define the TypeScript interface for the body
interface ReserveSeatBody {
  eventId: string;
  seatId: string;
  userId: string;
}

// Define the JSON Schema (Fastify uses this for high-speed validation)
const reserveSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["eventId", "seatId", "userId"],
    properties: {
      eventId: { type: "string" },
      seatId: { type: "string" },
      userId: { type: "string" },
    },
  },
};

/**
 * Ticket Routes Plugin
 * All routes here are prefixed with /api/v1/tickets in server.ts
 */
export async function ticketRoutes(app: FastifyInstance) {
  app.post<{ Body: ReserveSeatBody }>(
    "/reserve",
    { schema: reserveSchema },
    async (request, reply) => {
      // 1. Extract data from the request body

      const { eventId, seatId, userId } = request.body;

      // Simple validation check
      if (!eventId || !seatId || !userId) {
        return reply.status(400).send({
          error: "Missing required fields: eventId, seatId, or userId",
        });
      }

      try {
        // 2. Call our Step 2 Service Logic
        const reservation = await ticketService.reserveSeat(
          eventId,
          seatId,
          userId,
        );

        // 3. Respond with success
        return reply.status(201).send({
          success: true,
          message: "Seat successfully held for 10 minutes",
          data: reservation,
        });
      } catch (error: any) {
        // 4. Handle errors (Seat taken, DB down, etc.)
        app.log.error("logging error", error);
        return reply.status(400).send({
          success: false,
          error: error.message || "An unexpected error occurred",
        });
      }
    },
  );

  app.post<{
    Body: {
      reservationId: string;
      idempotencyKey: string;
    };
  }>(
    "/confirm",
    {
      schema: {
        body: {
          type: "object",
          required: ["reservationId", "idempotencyKey"],
          properties: {
            reservationId: { type: "string" },
            idempotencyKey: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { reservationId, idempotencyKey } = request.body;

      if (!reservationId || !idempotencyKey) {
        return reply.status(400).send({
          error: "Missing required fields: reservationId or idempotencyKey",
        });
      }

      try {
        const order = await ticketService.confirmOrder(
          reservationId,
          idempotencyKey,
        );

        return reply.status(201).send({
          success: true,
          message: "Order confirmed",
          data: order,
        });
      } catch (error: any) {
        // Check if it's a Prisma Unique Constraint error (P2002)
        if (
          error.code === "P2002" &&
          error.meta?.target?.includes("idempotencyKey")
        ) {
          const existingOrder = await prisma.order.findUnique({
            where: { idempotencyKey },
          });
          return reply.status(200).send({
            success: true,
            message: "Order already confirmed (idempotency)",
            data: existingOrder,
          });
        }
        app.log.error("logging error", error);
        return reply.status(400).send({
          success: false,
          error: error.message || "An unexpected error occurred",
        });
      }
    },
  );
}
