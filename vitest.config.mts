import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config(); // loads .env into process.env before tests run

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});