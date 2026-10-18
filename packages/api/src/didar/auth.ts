import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { nativeUser } from "./native-context";
import { db } from "./db";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!/^[a-f0-9]{32}$/.test(salt || "") || !/^[a-f0-9]{128}$/.test(key || ""))
    return false;
  return timingSafeEqual(
    Buffer.from(key, "hex"),
    scryptSync(password, salt, 64),
  );
}
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function sessionUser(req: any) {
  const native = nativeUser(req);
  if (native) return native;
  const token = String(req.headers.authorization || "").replace(/^Bearer /, "");
  const { rows } = await db.query(
    `SELECT u.id,u.email,u.name,u.role,u.supplier_id,sp.status supplier_status,sp.active supplier_active FROM didar_session s JOIN didar_user u ON u.id=s.user_id LEFT JOIN didar_supplier sp ON sp.id=u.supplier_id WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [digest(token)],
  );
  const user = rows[0];
  if (user && !demoAccountAllowed(user.email)) return undefined;
  return user;
}
export async function requireUser(req: any, roles: string[]) {
  const u = await sessionUser(req);
  if (!u) throw new Error("UNAUTHORIZED");
  if (!roles.includes(u.role)) throw new Error("FORBIDDEN");
  if (u.role === "supplier") {
    const action = String(req.path || req.originalUrl || "")
      .split("?")[0]
      .split("/")
      .pop();
    if (!(
      ["history", "profile"].includes(action || "") ||
      (req.method === "GET" &&
        ["invoice", "agency", "curation"].includes(action || ""))
    )) {
      const business = (
        await db.query(
          "SELECT active AND status='approved' AND didar_native_saleable_supplier(id) ok FROM didar_supplier WHERE id=$1",
          [u.supplier_id],
        )
      ).rows[0];
      if (!business?.ok) throw Error("FORBIDDEN");
    }
  }
  return u;
}

/** Public demo identities are usable only with an explicit local runtime, regardless of NODE_ENV. */
export function demoAccountAllowed(email: string) {
  return (
    !email.toLowerCase().endsWith("@didar.test") ||
    process.env.DIDAR_ENVIRONMENT === "local"
  );
}
