/**
 * * run 'npx prisma generate' to generate the prisma client
 * * run 'npx prisma migrate dev' to run the migrations
 * * run 'npx prisma studio' to start the prisma studio
 * * run 'npx prisma db push' to push the schema to the database
 * * run 'npx prisma db pull' to pull the schema from the database
 * * run 'npx prisma db seed' to seed the database
 * * run 'npx prisma db reset' to reset the database
 * * run 'npx prisma db drop' to drop the database
 * * run 'npx prisma db migrate' to migrate the database
 * * run 'npx prisma db push' to push the schema to the database
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// 1. Setup the Postgres Connection Pool
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
});

// 2. Connect the Prisma Adapter
const adapter = new PrismaPg(pool);

// 3. Instantiate the Client with the adapter
export const prisma = new PrismaClient({ adapter });

// Senior touch: Handle graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
});
