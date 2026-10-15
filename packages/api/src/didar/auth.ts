import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { db } from "./db";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function sessionUser(req: any) {
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  const { rows } = await db.query(
    `SELECT u.id,u.email,u.name,u.role,u.supplier_id FROM didar_session s JOIN didar_user u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(token)],
  );
  return rows[0];
}
export async function requireUser(req: any, roles: string[]) {
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  if (!roles.includes(u.role)) throw new Error("FORBIDDEN");
  return u;
}
