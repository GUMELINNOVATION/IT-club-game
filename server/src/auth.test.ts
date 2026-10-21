import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.js";

describe("administrator password hashing", () => {
  it("verifies a password against its scrypt hash", async () => {
    const encoded = await hashPassword("correct horse battery staple");

    await expect(verifyPassword("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", encoded)).resolves.toBe(false);
  });

  it("rejects malformed hashes", async () => {
    await expect(verifyPassword("password", "not-a-password-hash")).resolves.toBe(false);
  });
});
