// prisma.config.ts
import { defineConfig } from "@prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

export default defineConfig({
  datasource: {
    // For Migration CLI to work
    url: process.env.DATABASE_URL,
  },
});
