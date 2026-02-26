import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config();
}

console.log("DEBUG: Using Connection String:", process.env.DATABASE_URL);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in the environment");
}

// 2. Setup the Postgres Connection Pool for the seed script
const pool = new pg.Pool({
  connectionString: connectionString,
});

const adapter = new PrismaPg(pool);

// 3. Instantiate the Client with the adapter
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. Create  Test Users
  await prisma.user.upsert({
    where: { id: "user_1" },
    update: {},
    create: {
      id: "user_1",
      email: "senior_dev@example.com",
      name: "Senior Developer",
    },
  });

  await prisma.user.upsert({
    where: { id: "fail_user" },
    update: {},
    create: {
      id: "fail_user",
      email: "junior@fail.com",
      name: "I will fail email conf.",
    },
  });

  // 2. Create an Event
  const event = await prisma.event.upsert({
    where: { id: "event_1" },
    update: {},
    create: {
      id: "event_1",
      title: "System Design Mastery 2026",
      startTime: new Date("2026-12-01T20:00:00Z"),
    },
  });

  const rows = ["A", "B", "C", "D", "E"];
  const seatNumbers = [1, 2, 3, 4, 5];

  for (const row of rows) {
    for (const seatNumber of seatNumbers) {
      await prisma.seat.upsert({
        where: { id: `${row}-${seatNumber}` },
        update: {},
        create: {
          id: `${row}-${seatNumber}`,
          eventId: event.id,
          row: `${row}-`,
          number: seatNumber,
          status: "AVAILABLE",
        },
      });
    }
  }

  console.log("✅ Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end(); // Don't forget to close the pool!
  });
