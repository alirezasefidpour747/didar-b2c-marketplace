import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { randomUUID } from "node:crypto";
import { hashPassword } from "../didar/auth";
import { db, transaction } from "../didar/db";
/** Explicit one-time operator setup. No default account/password, demo seed,
 * email matching, role promotion or automatic bridge. Dual proof is still required. */
export default async function provision({ container }: ExecArgs) {
  const email = process.env.DIDAR_BOOTSTRAP_EMAIL?.trim().toLowerCase(),
    password = process.env.DIDAR_BOOTSTRAP_PASSWORD,
    nativePassword = process.env.NATIVE_BOOTSTRAP_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    !nativePassword ||
    password.length < 16 ||
    nativePassword.length < 16 ||
    password === nativePassword
  )
    throw Error(
      "Explicit email and distinct passwords of at least 16 characters required",
    );
  try {
    await transaction(async (c) => {
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('didar-first-admin'))",
      );
      if (
        (await c.query("SELECT 1 FROM didar_user WHERE role='admin' LIMIT 1"))
          .rowCount
      )
        throw Error(
          "First Admin already provisioned; use existing authorized account management",
        );
      const users = container.resolve(Modules.USER),
        auth = container.resolve(Modules.AUTH);
      if ((await users.listUsers({ email })).length)
        throw Error(
          "Native account exists; provision identities explicitly rather than matching email",
        );
      const identity = await auth.register("emailpass", {
        body: { email, password: nativePassword },
      });
      if (!identity.success || !identity.authIdentity)
        throw Error("Native credential provisioning failed");
      const native = await users.createUsers({
        email,
        first_name: "مدیر",
        last_name: "دیدار",
      });
      await auth.updateAuthIdentities({
        id: identity.authIdentity.id,
        app_metadata: { user_id: native.id },
      });
      const id = randomUUID();
      await c.query(
        "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,'admin')",
        [id, email, "مدیر دیدار", hashPassword(password)],
      );
      await c.query(
        "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,'first_admin_provisioned',$2)",
        [
          id,
          JSON.stringify({
            real_actor_id: id,
            native_actor_id: native.id,
            bridge_created: false,
            explicit_operator_setup: true,
          }),
        ],
      );
    });
    console.log(
      "First native and DIDAR Admin provisioned explicitly. Sign in to native Admin and complete dual proof; no commerce or bridge created.",
    );
  } finally {
    await db.end();
  }
}
