import { afterEach, describe, expect, it } from "vitest";
import session from "express-session";
import type { SessionData } from "express-session";
import { SQLiteSessionStore } from "./session-store.js";

const store = new SQLiteSessionStore();
const sessionId = "phase-one-store-test";

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    store.destroy(sessionId, (error) => error ? reject(error) : resolve());
  });
});

describe("SQLite session store", () => {
  it("persists, retrieves, and destroys an unexpired session", async () => {
    const cookie = new session.Cookie();
    cookie.maxAge = 60_000;
    const value: SessionData = {
      cookie,
      adminId: 7,
      adminRole: "super_admin",
      adminUsername: "event-admin"
    };

    await new Promise<void>((resolve, reject) => {
      store.set(sessionId, value, (error) => error ? reject(error) : resolve());
    });
    const retrieved = await new Promise<SessionData | null>((resolve, reject) => {
      store.get(sessionId, (error, result) => error ? reject(error) : resolve(result ?? null));
    });
    expect(retrieved?.adminUsername).toBe("event-admin");

    await new Promise<void>((resolve, reject) => {
      store.destroy(sessionId, (error) => error ? reject(error) : resolve());
    });
    const deleted = await new Promise<SessionData | null>((resolve, reject) => {
      store.get(sessionId, (error, result) => error ? reject(error) : resolve(result ?? null));
    });
    expect(deleted).toBeNull();
  });

  it("does not return expired sessions", async () => {
    const cookie = new session.Cookie();
    cookie.expires = new Date(Date.now() - 1000);
    const value: SessionData = {
      cookie,
      adminId: 7,
      adminRole: "super_admin",
      adminUsername: "expired-admin"
    };

    await new Promise<void>((resolve, reject) => {
      store.set(sessionId, value, (error) => error ? reject(error) : resolve());
    });
    const retrieved = await new Promise<SessionData | null>((resolve, reject) => {
      store.get(sessionId, (error, result) => error ? reject(error) : resolve(result ?? null));
    });
    expect(retrieved).toBeNull();
  });
});
