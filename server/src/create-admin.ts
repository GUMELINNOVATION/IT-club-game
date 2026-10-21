import { database } from "./database.js";
import { hashPassword } from "./auth.js";

const username = process.env.ADMIN_USERNAME?.trim();
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error("Set ADMIN_USERNAME and ADMIN_PASSWORD before creating an administrator.");
  process.exitCode = 1;
} else if (username.length < 3 || username.length > 64 || password.length < 12 || password.length > 256) {
  console.error("Username must be 3–64 characters and password must be 12–256 characters.");
  process.exitCode = 1;
} else {
  const exists = database.prepare("SELECT 1 FROM admin_users WHERE username = ? COLLATE NOCASE").get(username);
  if (exists) {
    console.error("That administrator username already exists.");
    process.exitCode = 1;
  } else {
    const passwordHash = await hashPassword(password);
    database
      .prepare("INSERT INTO admin_users (username, password_hash, role) VALUES (?, ?, 'super_admin')")
      .run(username, passwordHash);
    console.log(`Administrator "${username}" created.`);
  }
}

database.close();
