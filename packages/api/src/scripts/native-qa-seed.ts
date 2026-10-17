import type { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import {
  createSellerAccountWorkflow,
  approveSellerWorkflow,
  addSellerMemberWorkflow,
  updateSellerPaymentDetailsWorkflow,
} from "@mercurjs/core/workflows";
import { MercurModules, SellerRole } from "@mercurjs/types";
import { hashPassword } from "../didar/auth";
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
    if (sid === "s1")
      await updateSellerPaymentDetailsWorkflow(container).run({
        input: {
          seller_id: seller.id,
          data: { bank_name: "QA_PRIVATE_NATIVE_BANK" },
        },
      });
    // The first vendor deliberately remains unbound: browser must prove/link the existing Didar account.
  }
  const staffEmail = "native-staff@didar.test";
  const sellerModule = container.resolve(MercurModules.SELLER);
  const [staff] = await sellerModule.upsertMembers([
    { email: staffEmail, first_name: "همکار", last_name: "محتوا" },
  ]);
  const staffAuth = await auth.register("emailpass", {
    body: { email: staffEmail, password },
  });
  if (!staffAuth.success) throw Error("Native staff auth failed");
  await auth.updateAuthIdentities({
    id: staffAuth.authIdentity!.id,
    app_metadata: { member_id: staff.id },
  });
  await db.query(
    "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,'customer')",
    [
      "native-staff-canonical",
      "native-staff-didar@didar.test",
      "همکار محتوا",
      hashPassword("DidarStaff2026!"),
    ],
  );
  const stores = (
    await db.query(
      "SELECT seller_id,supplier_id FROM didar_native_seller WHERE supplier_id IN ('s1','s2')",
    )
  ).rows;
  for (const store of stores) {
    await addSellerMemberWorkflow(container).run({
      input: {
        seller_id: store.seller_id,
        member_id: staff.id,
        role_id: SellerRole.SELLER_ADMINISTRATION,
      },
    });
    for (const permission of [
      "STOREFRONT",
      "SHARE",
      "ONBOARDING",
      "CONTENT_EDIT",
    ])
      await db.query(
        "INSERT INTO didar_merchant_member(supplier_id,user_id,permission,granted_by) VALUES($1,$2,$3,'demo-admin')",
        [store.supplier_id, "native-staff-canonical", permission],
      );
  }
  const unbound = await users.createUsers({
    email: "native-unbound@didar.test",
    first_name: "هنوز متصل نشده",
  });
  const unboundAuth = await auth.register("emailpass", {
    body: { email: "native-unbound@didar.test", password },
  });
  if (!unboundAuth.success) throw Error("Native unbound auth failed");
  await auth.updateAuthIdentities({
    id: unboundAuth.authIdentity!.id,
    app_metadata: { user_id: unbound.id },
  });
  const editor = await users.createUsers({
    email: "native-content@didar.test",
    first_name: "ویراستار",
    last_name: "دیدار",
  });
  const editorAuth = await auth.register("emailpass", {
    body: { email: "native-content@didar.test", password },
  });
  if (!editorAuth.success) throw Error("Native editor auth failed");
  await auth.updateAuthIdentities({
    id: editorAuth.authIdentity!.id,
    app_metadata: { user_id: editor.id },
  });
  await db.query(
    "INSERT INTO didar_user(id,email,name,password,role) VALUES($1,$2,$3,$4,'customer')",
    [
      "native-content-canonical",
      "native-content-didar@didar.test",
      "ویراستار دیدار",
      hashPassword("DidarStaff2026!"),
    ],
  );
  await db.query(
    "INSERT INTO didar_content_operator(user_id,granted_by) VALUES($1,$2)",
    ["native-content-canonical", "demo-admin"],
  );
  await db.query(
    "INSERT INTO didar_native_actor(actor_type,actor_id,user_id) VALUES('user',$1,$2)",
    [editor.id, "native-content-canonical"],
  );
  console.log(
    "Native QA fixture identities created through native services/workflows; original Didar commerce unchanged.",
  );
  await db.end();
}
