import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Manually load the test env so it's available to Prisma immediately
dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    globals: true,
    setupFiles: "./setup-tests.ts",
    environment: "node",
    env: {
      DATABASE_URL:
        "postgresql://devuser:devpassword@localhost:5432/ticket_orchestrator?schema=public",
      REDIS_URL: "redis://localhost:6379",
      NODE_ENV: "test",
      RESERVATION_TTL: "1000",
    },
    // // Load the test env specifically
    // env: dotenv.config({ path: ".env.test" }).parsed,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
