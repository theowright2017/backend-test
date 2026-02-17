import Fastify from "fastify";
import { prisma } from "@/shared/database";
import { redis } from "@/shared/redis";
import { ticketRoutes } from "./routes/ticket.routes";

// Senior Note: Importing this file starts the BullMQ Worker immediately
import "@/infrastructure/queue";

const app = Fastify({ logger: true });

// --- TEMP ROUTE FOR TESTING STEP 2 ---
// app.post("/reserve", async (request, reply) => {
//   const { eventId, seatId, userId } = request.body as {
//     eventId: string;
//     seatId: string;
//     userId: string;
//   };

//   try {
//     const reservation = await ticketService.reserveSeat(
//       eventId,
//       seatId,
//       userId,
//     );
//     return { success: true, reservation };
//   } catch (error: any) {
//     //TODO: fix this error: any
//     return reply.status(400).send({ error: error.message });
//   }
// });

// --- THE REGISTRATION ---
// This tells Fastify: "Take all the routes in ticket.routes and
// put them behind the /api/v1/tickets path."
app.register(ticketRoutes, { prefix: "/api/v1/tickets" });

const start = async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    // Redis is already connected via the singleton, but we can ping it
    await redis.ping();
    console.log("✅ Redis connected");

    await app.listen({ port: 3000, host: "0.0.0.0" });
    console.log("🚀 Server running on http://localhost:3000");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
