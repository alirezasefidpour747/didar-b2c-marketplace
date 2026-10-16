import { seedFacetVocabulary } from "../didar/facet-seed";
import { projectExisting } from "../didar/finance-ledger";
import { transaction } from "../didar/db";
import type { ExecArgs } from "@medusajs/framework/types";
import { createProductsWorkflow } from "@mercurjs/core/workflows";
import { db } from "../didar/db";
import { hashPassword } from "../didar/auth";
import fs from "node:fs";
import path from "node:path";
export default async function seed({ container }: ExecArgs) {
  await db.query(
    fs.readFileSync(path.join(process.cwd(), "src/didar/schema.sql"), "utf8"),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/commerce-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    "INSERT INTO didar_rate(id,rate_irr,tax_bps) VALUES(1,65000000,1000) ON CONFLICT DO NOTHING",
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/phase1-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/finance-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/finance-procurement-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/finance-ledger-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/tahesab-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/finance-uat-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/taxonomy-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/facets-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/merchant-pricing-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/storefront-schema.sql"),
      "utf8",
    ),
  );
  await db.query(
    fs.readFileSync(
      path.join(process.cwd(), "src/didar/share-schema.sql"),
      "utf8",
    ),
  );
  await transaction(seedFacetVocabulary);
  await transaction(projectExisting);
  const seedDemo =
    process.env.DIDAR_SEED_DEMO === "true" &&
    process.env.DIDAR_ENVIRONMENT === "local" &&
    process.env.NODE_ENV !== "production";
  if (!seedDemo) {
    console.log(
      "Didar additive migrations applied; existing catalog preserved, demo seed disabled.",
    );
    await db.end();
    return;
  }
  for (const [id, name] of [
    ["s1", "زرین دیدار"],
    ["s2", "گالری آفتاب"],
  ])
    await db.query(
      "INSERT INTO didar_supplier(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, name],
    );
  const items = [
    ["ring", "انگشتر طلای ماه", "انگشتر", 2350],
    ["necklace", "گردنبند آفتاب", "گردنبند", 4125],
    ["bracelet", "دستبند زنجیری دیدار", "دستبند", 6750],
    ["earring", "گوشواره شکوفه", "گوشواره", 1875],
  ] as const;
  await db.query(
    "INSERT INTO didar_category(id,name,slug,code,kind) VALUES('jewelry','زیورآلات','jewelry','demo.jewelry','family') ON CONFLICT DO NOTHING",
  );
  await db.query(
    "INSERT INTO didar_collection(id,name,slug,code,type_id,active,published,approved) VALUES('everyday','انتخاب روزمره','everyday','demo.everyday','collection_type.editorial',true,true,true) ON CONFLICT DO NOTHING",
  );
  await db.query(
    "INSERT INTO didar_catalog_translation(id,entity_type,entity_id,locale,label,status,source_ref) VALUES('demo:collection:everyday:fa','collection','everyday','fa','انتخاب روزمره','approved','spec:local-demo') ON CONFLICT DO NOTHING",
  );
  for (const [id, title, category, weight] of items) {
    // Explicit local demo vocabulary only. Never reparent or re-key existing categories.
    await db.query(
      "INSERT INTO didar_category(id,name,slug,parent_id,code,kind) VALUES($1,$2,$1,'jewelry',$3,'category') ON CONFLICT DO NOTHING",
      [id + "s", category, "demo." + id + "s"],
    );
    await db.query(
      "INSERT INTO didar_category(id,name,slug,parent_id,code,kind) VALUES($1,$2,$1,$3,$4,'subcategory') ON CONFLICT DO NOTHING",
      [id, category + " نمونه", id + "s", "demo." + id],
    );
    let {
      rows: [p],
    } = await db.query("SELECT * FROM didar_product WHERE id=$1", [id]);
    if (!p) {
      const {
        rows: [classification],
      } = await db.query("SELECT didar_taxonomy_valid($1) valid", [id]);
      const { result } = await createProductsWorkflow(container).run({
        input: {
          created_by: "didar-seed",
          products: [
            {
              title,
              handle: `didar-${id}`,
              status: classification.valid ? "published" : "draft",
              variants: [{ title: "Standard" }],
              metadata: { didar: true, purity: 750 },
            },
          ],
        },
      });
      await db.query(
        "INSERT INTO didar_product(id,title,category,description,purity,native_id,category_id,published,slug) VALUES($1,$2,$3,$4,750,$5,$1,$6,$1)",
        [
          id,
          title,
          category,
          "طلای ۱۸ عیار با وزن دقیق، فاکتور شفاف و انتخاب تأمین‌کننده.",
          result[0].id,
          classification.valid,
        ],
      );
    }
    await db.query(
      "INSERT INTO didar_collection_product VALUES('everyday',$1) ON CONFLICT DO NOTHING",
      [id],
    );
    for (const [i, s] of ["s1", "s2"].entries())
      await db.query(
        "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps) VALUES($1,$2,$3,$4,10,$5,$6) ON CONFLICT DO NOTHING",
        [`${id}-${s}`, id, s, weight, 1500000 + i * 250000, 700 - i * 100],
      );
  }
  // Demo accounts are opt-in and cannot be seeded accidentally in production.
  if (
    process.env.DIDAR_SEED_DEMO === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.DIDAR_ENVIRONMENT === "local"
  ) {
    for (const [id, email, name, role, supplier] of [
      ["demo-customer", "customer@didar.test", "مشتری نمونه", "customer", null],
      ["demo-admin", "admin@didar.test", "مدیر دیدار", "admin", null],
      [
        "demo-supplier",
        "supplier@didar.test",
        "تأمین‌کننده نمونه",
        "supplier",
        "s1",
      ],
    ]) {
      await db.query(
        "INSERT INTO didar_user(id,email,name,password,role,supplier_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [id, email, name, hashPassword("DidarDemo2026!"), role, supplier],
      );
    }
  }
  console.log("Didar schema and shared gold catalog seeded (idempotent).");
  await db.end();
}
