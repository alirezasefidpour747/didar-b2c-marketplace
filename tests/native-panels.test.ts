import { safeNativeReturn } from "../packages/didar-ui/src/native-handoff";
import { test, expect, afterAll } from "bun:test";
import { Pool } from "../packages/api/node_modules/pg";
import { readFileSync } from "node:fs";
const db = new Pool({ connectionString: process.env.DATABASE_URL }),
  origin = process.env.TEST_API_URL || "http://localhost:9000";
afterAll(async () => {
  // Leave legacy-transition regression fixtures unconnected. Native browser
  // journeys must prove both existing accounts rather than inherit test linkage.
  if (process.env.DIDAR_DISPOSABLE_QA === "true")
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','demo-supplier','native-staff-canonical')",
    );
  await db.end();
});
async function request(path: string, token = "", body?: any, seller?: string) {
  return fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
      ...(seller ? { "x-seller-id": seller } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function deniedByMembership(response: Response) {
  expect([400, 403]).toContain(response.status);
  expect((await response.json()).message).toMatch(/not a member|FORBIDDEN/);
}
async function login(actor: string, email: string, password: string) {
  const r = await request("/auth/" + actor + "/emailpass", "", {
    email,
    password,
  });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await r.json()).token;
}
async function proof(email: string) {
  const r = await request("/didar/login", "", {
    email,
    password: "DidarDemo2026!",
  });
  expect(r.status).toBe(200);
  return (await r.json()).token;
}
test("native identity migration is additive and repeatable; connections do not clone commercial records", async () => {
  const before = (
    await db.query(
      "SELECT (SELECT count(*) FROM didar_product)::int products,(SELECT count(*) FROM didar_offer)::int offers,(SELECT count(*) FROM didar_user)::int users,(SELECT count(*) FROM didar_order)::int orders",
    )
  ).rows[0];
  for (let n = 0; n < 2; n++)
    for (const name of [
      "native-schema.sql",
      "native-acl-schema.sql",
      "native-lifecycle-schema.sql",
    ])
      await db.query(readFileSync("packages/api/src/didar/" + name, "utf8"));
  expect(
    (
      await db.query(
        "SELECT (SELECT count(*) FROM didar_product)::int products,(SELECT count(*) FROM didar_offer)::int offers,(SELECT count(*) FROM didar_user)::int users,(SELECT count(*) FROM didar_order)::int orders",
      )
    ).rows[0],
  ).toEqual(before);
});
test("native admin and member authentication, dual proof, immediate revocation and seller isolation", async () => {
  const admin = await login(
      "user",
      "native-admin@didar.test",
      "DidarNative2026!",
    ),
    vendor = await login(
      "member",
      "native-supplier@didar.test",
      "DidarNative2026!",
    );
  const seller = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const rival = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s2'",
    )
  ).rows[0].seller_id;
  const actor = (
    await db.query(
      "SELECT id FROM member WHERE email='native-supplier@didar.test'",
    )
  ).rows[0].id;
  const didarAdmin = await proof("admin@didar.test"),
    didarSupplier = await proof("supplier@didar.test");
  expect((await request("/admin/didar/context")).status).toBe(401);
  expect((await request("/admin/didar/context", didarAdmin)).status).toBe(401);
  expect((await request("/didar/manage", admin)).status).toBe(401);
  expect((await request("/admin/didar/context", vendor)).status).toBe(401);
  expect((await request("/admin/didar/context", admin)).status).toBe(200);
  expect(
    (await request("/vendor/didar/context", vendor, undefined, seller)).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/vendor/didar/connect",
        vendor,
        { didar_token: didarAdmin },
        seller,
      )
    ).status,
  ).toBe(403);
  await deniedByMembership(
    await request(
      "/vendor/didar/connect",
      vendor,
      { didar_token: didarSupplier },
      rival,
    ),
  );
  const connected = await request(
    "/vendor/didar/connect",
    vendor,
    { didar_token: didarSupplier },
    seller,
  );
  expect(connected.status, await connected.clone().text()).toBe(200);
  const ownerBootstrap = await request(
    "/vendor/members/me?fields=+permissions",
    vendor,
    undefined,
    seller,
  );
  expect(ownerBootstrap.status).toBe(200);
  expect(await ownerBootstrap.text()).not.toContain("QA_PRIVATE_NATIVE_BANK");
  const result = await request(
    "/vendor/didar/manage",
    vendor,
    undefined,
    seller,
  );
  expect(result.status, await result.clone().text()).toBe(200);
  const data = await result.json();
  expect(data.suppliers.every((s: any) => s.id === "s1")).toBe(true);
  expect(
    data.products
      .flatMap((p: any) => p.offers || [])
      .every((o: any) => o.supplier_id === "s1"),
  ).toBe(true);
  const ledger = await request(
    "/vendor/didar/ledger",
    vendor,
    undefined,
    seller,
  );
  expect(ledger.status).toBe(200);
  const ownLedger = await ledger.json();
  expect(ownLedger.balances.every((b: any) => b.party === "supplier:s1")).toBe(
    true,
  );
  expect(ownLedger.obligations.every((b: any) => b.supplier_id === "s1")).toBe(
    true,
  );
  expect(
    (
      await request(
        "/vendor/didar/treasury",
        vendor,
        { operation: "purchase" },
        seller,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/vendor/didar/storefront",
        vendor,
        { operation: "save", supplier_id: "s2" },
        seller,
      )
    ).status,
  ).toBe(403);
  await deniedByMembership(
    await request("/vendor/didar/context", vendor, undefined, rival),
  );
  expect(
    (await request("/vendor/didar/checkout", vendor, {}, seller)).status,
  ).toBe(404);
  await db.query(
    "UPDATE didar_native_seller SET active=false WHERE seller_id=$1",
    [seller],
  );
  expect(
    (await request("/vendor/didar/manage", vendor, undefined, seller)).status,
  ).toBe(403);
  await db.query(
    "UPDATE didar_native_seller SET active=true WHERE seller_id=$1",
    [seller],
  );
  await db.query(
    "UPDATE seller_member SET deleted_at=now() WHERE seller_id=$1 AND member_id=$2",
    [seller, actor],
  );
  await deniedByMembership(
    await request("/vendor/didar/manage", vendor, undefined, seller),
  );
  await db.query(
    "UPDATE seller_member SET deleted_at=NULL WHERE seller_id=$1 AND member_id=$2",
    [seller, actor],
  );
  await db.query(
    "DELETE FROM didar_native_actor WHERE actor_type='member' AND actor_id=$1",
    [actor],
  );
}, 30000);

test("native RBAC adds a restriction to Didar admin authority and cannot be bypassed through manage mutation kinds", async () => {
  const { nativeHandler } = await import("../packages/api/src/didar/native");
  const { nativeUser } =
    await import("../packages/api/src/didar/native-context");
  const id = (
    await db.query(
      `SELECT actor_id FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin'`,
    )
  ).rows[0].actor_id;
  async function invoke(
    action: string,
    method: string,
    permissions: any,
    body?: any,
  ) {
    let status = 200;
    const req: any = {
      path: "/admin/didar/" + action,
      originalUrl: "/admin/didar/" + action,
      method,
      params: { action },
      query: {},
      headers: {},
      auth_context: { actor_type: "user", actor_id: id },
      permissions_enforced: true,
      permissions,
      body,
    };
    const res: any = {
      setHeader() {},
      status(n: number) {
        status = n;
        return this;
      },
      json(value: any) {
        return value;
      },
    };
    const data = await nativeHandler(req, res);
    expect(nativeUser(req)).toBeUndefined();
    return { status, data };
  }
  expect((await invoke("manage", "GET", {})).status).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "view" }, { kind: "product" }))
      .status,
  ).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "edit" }, { kind: "supplier" }))
      .status,
  ).toBe(403);
  expect(
    (
      await invoke(
        "manage",
        "POST",
        { products: "edit", sellers: "edit" },
        { kind: "supplier_state" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await invoke("manage", "POST", { products: "manage" }, { kind: "rate" }))
      .status,
  ).toBe(403);
  expect(
    (
      await invoke(
        "finance",
        "POST",
        { payments: "edit" },
        { operation: "refund" },
      )
    ).status,
  ).toBe(403);
  expect((await invoke("catalog", "GET", {})).status).toBe(403);
});

test("generic native product mutations cannot diverge or delete an existing linked gold master", async () => {
  const token = await login(
    "user",
    "native-admin@didar.test",
    "DidarNative2026!",
  );
  const p = (
    await db.query(
      "SELECT p.id,p.title,p.native_id,n.title native_title FROM didar_product p JOIN product n ON n.id=p.native_id ORDER BY p.id LIMIT 1",
    )
  ).rows[0];
  expect(p).toBeDefined();
  const response = await request("/admin/products/" + p.native_id, token, {
    title: "Must not replace gold master",
  });
  expect(response.status).toBe(409);
  expect((await response.json()).message).toBe(
    "CONFLICT_USE_DIDAR_PRODUCT_EDITOR",
  );
  expect(
    (
      await request("/admin/products/" + p.native_id, "", {
        title: "unauthenticated",
      })
    ).status,
  ).toBe(401);
  const batch = await request("/admin/products/batch", token, {
    delete: [p.native_id],
  });
  expect(batch.status).toBe(409);
  const after = (
    await db.query(
      "SELECT p.id,p.title,p.native_id,n.title native_title FROM didar_product p JOIN product n ON n.id=p.native_id WHERE p.id=$1",
      [p.id],
    )
  ).rows[0];
  expect(after).toEqual(p);
});

test("native Vendor generic product mutations reveal no private product existence and cannot create a competing master", async () => {
  const token = await login(
    "member",
    "native-supplier@didar.test",
    "DidarNative2026!",
  );
  const sid = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const known = (
    await db.query(
      "SELECT native_id FROM didar_product WHERE native_id IS NOT NULL LIMIT 1",
    )
  ).rows[0].native_id;
  const a = await request(
    "/vendor/products/" + known,
    token,
    { title: "blocked" },
    sid,
  );
  const b = await request(
    "/vendor/products/does-not-exist",
    token,
    { title: "blocked" },
    sid,
  );
  expect(a.status).toBe(409);
  expect(b.status).toBe(409);
  expect(await a.json()).toEqual(await b.json());
});

test("real Mercur permission resolver restricts native staff to the selected merchant and never promotes the customer identity", async () => {
  const token = await login(
    "member",
    "native-staff@didar.test",
    "DidarNative2026!",
  );
  const stores = (
    await db.query(
      "SELECT seller_id,supplier_id FROM didar_native_seller WHERE supplier_id IN ('s1','s2')",
    )
  ).rows;
  const one = stores.find((s: any) => s.supplier_id === "s1").seller_id,
    two = stores.find((s: any) => s.supplier_id === "s2").seller_id;
  const proofResponse = await request("/didar/login", "", {
    email: "native-staff-didar@didar.test",
    password: "DidarStaff2026!",
  });
  expect(proofResponse.status).toBe(200);
  const proof = (await proofResponse.json()).token;
  expect(
    (await request("/vendor/didar/connect", token, { didar_token: proof }, one))
      .status,
  ).toBe(200);
  for (const [selected, supplier] of [
    [one, "s1"],
    [two, "s2"],
  ]) {
    const ctx = await request(
      "/vendor/didar/context",
      token,
      undefined,
      selected,
    );
    expect(ctx.status).toBe(200);
    const context = await ctx.json();
    expect(context.user.role).toBe("customer");
    expect(context.user.native_supplier_id).toBe(supplier);
    expect(context.can_catalog).toBe(false);
    const didarMe = await request(
      "/vendor/didar/me",
      token,
      undefined,
      selected,
    );
    expect(didarMe.status).toBe(200);
    const ownUser = (await didarMe.json()).user;
    expect(ownUser.content_operator).toBe(false);
    expect(
      ownUser.merchant_memberships.every(
        (m: any) => m.supplier_id === supplier,
      ),
    ).toBe(true);

    const me = await request(
      "/vendor/members/me?fields=+permissions",
      token,
      undefined,
      selected,
    );
    expect(me.status).toBe(200);
    const member = (await me.json()).seller_member;
    expect(member.permissions["didar.content"]).toBe("edit");
    expect(member.permissions.payments).toBeUndefined();
    expect(member.permissions.customers).toBeUndefined();
    expect(JSON.stringify(member)).not.toContain("QA_PRIVATE_NATIVE_BANK");
    const bootstrap = await request(
      "/vendor/sellers?fields=+seller.payment_details.*,+seller.professional_details.*",
      token,
      undefined,
      selected,
    );
    expect(bootstrap.status).toBe(200);
    expect(await bootstrap.text()).not.toContain("QA_PRIVATE_NATIVE_BANK");
    const pages = await request(
      "/vendor/didar/pages",
      token,
      undefined,
      selected,
    );
    expect(pages.status, await pages.clone().text()).toBe(200);
    const index = await pages.json();
    expect(index.scopes.global).toBe(false);
    expect(index.scopes.suppliers.map((s: any) => s.id)).toEqual([supplier]);
    expect(index.pages.every((p: any) => p.supplier_id === supplier)).toBe(
      true,
    );
    const store = await request(
      "/vendor/didar/storefront",
      token,
      undefined,
      selected,
    );
    expect(store.status).toBe(200);
    const data = await store.json();
    expect(data.suppliers.map((s: any) => s.id)).toEqual([supplier]);
    expect(data.members.every((m: any) => m.supplier_id === supplier)).toBe(
      true,
    );
    const onboarding = await request(
      "/vendor/didar/onboarding",
      token,
      undefined,
      selected,
    );
    expect(onboarding.status).toBe(200);
    expect((await onboarding.json()).suppliers.map((s: any) => s.id)).toEqual([
      supplier,
    ]);
  }
  expect(
    (
      await request(
        "/vendor/didar/pages?options=1&supplier_id=s2",
        token,
        undefined,
        one,
      )
    ).status,
  ).toBe(403);
  for (const path of [
    "/vendor/orders",
    "/vendor/customers",
    "/vendor/products",
    "/vendor/didar/ledger",
    "/vendor/didar/manage",
  ])
    expect((await request(path, token, undefined, one)).status).toBe(403);
  await db.query(
    "UPDATE didar_merchant_member SET active=false WHERE user_id='native-staff-canonical' AND supplier_id='s1'",
  );
  expect(
    (await request("/vendor/didar/pages", token, undefined, one)).status,
  ).toBe(403);
  await db.query(
    "UPDATE didar_merchant_member SET active=true WHERE user_id='native-staff-canonical' AND supplier_id='s1'",
  );
  expect(
    (
      await db.query(
        "SELECT role,supplier_id FROM didar_user WHERE id='native-staff-canonical'",
      )
    ).rows[0],
  ).toEqual({ role: "customer", supplier_id: null });
  await db.query(
    "DELETE FROM didar_native_actor WHERE actor_type='member' AND user_id='native-staff-canonical'",
  );
}, 30000);

test("native global content operator and explicit readonly admin policy cannot read commerce or financial data", async () => {
  const editor = await login(
    "user",
    "native-content@didar.test",
    "DidarNative2026!",
  );
  const me = await request("/admin/users/me?fields=+permissions", editor);
  expect(me.status).toBe(200);
  const rights = (await me.json()).user.permissions;
  expect(rights["didar.content"]).toBe("edit");
  expect(rights.products).toBeUndefined();
  expect((await request("/admin/didar/pages", editor)).status).toBe(200);
  for (const path of [
    "/admin/products",
    "/admin/customers",
    "/admin/didar/ledger",
    "/admin/didar/manage",
  ])
    expect((await request(path, editor)).status).toBe(403);
  const admin = await login(
      "user",
      "native-admin@didar.test",
      "DidarNative2026!",
    ),
    id = (
      await db.query(
        "SELECT actor_id FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin'",
      )
    ).rows[0].actor_id;
  try {
    await db.query(
      "INSERT INTO didar_native_acl(actor_type,actor_id,rights,updated_by,reason) VALUES('user',$1,$2,'demo-admin','QA explicit readonly role')",
      [id, JSON.stringify({ products: "view" })],
    );
    expect((await request("/admin/didar/manage", admin)).status).toBe(200);
    expect(
      (
        await request("/admin/didar/manage", admin, {
          kind: "product",
          title: "must not create",
        })
      ).status,
    ).toBe(403);
    expect((await request("/admin/didar/ledger", admin)).status).toBe(403);
    expect((await request("/admin/customers", admin)).status).toBe(403);
  } finally {
    await db.query(
      "DELETE FROM didar_native_acl WHERE actor_type='user' AND actor_id=$1",
      [id],
    );
  }
  expect((await request("/admin/didar/ledger", admin)).status).toBe(200);
}, 30000);

test("native access changes are audited, revocable and cannot disable the last usable central administrator", async () => {
  const admin = await login(
      "user",
      "native-admin@didar.test",
      "DidarNative2026!",
    ),
    editor = await login(
      "user",
      "native-content@didar.test",
      "DidarNative2026!",
    );
  const id = (
    await db.query(
      "SELECT actor_id FROM didar_native_actor WHERE actor_type='user' AND user_id='native-content-canonical'",
    )
  ).rows[0].actor_id;
  const owner = (
    await db.query(
      "SELECT actor_id FROM didar_native_actor WHERE actor_type='user' AND user_id='demo-admin'",
    )
  ).rows[0].actor_id;
  expect((await request("/admin/didar/access-links", editor)).status).toBe(403);
  const disabled = await request("/admin/didar/access-links", admin, {
    operation: "actor",
    actor_type: "user",
    actor_id: id,
    active: false,
    reason: "QA revoke native content login",
  });
  expect(disabled.status).toBe(200);
  expect((await request("/admin/didar/pages", editor)).status).toBe(403);
  expect(
    (
      await request("/admin/didar/access-links", admin, {
        operation: "actor",
        actor_type: "user",
        actor_id: id,
        active: true,
        reason: "QA restore native content login",
      })
    ).status,
  ).toBe(200);
  expect((await request("/admin/didar/pages", editor)).status).toBe(200);
  expect(
    (
      await request("/admin/didar/access-links", admin, {
        operation: "actor",
        actor_type: "user",
        actor_id: owner,
        active: false,
        reason: "must not disable last owner",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("/admin/didar/access-links", admin, {
        operation: "policy",
        actor_type: "user",
        actor_id: owner,
        preset: "READ_ONLY",
        reason: "must not lock out last owner",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await db.query(
        "SELECT 1 FROM didar_audit WHERE action='native_access_changed' AND details->>'actor_id'=$1",
        [id],
      )
    ).rowCount,
  ).toBeGreaterThanOrEqual(2);
});

test("a linked pending supplier gets a native approval status without accessing stock or finance", async () => {
  const token = await login(
    "member",
    "native-supplier@didar.test",
    "DidarNative2026!",
  );
  const selected = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const didar = await request("/didar/login", "", {
    email: "supplier@didar.test",
    password: "DidarDemo2026!",
  });
  const proof = (await didar.json()).token;
  const actor = (
    await db.query(
      "SELECT id FROM member WHERE email='native-supplier@didar.test'",
    )
  ).rows[0].id;
  try {
    await db.query(
      "UPDATE didar_supplier SET active=false,status='pending' WHERE id='s1'",
    );
    expect(
      (
        await request(
          "/vendor/didar/connect",
          token,
          { didar_token: proof },
          selected,
        )
      ).status,
    ).toBe(200);
    const context = await request(
      "/vendor/didar/context",
      token,
      undefined,
      selected,
    );
    expect(context.status).toBe(200);
    expect((await context.json()).user.supplier_status).toBe("pending");
    const onboarding = await request(
      "/vendor/didar/onboarding",
      token,
      undefined,
      selected,
    );
    expect(onboarding.status).toBe(200);
    expect((await onboarding.json()).pending_approval).toBe(true);
    for (const action of ["manage", "inventory", "ledger"])
      expect(
        (await request("/vendor/didar/" + action, token, undefined, selected))
          .status,
      ).toBe(403);
  } finally {
    await db.query(
      "UPDATE didar_supplier SET active=true,status='approved' WHERE id='s1'",
    );
    await db.query(
      "DELETE FROM didar_native_actor WHERE actor_type='member' AND actor_id=$1",
      [actor],
    );
  }
});

test("unconnected native users have no customer/product privileges before proving an approved existing Didar role", async () => {
  const token = await login(
    "user",
    "native-unbound@didar.test",
    "DidarNative2026!",
  );
  const me = await request("/admin/users/me?fields=+permissions", token);
  expect(me.status).toBe(200);
  expect((await me.json()).user.permissions).toEqual({});
  for (const path of [
    "/admin/products",
    "/admin/customers",
    "/admin/didar/manage",
    "/admin/didar/seller-links",
    "/admin/didar/ledger",
  ])
    expect((await request(path, token)).status).toBe(403);
});

test("native seller suspension gates new global/scoped sales while preserving paid history and legacy unmapped suppliers", async () => {
  const token = await login(
    "user",
    "native-admin@didar.test",
    "DidarNative2026!",
  );
  const seller = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  const history = async () =>
    (
      await db.query(
        "SELECT md5(coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.id)::text,'')) fingerprint FROM didar_order o WHERE status='paid'",
      )
    ).rows[0].fingerprint;
  const before = await history();
  const result = await request(`/admin/sellers/${seller}/suspend`, token, {
    reason: "Disposable native lifecycle QA",
  });
  expect(result.status, await result.clone().text()).toBe(200);
  try {
    const eligible = (
      await db.query(
        "SELECT didar_native_saleable_supplier('s1') scoped,didar_global_supplier('s1') global",
      )
    ).rows[0];
    expect(eligible).toEqual({ scoped: false, global: false });
    const catalog = await request("/didar/catalog");
    expect(catalog.status).toBe(200);
    expect(
      (await catalog.json()).products
        .flatMap((p: any) => p.offers || [])
        .some((o: any) => o.supplier_id === "s1"),
    ).toBe(false);
    expect(
      (
        await request("/didar/quote", "", {
          lines: [{ offer_id: "ring-s1", quantity: 1 }],
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await db.query(
          "SELECT didar_native_saleable_supplier('legacy-unmapped') ok",
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(await history()).toBe(before);
  } finally {
    expect(
      (await request(`/admin/sellers/${seller}/unsuspend`, token, {})).status,
    ).toBe(200);
  }
  expect(
    (await db.query("SELECT didar_native_saleable_supplier('s1') ok")).rows[0]
      .ok,
  ).toBe(true);
  expect(await history()).toBe(before);
});

test("workspace handoff status requires the existing session and exposes no native credentials", async () => {
  expect((await request("/didar/workspace")).status).toBe(401);
  const customer = await proof("customer@didar.test");
  expect(await (await request("/didar/workspace", customer)).json()).toEqual({
    ready: false,
    surface: null,
  });
  const admin = await proof("admin@didar.test");
  const hint = await request("/didar/workspace", admin);
  expect(hint.status).toBe(200);
  expect(await hint.json()).toEqual({ ready: true, surface: "admin" });
});

test("native handoff accepts bounded feature references and rejects redirects, credentials and path escapes", () => {
  for (const path of [
    "/didar",
    "/didar/pages/preview/version-42",
    "/didar/pricing?product_id=ring",
    "/didar/orders/order-123",
  ])
    expect(safeNativeReturn(path)).toBe(path);
  for (const path of [
    "https://evil.test/didar",
    "//evil.test/didar",
    "/didar/../orders",
    "/didar/%2e%2e/orders",
    "/didar\\evil",
    "/didar?token=secret",
    "/didar?product_id=a&product_id=b",
    "/didar?product_id=<script>",
    "/didar#secret",
  ])
    expect(safeNativeReturn(path)).toBeNull();
});
