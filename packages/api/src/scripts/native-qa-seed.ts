import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createSellerAccountWorkflow,
  approveSellerWorkflow,
} from "@mercurjs/core/workflows";
import { db } from "../didar/db";
// Creates ONLY disposable integration fixtures. Never invoked in db:setup or production.
export default async function seed({ container }: ExecArgs) {
  if (
    process.env.DIDAR_DISPOSABLE_QA !== "true" ||
    process.env.DIDAR_ENVIRONMENT !== "local" ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith("/didar_qa")
  )
    throw Error("Disposable QA required");
  const auth = container.resolve(Modules.AUTH),
    users = container.resolve(Modules.USER);
  const adminEmail = "native-admin@didar.test",
    password = "DidarNative2026!";
  const existing = await users.listUsers({ email: adminEmail });
  if (existing.length) throw Error("Native QA fixtures already present");
  const admin = await users.createUsers({
    email: adminEmail,
    first_name: "مدیر",
    last_name: "دیدار",
  });
  const identity = await auth.register("emailpass", {
    body: { email: adminEmail, password },
  });
  if (!identity.success) throw Error("Native admin registration failed");
  await auth.updateAuthIdentities({
    id: identity.authIdentity!.id,
    app_metadata: { user_id: admin.id },
  });
  await db.query(
    "INSERT INTO didar_native_actor(actor_type,actor_id,user_id) VALUES($1,$2,$3)",
    ["user", admin.id, "demo-admin"],
  );
  for (const [email, sid] of [
    ["native-supplier@didar.test", "s1"],
    ["native-rival@didar.test", "s2"],
  ]) {
    const identity = await auth.register("emailpass", {
      body: { email, password },
    });
    if (!identity.success) throw Error("Native member registration failed");
    const { result: seller } = await createSellerAccountWorkflow(container).run(
      {
        input: {
          auth_identity_id: identity.authIdentity!.id,
          member_email: email,
          first_name: "فروشنده",
          seller: { name: "دیدار " + sid, email, currency_code: "irr" },
        },
      },
    );
    await approveSellerWorkflow(container).run({
      input: { seller_id: seller.id },
    });
    await db.query(
      "INSERT INTO didar_native_seller(seller_id,supplier_id,approved_by) VALUES($1,$2,$3)",
      [seller.id, sid, "demo-admin"],
    );
    // The first vendor deliberately remains unbound: browser must prove/link the existing Didar account.
  }
  console.log(
    "Native QA fixture identities created through native services/workflows; original Didar commerce unchanged.",
  );
  await db.end();
}
