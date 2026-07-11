/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Stellar SDK references the Node `global`/`Buffer` globals in places.
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer"],
    esbuildOptions: {
      define: { global: "globalThis" },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  // Pure logic tests only (lib/commit.ts, lib/errors.ts): no DOM needed, so
  // the node environment is enough and this stays dependency-free.
  test: {
    environment: "node",
  },
});
