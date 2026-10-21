import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { database } from "./database.js";

const KEY_LENGTH = 64;
const scryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, KEY_LENGTH);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltHex, keyHex] = encoded.split("$");
  if (algorithm !== "scrypt" || n !== "16384" || r !== "8" || p !== "1" || !saltHex || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_LENGTH || !/^[0-9a-f]+$/i.test(saltHex) || saltHex.length !== 32) return false;
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"), expected.length);

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

declare module "express-session" {
  interface SessionData {
    adminId?: number;
    adminRole?: string;
    adminUsername?: string;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.adminId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  next();
}

export function writeAuditLog(adminUserId: number, action: string, details: object = {}): void {
  database
    .prepare("INSERT INTO audit_log (admin_user_id, action, details) VALUES (?, ?, ?)")
    .run(adminUserId, action, JSON.stringify(details));
}
