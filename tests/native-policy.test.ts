import { beforeAll, afterAll, test, expect } from "bun:test";
import { financeFixture, finDB as db, finOK } from "./financial-helpers";
const disposableQA =
  process.env.DIDAR_DISPOSABLE_QA === "true" &&
  process.env.DIDAR_ENVIRONMENT === "local" &&
  /^postgres(?:ql)?:\/\/[^@]+@127\.0\.0\.1:\d+\/didar_qa$/.test(
    process.env.DATABASE_URL || "",
  );
const origin = process.env.TEST_API_URL!;
let admin: string,
  vendor: string,
  seller: string,
  actor: string,
  f: any,
  context: string,
  offer: any,
  paid: any;
const password = "NativePolicy2026!",
  email = "policy-" + crypto.randomUUID() + "@didar.test";
async function req(
  path: string,
  token = "",
  body?: any,
  selected?: string,
  method?: string,
  ctx?: string,
) {
  const r = await fetch(origin + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...(selected ? { "x-seller-id": selected } : {}),
      ...(ctx ? { "x-didar-context": ctx } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
async function ok(
  path: string,
  token = "",
  body?: any,
  selected?: string,
  ctx?: string,
) {
  const r = await req(path, token, body, selected, undefined, ctx);
  expect(r.status, JSON.stringify(r.data)).toBe(200);
  return r.data;
}
const native = (action: string, body?: any) =>
  ok("/admin/didar/" + action, admin, body);
beforeAll(async () => {
  if (!disposableQA) throw Error("Disposable loopback QA required");
  admin = (
    await ok("/auth/user/emailpass", "", {
      email: "native-admin@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const proof = (
    await finOK("login", {
      email: "admin@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  await ok("/admin/didar/connect", admin, { didar_token: proof });
  f = await financeFixture("MIXED", proof);
  const reg = await req("/auth/member/emailpass/register", "", {
    email,
    password,
  });
  expect([200, 201]).toContain(reg.status);
  const created = await req("/vendor/sellers", reg.data.token, {
    name: "Policy managed store",
    email,
    member_email: email,
    currency_code: "irr",
  });
  expect(created.status, JSON.stringify(created.data)).toBe(201);
  seller = created.data.seller.id;
  vendor = (await ok("/auth/member/emailpass", "", { email, password })).token;
  actor = (await db.query("SELECT id FROM member WHERE email=$1", [email]))
    .rows[0].id;
  await ok("/admin/sellers/" + seller + "/approve", admin, {});
  await native("seller-links", { seller_id: seller, supplier_id: f.sid });
}, 60000);
afterAll(async () => {
  if (f) {
    await db.query("UPDATE didar_supplier SET active=false WHERE id=$1", [
      f.sid,
    ]);
  }
  if (disposableQA)
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id IN ('demo-admin','native-staff-canonical')",
    );
});
test("C01 managed native Admin launch: real scoped UID purchase with no owner bridge and true actor audit", async () => {
  const handle = "managed-" + crypto.randomUUID().slice(0, 12);
  await native("storefront", {
    kind: "save",
    supplier_id: f.sid,
    handle,
    name: "ویترین مدیریت دیدار",
    visibility: "UNLISTED_LINK",
    published: true,
    approved: true,
  });
  const batch = (
    await native("intake", {
      operation: "create",
      supplier_id: f.sid,
      invoice_number: crypto.randomUUID(),
      reference_purity: 750,
    })
  ).id;
  const line = (
    await native("intake", {
      operation: "line",
      batch_id: batch,
      product_id: f.pid,
      description: "managed exact units",
      quantity: 3,
      total_weight_mg: 300000,
      purity: 750,
      making_mode: "percent",
      making_bps: 1200,
    })
  ).id;
  for (let i = 0; i < 3; i++)
    await native("intake", {
      operation: "item",
      batch_id: batch,
      line_id: line,
      weight_mg: 100000,
    });
  await native("intake", { operation: "verify", batch_id: batch });
  await native("intake", { operation: "post", batch_id: batch });
  offer = (
    await db.query(
      "SELECT * FROM didar_offer WHERE supplier_id=$1 AND product_id=$2",
      [f.sid, f.pid],
    )
  ).rows[0];
  await native("sharing", {
    supplier_id: f.sid,
    title: "فروش مدیریت‌شده",
    intro: "آزمایش",
    kind: "save",
    page_kind: "PRODUCT",
    published: true,
    product_ids: [f.pid],
  });
  expect(
    (
      await db.query("SELECT 1 FROM didar_native_actor WHERE actor_id=$1", [
        actor,
      ])
    ).rowCount,
  ).toBe(0);
  context = (await ok("/didar/storefront", "", { kind: "enter", handle }))
    .context_token;
  const catalog = await ok(
    "/didar/catalog",
    f.buyer,
    undefined,
    undefined,
    context,
  );
  const chosen = catalog.products.find((p: any) => p.id === f.pid).offers[0];
  const quote = await ok(
    "/didar/quote",
    f.buyer,
    { payment_method: "CASH", lines: [{ offer_id: chosen.id, quantity: 1 }] },
    undefined,
    context,
  );
  expect(JSON.stringify(quote)).toContain(chosen.id);
  paid = (
    await ok(
      "/didar/checkout",
      f.buyer,
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: catalog.rate.version,
        payment_method: "CASH",
        address: {
          name: "QA",
          phone: "09123456789",
          city: "تهران",
          address: "نشانی آزمایشی",
          postal_code: "1234567890",
        },
        lines: [{ offer_id: chosen.id, version: chosen.version, quantity: 1 }],
      },
      undefined,
      context,
    )
  ).order;
  await ok(
    "/didar/payment",
    f.buyer,
    { order_id: paid.id, outcome: "success" },
    undefined,
    context,
  );
  const saved = (
    await db.query("SELECT * FROM didar_order WHERE id=$1", [paid.id])
  ).rows[0];
  expect(saved.origin_supplier_id).toBe(f.sid);
  expect(saved.storefront_snapshot.handle).toBe(handle);
  expect(
    (
      await db.query(
        "SELECT count(*)::int n FROM didar_item_reservation r JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1 AND r.status='sold'",
        [paid.id],
      )
    ).rows[0].n,
  ).toBe(1);
  const audit = (
    await db.query(
      "SELECT actor_id,details FROM didar_audit WHERE action='storefront_save' AND details->>'supplier_id'=$1 ORDER BY id DESC LIMIT 1",
      [f.sid],
    )
  ).rows[0];
  expect(audit.actor_id).toBe("demo-admin");
  expect(audit.details.target_merchant_id).toBe(f.sid);
  expect(audit.details.on_behalf).toBe(true);
});
test("C02 native owner without bridge has safe selection/status but no generic commerce rights", async () => {
  expect((await req("/vendor/sellers", vendor)).status).toBe(200);
  expect(
    (await req("/vendor/sellers/select", vendor, { seller_id: seller })).status,
  ).toBe(200);
  const rights = (
    await ok(
      "/vendor/members/me?fields=+permissions",
      vendor,
      undefined,
      seller,
    )
  ).seller_member.permissions;
  expect(rights).toEqual({ store: "view" });
  for (const path of [
    "/vendor/products",
    "/vendor/offers",
    "/vendor/orders",
    "/vendor/payments",
    "/vendor/customers",
    "/vendor/payout-accounts",
  ])
    expect((await req(path, vendor, undefined, seller)).status, path).toBe(403);
  for (const path of [
    "/vendor/products",
    "/vendor/offers",
    "/vendor/orders/fake/cancel",
    "/vendor/payments/fake/capture",
    "/vendor/sellers/" + seller + "/payment-details",
  ])
    expect([403, 409]).toContain((await req(path, vendor, {}, seller)).status);
  expect(
    (await req("/vendor/offers/fake", vendor, undefined, seller, "DELETE"))
      .status,
  ).toBe(403);
});
test("C03 approved linked supplier is read-only for generic commerce; explicit gold grant cannot enable second native writer", async () => {
  await ok("/vendor/didar/connect", vendor, { didar_token: f.seller }, seller);
  const rights = (
    await ok(
      "/vendor/members/me?fields=+permissions",
      vendor,
      undefined,
      seller,
    )
  ).seller_member.permissions;
  expect(rights.products).toBe("view");
  expect(rights.offers).toBe("view");
  expect(rights.payments).toBeUndefined();
  expect(rights.payout_accounts).toBeUndefined();
  for (const path of ["/vendor/products", "/vendor/offers", "/vendor/orders"])
    expect((await req(path, vendor, undefined, seller)).status, path).toBe(200);
  expect(
    (await req("/vendor/payments", vendor, undefined, seller)).status,
  ).toBe(403);
  for (const path of ["/vendor/didar/manage", "/didar/manage"])
    expect(
      (
        await req(
          path,
          path.startsWith("/vendor") ? vendor : f.seller,
          {
            kind: "offer",
            id: offer.id,
            version: (
              await db.query("SELECT version FROM didar_offer WHERE id=$1", [
                offer.id,
              ])
            ).rows[0].version,
            quantity: 50,
          },
          path.startsWith("/vendor") ? seller : undefined,
        )
      ).status,
      path,
    ).toBe(403);
  await native("permissions", {
    supplier_id: f.sid,
    permission: "EDIT_OWN_INVENTORY",
    granted: true,
  });
  const granted = (
    await ok(
      "/vendor/members/me?fields=+permissions",
      vendor,
      undefined,
      seller,
    )
  ).seller_member.permissions;
  expect(granted["didar.catalog"]).toBe("edit");
  expect(granted["didar.inventory"]).toBe("edit");
  expect(granted.offers).toBe("view");
  expect(
    (await req("/vendor/offers/" + offer.id, vendor, { quantity: 10 }, seller))
      .status,
  ).toBe(403);
  await native("permissions", {
    supplier_id: f.sid,
    permission: "EDIT_OWN_INVENTORY",
    granted: false,
  });
});
test("C03 generic native catalog hides rival private masters in list/count/detail/variant/preview while owner keeps read", async () => {
  const nid = (
    await db.query("SELECT native_id FROM didar_product WHERE id=$1", [f.pid])
  ).rows[0].native_id;
  expect(nid).toBeTruthy();
  expect(
    (await req("/vendor/products/" + nid, vendor, undefined, seller)).status,
  ).toBe(200);
  const own = await ok(
    "/vendor/products?id=" + encodeURIComponent(nid) + "&limit=1",
    vendor,
    undefined,
    seller,
  );
  expect(own.products.map((p: any) => p.id)).toEqual([nid]);
  expect(own.count).toBe(1);
  const rival = (
    await ok("/auth/member/emailpass", "", {
      email: "native-supplier@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const proof = (
    await ok("/didar/login", "", {
      email: "supplier@didar.test",
      password: "DidarDemo2026!",
    })
  ).token;
  const other = (
    await db.query(
      "SELECT seller_id FROM didar_native_seller WHERE supplier_id='s1'",
    )
  ).rows[0].seller_id;
  await ok("/vendor/didar/connect", rival, { didar_token: proof }, other);
  try {
    const forbidden = await ok(
      "/vendor/products?id=" + encodeURIComponent(nid) + "&limit=1",
      rival,
      undefined,
      other,
    );
    expect(forbidden.products).toEqual([]);
    expect(forbidden.count).toBe(0);
    expect(forbidden.limit).toBe(1);
    for (const suffix of ["", "/variants", "/preview"])
      expect(
        (await req("/vendor/products/" + nid + suffix, rival, undefined, other))
          .status,
      ).toBe(404);
  } finally {
    await db.query(
      "DELETE FROM didar_native_actor WHERE user_id='demo-supplier'",
    );
  }
});
test("C03 explicit intake grant works through native and legacy canonical workflows and revokes immediately", async () => {
  await native("permissions", {
    supplier_id: f.sid,
    permission: "CREATE_OWN_INTAKE",
    granted: true,
  });
  for (const [path, token, scope] of [
    ["/vendor/didar/intake", vendor, seller],
    ["/didar/intake", f.seller, undefined],
  ]) {
    const created = await ok(
      path,
      token,
      {
        operation: "create",
        supplier_id: f.sid,
        invoice_number: crypto.randomUUID(),
        reference_purity: 750,
      },
      scope,
    );
    expect(created.id).toBeTruthy();
  }
  await native("permissions", {
    supplier_id: f.sid,
    permission: "CREATE_OWN_INTAKE",
    granted: false,
  });
  for (const [path, token, scope] of [
    ["/vendor/didar/intake", vendor, seller],
    ["/didar/intake", f.seller, undefined],
  ])
    expect(
      (
        await req(
          path,
          token,
          {
            operation: "create",
            supplier_id: f.sid,
            invoice_number: crypto.randomUUID(),
            reference_purity: 750,
          },
          scope,
        )
      ).status,
    ).toBe(403);
});
test("C04 managed to assisted to delegated publishing keeps identical store/offer/UID/order records", async () => {
  const staff = (
    await db.query(
      "SELECT sm.member_id,sm.role_id FROM seller_member sm JOIN member m ON m.id=sm.member_id WHERE m.email='native-staff@didar.test' AND sm.deleted_at IS NULL LIMIT 1",
    )
  ).rows[0];
  const added = await req("/admin/sellers/" + seller + "/members", admin, {
    member_id: staff.member_id,
    role_id: staff.role_id,
  });
  expect(added.status, JSON.stringify(added.data)).toBe(201);
  const nativeStaff = (
    await ok("/auth/member/emailpass", "", {
      email: "native-staff@didar.test",
      password: "DidarNative2026!",
    })
  ).token;
  const legacy = (
    await ok("/didar/login", "", {
      email: "native-staff-didar@didar.test",
      password: "DidarStaff2026!",
    })
  ).token;
  const before = await fingerprint();
  const identity = (
    await db.query(
      "SELECT supplier_id,handle FROM didar_storefront WHERE supplier_id=$1",
      [f.sid],
    )
  ).rows[0];
  await native("storefront", {
    kind: "member",
    supplier_id: f.sid,
    email: "native-staff-didar@didar.test",
    permission: "CONTENT_EDIT",
    active: true,
  });
  await ok(
    "/vendor/didar/connect",
    nativeStaff,
    { didar_token: legacy },
    seller,
  );
  const draft = await ok(
    "/vendor/didar/pages",
    nativeStaff,
    {
      operation: "draft",
      supplier_id: f.sid,
      kind: "MERCHANT_HOME",
      title: "واگذاری مرحله‌ای",
      blocks: [{ type: "BRAND_STORY", title: "داستان", body: "معرفی فروشگاه" }],
    },
    seller,
  );
  expect(
    (
      await req(
        "/vendor/didar/sharing",
        nativeStaff,
        { kind: "save", supplier_id: f.sid },
        seller,
      )
    ).status,
  ).toBe(403);
  for (const permission of ["SHARE", "CONTENT_PUBLISH"])
    await native("storefront", {
      kind: "member",
      supplier_id: f.sid,
      email: "native-staff-didar@didar.test",
      permission,
      active: true,
    });
  const share = await ok(
    "/vendor/didar/sharing",
    nativeStaff,
    {
      kind: "save",
      supplier_id: f.sid,
      page_kind: "PRODUCT",
      title: "گزیده واگذارشده",
      product_ids: [f.pid],
      published: true,
    },
    seller,
  );
  await native("pages", {
    operation: "review",
    page_id: draft.page_id,
    version_id: draft.version_id,
    approved: true,
    reason: "Central review of delegated draft",
  });
  await ok(
    "/vendor/didar/pages",
    nativeStaff,
    {
      operation: "publish",
      page_id: draft.page_id,
      version_id: draft.version_id,
      reason: "Delegated publishing",
      idempotency_key: crypto.randomUUID(),
    },
    seller,
  );
  expect(share.id).toBeTruthy();
  expect(
    (
      await db.query(
        "SELECT supplier_id,handle FROM didar_storefront WHERE supplier_id=$1",
        [f.sid],
      )
    ).rows[0],
  ).toEqual(identity);
  expect(await fingerprint()).toBe(before);
  await native("storefront", {
    kind: "member",
    supplier_id: f.sid,
    email: "native-staff-didar@didar.test",
    permission: "SHARE",
    active: false,
  });
  for (const [path, token, scope] of [
    ["/vendor/didar/sharing", nativeStaff, seller],
    ["/didar/sharing", legacy, undefined],
  ])
    expect(
      (await req(path, token, { kind: "save", supplier_id: f.sid }, scope))
        .status,
    ).toBe(403);
  expect(
    (
      await ok("/didar/catalog", f.buyer, undefined, undefined, context)
    ).products.some((p: any) => p.id === f.pid),
  ).toBe(true);
});
test("C06 native ACL is surface scoped; disabling editor does not suspend managed public commerce", async () => {
  await native("access-links", {
    operation: "policy",
    actor_type: "member",
    actor_id: actor,
    preset: "READ_ONLY",
    reason: "Policy C06",
  });
  expect(
    (
      await req(
        "/vendor/didar/storefront",
        vendor,
        { kind: "save", supplier_id: f.sid },
        seller,
      )
    ).status,
  ).toBe(403);
  expect((await req("/didar/storefront", f.seller)).status).toBe(200);
  await native("access-links", {
    operation: "policy",
    actor_type: "member",
    actor_id: actor,
    preset: "DISABLED",
    reason: "Policy C06 disabled",
  });
  expect(
    (await req("/vendor/didar/history", vendor, undefined, seller)).status,
  ).toBe(403);
  const catalog = await ok(
    "/didar/catalog",
    f.buyer,
    undefined,
    undefined,
    context,
  );
  expect(
    catalog.products.find((p: any) => p.id === f.pid).offers.length,
  ).toBeGreaterThan(0);
  await ok(
    "/didar/quote",
    f.buyer,
    { lines: [{ offer_id: offer.id, quantity: 1 }] },
    undefined,
    context,
  );
  const available = catalog.products.find((p: any) => p.id === f.pid).offers[0];
  const receipt = (
    await ok(
      "/didar/checkout",
      f.buyer,
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: catalog.rate.version,
        lines: [
          { offer_id: available.id, version: available.version, quantity: 1 },
        ],
        address: {
          name: "QA",
          phone: "09123456789",
          city: "تهران",
          address: "نشانی آزمایشی",
          postal_code: "1234567890",
        },
      },
      undefined,
      context,
    )
  ).order;
  await ok(
    "/didar/payment",
    f.buyer,
    { order_id: receipt.id, outcome: "success" },
    undefined,
    context,
  );
  expect(
    (
      await db.query(
        "SELECT origin_supplier_id,status FROM didar_order WHERE id=$1",
        [receipt.id],
      )
    ).rows[0],
  ).toEqual({ origin_supplier_id: f.sid, status: "paid" });
  await native("access-links", {
    operation: "policy",
    actor_type: "member",
    actor_id: actor,
    preset: "DEFAULT",
    reason: "Policy restore",
  });
});
async function fingerprint() {
  return (
    await db.query(
      `SELECT md5(jsonb_build_object('order',(SELECT to_jsonb(o) FROM didar_order o WHERE id=$1),'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM didar_order_line l WHERE order_id=$1),'items',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM didar_item_reservation r JOIN didar_order_line l ON l.id=r.order_line_id WHERE l.order_id=$1),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM didar_fin_event e WHERE e.order_line_id IN (SELECT id FROM didar_order_line WHERE order_id=$1)),'postings',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM didar_fin_posting p))::text) hash`,
      [paid.id],
    )
  ).rows[0].hash;
}
test("C07 suspension/state matrix: generic + native DIDAR + legacy denies, own history stays read-only and immutable", async () => {
  const catalog = await ok(
    "/didar/catalog",
    f.buyer,
    undefined,
    undefined,
    context,
  );
  const available = catalog.products.find((p: any) => p.id === f.pid).offers[0];
  const pending = (
    await ok(
      "/didar/checkout",
      f.buyer,
      {
        idempotency_key: crypto.randomUUID(),
        rate_version: catalog.rate.version,
        lines: [
          { offer_id: available.id, version: available.version, quantity: 1 },
        ],
        address: {
          name: "QA",
          phone: "09123456789",
          city: "تهران",
          address: "نشانی آزمایشی",
          postal_code: "1234567890",
        },
      },
      undefined,
      context,
    )
  ).order;
  const before = await fingerprint();
  const assertSuspended = async () => {
    const ownStatus = await ok("/didar/manage", f.seller);
    expect(ownStatus.status_only).toBe(true);
    expect(ownStatus.products).toEqual([]);
    expect(ownStatus.suppliers.map((s: any) => s.id)).toEqual([f.sid]);
    const customerHistory = await ok("/didar/orders", f.buyer);
    expect(customerHistory.orders.some((o: any) => o.id === paid.id)).toBe(
      true,
    );
    for (const path of [
      "/vendor/products",
      "/vendor/offers",
      "/vendor/orders",
      "/vendor/payments",
    ])
      expect((await req(path, vendor, undefined, seller)).status, path).toBe(
        403,
      );
    for (const path of [
      "/vendor/didar/manage",
      "/vendor/didar/finance",
      "/vendor/didar/inventory",
    ])
      expect((await req(path, vendor, {}, seller)).status, path).toBe(403);
    expect(
      (
        await req("/didar/storefront", f.seller, {
          kind: "save",
          supplier_id: f.sid,
        })
      ).status,
    ).toBe(403);
    expect(
      (await req("/didar/manage", f.seller, { kind: "offer", id: offer.id }))
        .status,
    ).toBe(403);
    expect(
      (
        await req(
          "/didar/quote",
          f.buyer,
          { lines: [{ offer_id: offer.id, quantity: 1 }] },
          undefined,
          undefined,
          context,
        )
      ).status,
    ).not.toBe(200);
    expect(
      (
        await req("/didar/payment", f.buyer, {
          order_id: pending.id,
          outcome: "success",
        })
      ).status,
    ).toBe(409);
    for (const [path, t, selected] of [
      ["/vendor/didar/history", vendor, seller],
      ["/didar/history", f.seller, undefined],
    ]) {
      const h = await ok(path, t, undefined, selected);
      expect(h.read_only).toBe(true);
      expect(h.orders.some((o: any) => o.id === paid.id)).toBe(true);
      expect(h.orders.every((o: any) => !o.address && !o.customer_id)).toBe(
        true,
      );
      expect(
        (await req(path, t, { operation: "settle" }, selected)).status,
      ).toBe(403);
    }
  };
  for (const state of ["pending", "rejected", "approved"]) {
    await db.query(
      "UPDATE didar_supplier SET status=$2,active=$3 WHERE id=$1",
      [f.sid, state, state !== "approved"],
    );
    await assertSuspended();
  }
  await db.query(
    "UPDATE didar_supplier SET active=true,status='approved' WHERE id=$1",
    [f.sid],
  );
  await ok("/admin/sellers/" + seller + "/suspend", admin, {
    reason: "Policy matrix",
  });
  await assertSuspended();
  await ok("/admin/sellers/" + seller + "/unsuspend", admin, {});
  for (const status of ["pending_approval", "terminated"]) {
    await db.query("UPDATE seller SET status=$2 WHERE id=$1", [seller, status]);
    await assertSuspended();
  }
  await db.query("UPDATE seller SET status='open' WHERE id=$1", [seller]);
  await db.query("UPDATE seller SET deleted_at=now() WHERE id=$1", [seller]);
  try {
    expect(
      (await req("/vendor/didar/history", vendor, undefined, seller)).status,
    ).toBe(403);
    expect(
      (await req("/vendor/offers", vendor, undefined, seller)).status,
    ).toBe(403);
    expect((await req("/didar/manage", f.seller, {})).status).toBe(403);
    expect((await ok("/didar/history", f.seller)).read_only).toBe(true);
  } finally {
    await db.query("UPDATE seller SET deleted_at=NULL WHERE id=$1", [seller]);
  }
  expect(
    (await db.query("SELECT status FROM didar_order WHERE id=$1", [pending.id]))
      .rows[0].status,
  ).toBe("pending");
  expect(await fingerprint()).toBe(before);
  const counts = await db.query(
    "SELECT count(*)::int n FROM didar_native_actor WHERE actor_id=$1",
    [actor],
  );
  expect(counts.rows[0].n).toBe(1);
}, 60000);
test("C08 native and legacy staff grant revocation on identical merchant records; no role promotion", async () => {
  const staff = await finOK("register", {
    email: "policy-staff-" + crypto.randomUUID() + "@didar.test",
    password: "PolicyStaff2026!",
    name: "Policy staff",
  });
  for (const permission of ["STOREFRONT", "SHARE", "CONTENT_EDIT"])
    await native("storefront", {
      kind: "member",
      supplier_id: f.sid,
      email: staff.user.email,
      permission,
      active: true,
    });
  const old = (await ok("/didar/storefront", staff.token)).stores.find(
    (s: any) => s.supplier_id === f.sid,
  );
  await ok("/didar/storefront", staff.token, {
    kind: "save",
    supplier_id: f.sid,
    handle: old.handle,
    name: "همکار",
    visibility: old.visibility,
    published: true,
    version: old.version,
  });
  await native("storefront", {
    kind: "member",
    supplier_id: f.sid,
    email: staff.user.email,
    permission: "STOREFRONT",
    active: false,
  });
  expect(
    (
      await req("/didar/storefront", staff.token, {
        kind: "save",
        supplier_id: f.sid,
      })
    ).status,
  ).toBe(403);
  expect(
    (await db.query("SELECT role FROM didar_user WHERE id=$1", [staff.user.id]))
      .rows[0].role,
  ).toBe("customer");
  expect(
    (
      await db.query(
        "SELECT supplier_id,handle FROM didar_storefront WHERE supplier_id=$1",
        [f.sid],
      )
    ).rows[0].handle,
  ).toBe(old.handle);
});
