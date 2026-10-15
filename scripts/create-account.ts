/** Explicit operator provisioning: password is read from process input, never command arguments. */
import { db } from "../packages/api/src/didar/db";
import { hashPassword } from "../packages/api/src/didar/auth";
const [email, name, role, supplier] = process.argv.slice(2);
if (
  !email ||
  !name ||
  !["admin", "supplier"].includes(role) ||
  (role === "supplier" && !supplier)
)
  throw new Error(
    "Usage: bun scripts/create-account.ts EMAIL NAME admin|supplier [SUPPLIER_ID]; supply password on stdin",
  );
const password = (await Bun.stdin.text()).trim();
if (password.length < 12 || password.length > 128)
  throw new Error("Password must be 12–128 characters");
await db.query(
  "INSERT INTO didar_user(id,email,name,password,role,supplier_id) VALUES($1,$2,$3,$4,$5,$6)",
  [
    crypto.randomUUID(),
    email.toLowerCase(),
    name,
    hashPassword(password),
    role,
    supplier || null,
  ],
);
console.log("Account created; no password logged.");
await db.end();
