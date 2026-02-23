// prisma.config.ts
import { defineConfig } from "@prisma/config";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  datasource: {
    // For Migration CLI to work
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx tsx ./prisma/seed.ts",
  },
});
