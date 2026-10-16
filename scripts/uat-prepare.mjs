import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { localURL } from "../scripts/local/runtime.mjs";
const origin = localURL(
  process.env.DIDAR_UAT_API_URL || "http://127.0.0.1:9000",
  ["http:"],
  "UAT API",
).origin;
const file = ".local/financial-uat.json",
  password = "DidarUATFinancial2026!";
let token = "";
async function api(action, body, session = token) {
  const r = await fetch(origin + "/didar/" + action, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + session,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error("UAT preparation " + action + ": " + data.message);
  return data;
}
try {
  token = (
    await api(
      "login",
      { email: "admin@didar.test", password: "DidarDemo2026!" },
      "",
    )
  ).token;
  const guard = await api("finance");
  if (guard.mode !== "SANDBOX_MANUAL")
    throw new Error("Refusing non-sandbox API");
  if (existsSync(file)) {
    const old = JSON.parse(readFileSync(file, "utf8"));
    if (old.origin !== origin)
      throw new Error(
        "Existing UAT manifest belongs to another API; preserve it and select the original local API",
      );
    await api("intake?id=" + old.batch_id);
    console.log(
      "Existing synthetic UAT retained; no business rows changed. Manifest: " +
        file,
    );
    console.log(
      "Supplier: " + old.supplier_email + " / Customer: " + old.customer_email,
    );
    console.log("Demo-only password: " + password);
    process.exit(0);
  }
  const tag = "DIDAR-UAT-" + randomUUID().slice(0, 8).toUpperCase(),
    supplier_email = tag.toLowerCase() + "-supplier@didar.test",
    customer_email = tag.toLowerCase() + "-customer@didar.test";
  const supplier = (
    await api("manage", {
      kind: "supplier",
      name: "تأمین آزمایشی مالی " + tag,
      email: supplier_email,
      password,
    })
  ).id;
  await api(
    "register",
    { email: customer_email, password, name: "مشتری آزمایشی مالی " + tag },
    "",
  );
  const contract = (
    await api("finance", {
      operation: "contract_request",
      supplier_id: supplier,
      mode: "MIXED",
      gold_bps: 5000,
      ownership: "CONSIGNMENT",
      effective_at: "2026-01-01T00:00:00Z",
      due_days: 7,
      reason: "قرارداد ترکیبی آزمایشی برای پذیرش یکپارچه",
    })
  ).id;
  await api("finance", {
    operation: "contract_review",
    contract_id: contract,
    approved: true,
    reason: "فقط QA؛ بدون معامله واقعی",
  });
  const makeProduct = async (title) =>
    (
      await api("manage", {
        kind: "product",
        title,
        category: "پذیرش مالی آزمایشی",
        description: "فقط داده ساختگی UAT؛ فروش واقعی ممنوع",
        purity: 750,
        published: false,
      })
    ).id;
  const grouped = await makeProduct(tag + " — قطعات پذیرش"),
    example = await makeProduct(tag + " — نمونه ۱۰۰ گرم");
  const batch = (
    await api("intake", {
      operation: "create",
      supplier_id: supplier,
      invoice_number: tag,
      reference_purity: 750,
      tahesab_reference: "QA-AGGREGATE-" + tag,
      notes:
        "Synthetic separately specified QA weights; no historical stock altered",
    })
  ).id;
  const weights = [
    [25000, 26000, 27000, 28000, 29000],
    [63000, 64000],
    [
      9000, 9100, 9200, 9300, 9400, 9500, 10000, 10100, 10200, 10300, 10400,
      10500,
    ],
    [100000],
  ];
  let n = 0;
  for (let index = 0; index < weights.length; index++) {
    const list = weights[index],
      line = (
        await api("intake", {
          operation: "line",
          batch_id: batch,
          product_id: index === 3 ? example : grouped,
          description: "QA measured specification " + (index + 1),
          quantity: list.length,
          total_weight_mg: list.reduce((a, b) => a + b, 0),
          purity: 750,
          making_mode: "percent",
          making_bps: 1200,
        })
      ).id;
    for (const weight of list)
      await api("intake", {
        operation: "item",
        batch_id: batch,
        line_id: line,
        weight_mg: weight,
        uid: tag + "-" + String(++n).padStart(2, "0"),
      });
  }
  const detail = await api("intake?id=" + batch),
    prefix =
      "E2" +
      createHash("sha256").update(tag).digest("hex").slice(0, 20).toUpperCase();
  for (const [index, item] of detail.items.entries())
    await api("rfid", {
      operation: "pair",
      item_id: item.id,
      epc: prefix + index.toString(16).padStart(2, "0").toUpperCase(),
      reason: "Synthetic mock RFID tag; hardware unverified",
    });
  await api("intake", { operation: "verify", batch_id: batch });
  await api("intake", { operation: "post", batch_id: batch });
  await api("tahesab", {
    operation: "mapping",
    supplier_id: supplier,
    merchant_code: "QA_" + tag,
    gold_code: "QA_GOLD",
    rial_code: "QA_RIAL",
    invoice_reference: tag,
    db_alias: "QA_DIDAR",
    reason: "Mock-only UAT mapping; real API BLOCKED_BY_SPEC",
  });
  const saved = await api("intake?id=" + batch);
  mkdirSync(".local", { recursive: true, mode: 0o700 });
  writeFileSync(
    file,
    JSON.stringify(
      {
        version: 1,
        origin,
        scenario: tag,
        supplier_id: supplier,
        supplier_email,
        customer_email,
        contract_id: contract,
        batch_id: batch,
        grouped_product: grouped,
        example_product: example,
        items: saved.items.map((i) => ({
          id: i.id,
          uid: i.uid,
          weight_mg: i.weight_mg,
          offer_id: i.offer_id,
        })),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Synthetic UAT prepared; existing products/UIDs/orders untouched. Manifest: " +
      file,
  );
  console.log(
    "Products are unpublished; publish them through admin UI for the UAT. Batch: " +
      batch,
  );
  console.log(
    "Supplier: " +
      supplier_email +
      " / Customer: " +
      customer_email +
      " / Demo-only password: " +
      password,
  );
  console.log(
    "No payment, procurement execution or settlement was performed. MAC_UAT_PENDING / REAL_RFID_PENDING / BLOCKED_BY_SPEC",
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
