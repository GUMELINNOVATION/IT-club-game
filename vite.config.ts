import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": process.env.ARENA_API_TARGET ?? "http://localhost:3001"
    }
  },
  build: {
    outDir: "dist"
  }
});
