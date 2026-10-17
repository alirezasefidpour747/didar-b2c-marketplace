import { db, transaction } from "./db";
import { getPermissionCatalog } from "@mercurjs/core/permissions/index";
export async function nativeAccess(req: any, u: any) {
  if (u.role !== "admin") throw Error("FORBIDDEN");
  if (req.method === "GET")
    return {
      actors: (
        await db.query(
          `SELECT n.actor_type,n.actor_id,n.user_id,n.active,u.name,u.email,u.role,a.rights,a.active policy_active FROM didar_native_actor n JOIN didar_user u ON u.id=n.user_id LEFT JOIN didar_native_acl a ON a.actor_type=n.actor_type AND a.actor_id=n.actor_id ORDER BY u.name`,
        )
      ).rows,
    };
  const b = req.body || {};
  if (
    !["user", "member"].includes(b.actor_type) ||
    typeof b.actor_id !== "string" ||
    b.actor_id.length > 100 ||
    typeof b.reason !== "string" ||
    !b.reason.trim() ||
    b.reason.length > 1000
  )
    throw Error("INVALID_NATIVE_ACCESS");
  const operation = b.operation;
  if (!["actor", "policy"].includes(operation))
    throw Error("INVALID_NATIVE_ACCESS");
  if (operation === "actor" && typeof b.active !== "boolean")
    throw Error("INVALID_NATIVE_ACCESS");
  const presets = ["DEFAULT", "READ_ONLY", "CONTENT", "ONBOARDING", "DISABLED"];
  if (operation === "policy" && !presets.includes(b.preset))
    throw Error("INVALID_NATIVE_POLICY");
  return transaction(async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext('didar-native-access'))",
    );
    const target = (
      await c.query(
        "SELECT n.*,u.role FROM didar_native_actor n JOIN didar_user u ON u.id=n.user_id WHERE n.actor_type=$1 AND n.actor_id=$2 FOR UPDATE OF n",
        [b.actor_type, b.actor_id],
      )
    ).rows[0];
    if (!target) throw Error("NOT_FOUND");
    const removesAdmin =
      operation === "actor" ? !b.active : !["DEFAULT"].includes(b.preset);
    if (
      target.actor_type === "user" &&
      target.role === "admin" &&
      removesAdmin
    ) {
      const others = (
        await c.query(
          `SELECT 1 FROM didar_native_actor n JOIN didar_user u ON u.id=n.user_id JOIN "user" native ON native.id=n.actor_id LEFT JOIN didar_native_acl a ON a.actor_type=n.actor_type AND a.actor_id=n.actor_id WHERE n.actor_type='user' AND n.actor_id<>$1 AND n.active AND u.role='admin' AND native.deleted_at IS NULL AND (a.actor_id IS NULL OR (a.active AND a.rights->>'users' IN ('edit','manage'))) LIMIT 1`,
          [target.actor_id],
        )
      ).rowCount;
      if (!others) throw Error("CONFLICT_LAST_NATIVE_ADMIN");
    }
    if (operation === "actor")
      await c.query(
        "UPDATE didar_native_actor SET active=$3 WHERE actor_type=$1 AND actor_id=$2",
        [b.actor_type, b.actor_id, b.active],
      );
    else if (b.preset === "DEFAULT")
      await c.query(
        "DELETE FROM didar_native_acl WHERE actor_type=$1 AND actor_id=$2",
        [b.actor_type, b.actor_id],
      );
    else {
      let rights: any = {};
      if (b.preset === "READ_ONLY")
        rights = Object.fromEntries(
          getPermissionCatalog()
            .filter((p) =>
              p.surface.includes(b.actor_type === "user" ? "admin" : "vendor"),
            )
            .map((p) => [p.key, "view"]),
        );
      if (b.preset === "CONTENT")
        rights = { "didar.content": "edit", store: "view" };
      if (b.preset === "ONBOARDING")
        rights = { "didar.onboarding": "edit", store: "view" };
      await c.query(
        `INSERT INTO didar_native_acl(actor_type,actor_id,rights,active,updated_by,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(actor_type,actor_id) DO UPDATE SET rights=excluded.rights,active=excluded.active,updated_by=excluded.updated_by,reason=excluded.reason,updated_at=now()`,
        [
          b.actor_type,
          b.actor_id,
          JSON.stringify(rights),
          b.preset !== "DISABLED",
          u.id,
          b.reason.trim(),
        ],
      );
    }
    await c.query(
      "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)",
      [
        u.id,
        "native_access_changed",
        JSON.stringify({
          actor_type: b.actor_type,
          actor_id: b.actor_id,
          operation,
          preset: b.preset,
          active: b.active,
          reason: b.reason.trim(),
        }),
      ],
    );
    return { ok: true };
  });
}
