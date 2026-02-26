import { FastifyInstance } from "fastify";
import fastifySocketIO from "fastify-socket.io";
import { redis } from "@/shared/redis"; // Your main command/publisher client
import { Server } from "socket.io";
import { prisma } from "@/shared/database";

// 1. Types: Make Fastify aware of .io
declare module "fastify" {
  interface FastifyInstance {
    io: Server;
  }
}

// 2. The Subscriber: A dedicated pipe for LISTENING (Events + Expirations)
// We create it outside the function so it stays alive across restarts
const redisSub = redis.duplicate();

export async function registerSocketLayer(fastify: FastifyInstance) {
  // A. Register the Socket.io plugin
  await fastify.register(fastifySocketIO, {
    cors: { origin: "*" },
  });

  // B. Wait for Fastify to be ready
  fastify.ready(async (err) => {
    if (err) {
      fastify.log.error(err);
      return;
    }

    // --- SOCKET.IO LOGIC ---
    fastify.io.on("connection", async (socket) => {
      console.log(`🔌 Socket connected: ${socket.id}`);

      socket.on("join-event", async (eventId: string) => {
        console.log("JOIN", socket.id, "->", `event_${eventId}`);
        socket.join(`event_${eventId}`);
        console.log(`👤 User joined room: event_${eventId}`);

        // Get all seats for the event including their relations
        // This is the cleanest way to get the full map in one DB hit
        const allSeats = await prisma.seat.findMany({
          include: {
            reservation: true,
            orderItem: true,
          },
        });

        const state = allSeats.map((seat) => {
          let status = "AVAILABLE";

          if (seat.orderItem) {
            status = "SOLD";
          } else if (seat.reservation) {
            status = "PENDING";
          }

          return { seatId: seat.id, status };
        });

        socket.emit("INITIAL_STATE", state);
      });
    });

    // --- REDIS SUBSCRIBER LOGIC (The "Janitor" + The "Bridge") ---

    // Listen for both Live Updates and Redis Expirations
    await redisSub.psubscribe("events:*:seats");
    await redisSub.subscribe("__keyevent@0__:expired");

    // Handle Live Shouts (e.g., SEAT_UPDATED)
    redisSub.on("pmessage", (_pattern, channel, message) => {
      const eventId = channel.split(":")[1];
      const data = JSON.parse(message);
      console.log("EVNET", eventId, "---", channel);
      console.info("DATA", data);

      const room = `event_${eventId}`;
      fastify.io.to(room).emit("SEAT_UPDATED", data);
      console.log(`📡 Broadcast to ${room}:`, data);
    });

    // Handle Expiry Whispers (The Janitor)
    redisSub.on("message", async (channel, message) => {
      // Handle EXPIRATIONS (The Janitor)
      if (channel.includes("expired") && message.startsWith("lock:seat:")) {
        const seatId = message.split(":")[2];

        try {
          // 1. Clean up the database so the seat is truly "AVAILABLE"
          await prisma.reservation.deleteMany({
            where: { seatId: seatId },
          });

          // 2. Tell the Frontend it's Green again
          fastify.io.emit("SEAT_UPDATED", {
            seatId,
            status: "AVAILABLE",
            type: "SEAT_UPDATED",
          });

          console.log(
            `🧹 Janitor: Cleaned up Redis & Postgres for seat ${seatId}`,
          );
        } catch (err) {
          console.error("Janitor failed to clean Postgres:", err);
        }
      }
    });
  });
}
