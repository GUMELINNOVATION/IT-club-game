import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
const database = join(tmpdir(), "opencode", `detective-browser-${process.pid}.sqlite`);
export default defineConfig({
  metadata: { detectiveDatabase: database },
  testDir: "./tests/browser", fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: "http://127.0.0.1:5177", viewport: { width: 1366, height: 900 }, trace: "retain-on-failure" },
  webServer: [
    { command: "node --import=tsx server/src/index.ts", url: "http://127.0.0.1:3197/api/health", reuseExistingServer: false, env: { PORT: "3197", NODE_ENV: "test", DATABASE_PATH: database, SESSION_SECRET: "detective-browser-tests-only-" + "x".repeat(32) } },
    { command: "npx vite --host 127.0.0.1 --port 5177 --strictPort", url: "http://127.0.0.1:5177", reuseExistingServer: false, env: { ARENA_API_TARGET: "http://127.0.0.1:3197" } }
  ]
});
