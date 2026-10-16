import { productPath } from "./taxonomy";
import { randomUUID } from "node:crypto";
import { db, transaction } from "./db";
import { integer, price, withPolicy } from "./pricing";
import { hashPassword, demoAccountAllowed } from "./auth";
import { authorize, permissions } from "./permissions";
const text = (value: unknown, max = 250) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("INVALID_TEXT");
  return value.trim();
};
const optional = (value: unknown, max = 2000) =>
  value === undefined || value === null || value === "" ? "" : text(value, max);
const bool = (value: unknown, fallback: boolean) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("INVALID_BOOLEAN");
  return value;
};
const audit = (c: any, actor: string, action: string, details: any) =>
  c.query("INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)", [
    actor,
    action,
    JSON.stringify(details),
  ]);
const slug = (value: unknown) => {
  const s = text(value, 100);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) throw new Error("INVALID_SLUG");
  return s;
};
export async function catalog(user?: any) {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const {
      rows: [rate],
    } = await c.query("SELECT * FROM didar_rate WHERE id=1");
    const pricingRate = await withPolicy(c, rate);
    const stale =
      Date.now() - new Date(rate.updated_at).getTime() > 24 * 60 * 60 * 1000;
    const quote_expires_at = new Date(
      new Date(rate.updated_at).getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();
    const { rows: products } = await c.query(
      `SELECT p.* FROM didar_product p WHERE $1='admin' OR (p.active AND p.published AND p.approved AND didar_taxonomy_valid(p.category_id)) OR ($1='supplier' AND (EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$2) OR EXISTS(SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=p.id AND b.supplier_id=$2))) ORDER BY p.id`,
      [user?.role || "public", user?.supplier_id || null],
    );
    const { rows: offers } = await c.query(
      `SELECT o.*,s.name supplier FROM didar_offer o JOIN didar_supplier s ON s.id=o.supplier_id WHERE ($1='admin' OR ($1='supplier' AND o.supplier_id=$2) OR ($1='public' AND o.active AND s.active AND s.status='approved')) ORDER BY o.id`,
      [user?.role || "public", user?.supplier_id || null],
    );
    const { rows: images } = await c.query(
      "SELECT id,product_id,alt,position FROM didar_product_image ORDER BY position,id",
    );
    const { rows: links } = await c.query(
      "SELECT * FROM didar_collection_product",
    );
    for (const p of products) {
      Object.assign(p, await productPath(c, p));
      p.images = images
        .filter((i: any) => i.product_id === p.id)
        .map((i: any) => ({
          ...i,
          url: `/api/didar/image?id=${encodeURIComponent(i.id)}`,
        }));
      p.collection_ids = links
        .filter((l: any) => l.product_id === p.id)
        .map((l: any) => l.collection_id);
      p.offers = offers
        .filter((o: any) => o.product_id === p.id)
        .map((o: any) => ({
          ...o,
          labor_irr: Number(o.labor_irr),
          price: stale
            ? null
            : price({
                ...pricingRate,
                ...o,
                labor_irr: Number(o.labor_irr),
                purity: p.purity,
                rate_irr: Number(rate.rate_irr),
                fee_irr: Number(rate.fee_irr ?? 0),
              }),
        }));
    }
    const { rows: categories } = await c.query(
      "SELECT * FROM didar_category ORDER BY name",
    );
    const { rows: collections } = await c.query(
      "SELECT c.*,coalesce(array_agg(cp.product_id) FILTER(WHERE cp.product_id IS NOT NULL),'{}') product_ids FROM didar_collection c LEFT JOIN didar_collection_product cp ON cp.collection_id=c.id GROUP BY c.id ORDER BY c.name",
    );
    for (const collection of collections)
      collection.product_ids = collection.product_ids.filter((id: string) =>
        products.some((p: any) => p.id === id),
      );
    return {
      products,
      quote_expires_at,
      price_available: !stale,
      rate_stale: stale,
      rate: {
        ...pricingRate,
        rate_irr: Number(rate.rate_irr),
        fee_irr: Number(rate.fee_irr ?? 0),
      },
      categories,
      collections,
    };
  });
}
function productInput(b: any, old: any = {}) {
  const p = { ...old, ...b };
  const min =
    p.min_weight_mg === null ||
    p.min_weight_mg === undefined ||
    p.min_weight_mg === ""
      ? null
      : integer(p.min_weight_mg, "WEIGHT_MIN", 1, 1000000);
  const max =
    p.max_weight_mg === null ||
    p.max_weight_mg === undefined ||
    p.max_weight_mg === ""
      ? null
      : integer(p.max_weight_mg, "WEIGHT_MAX", 1, 1000000);
  if (min && max && min > max) throw new Error("INVALID_WEIGHT_RANGE");
  return {
    title: text(p.title, 150),
    slug: slug(p.slug || "product"),
    category: optional(p.category, 100) || "بدون دسته",
    category_id: p.category_id ? text(p.category_id, 100) : null,
    description: optional(p.description, 5000),
    purity: integer(p.purity, "PURITY", 1, 1000),
    reference: optional(p.reference, 100),
    jewelry_type: optional(p.jewelry_type, 100),
    min_weight_mg: min,
    max_weight_mg: max,
    active: bool(p.active, true),
    published: bool(p.published, false),
    approved: bool(p.approved, true),
    attributes: p.attributes ?? {},
  };
}
async function saveProduct(req: any, u: any, b: any, c: any) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
    "didar:category-tree",
  ]);
  const id = b.id ? text(b.id) : randomUUID();
  const {
    rows: [old],
  } = await c.query("SELECT * FROM didar_product WHERE id=$1 FOR UPDATE", [id]);
  if (b.id && !old) throw new Error("NOT_FOUND");
  const p = productInput(b, old);
  if (
    typeof p.attributes !== "object" ||
    Array.isArray(p.attributes) ||
    JSON.stringify(p.attributes).length > 10000
  )
    throw new Error("INVALID_ATTRIBUTES");
  if (old && old.purity !== p.purity) {
    const { rowCount } = await c.query(
      "SELECT id FROM didar_inventory_item WHERE product_id=$1 LIMIT 1",
      [id],
    );
    if (rowCount) throw new Error("CONFLICT_PHYSICAL_PURITY");
  }
  let native = old?.native_id;
  if (p.category_id) {
    const {
      rows: [category],
    } = await c.query("SELECT * FROM didar_category WHERE id=$1", [
      p.category_id,
    ]);
    if (!category) throw new Error("INVALID_CATEGORY");
    p.category = category.name;
  }
  if (p.published) {
    const {
      rows: [classification],
    } = await c.query("SELECT didar_taxonomy_valid($1) valid", [p.category_id]);
    if (!classification.valid) throw new Error("INVALID_PUBLICATION_TAXONOMY");
  }
  if (b.collection_ids !== undefined) {
    if (!Array.isArray(b.collection_ids) || b.collection_ids.length > 50)
      throw new Error("INVALID_COLLECTIONS");
    for (const id of new Set(b.collection_ids)) {
      const { rowCount } = await c.query(
        "SELECT id FROM didar_collection WHERE id=$1",
        [text(id)],
      );
      if (!rowCount) throw new Error("INVALID_COLLECTION");
    }
  }
  const {
    rows: [outside],
  } = await c.query(
    "SELECT id FROM didar_offer WHERE product_id=$1 AND (($2::int IS NOT NULL AND weight_mg<$2) OR ($3::int IS NOT NULL AND weight_mg>$3)) LIMIT 1",
    [id, p.min_weight_mg, p.max_weight_mg],
  );
  if (outside) throw new Error("INVALID_EXISTING_OFFER_WEIGHT");
  const metadata = {
    didar: true,
    purity: p.purity,
    reference: p.reference,
    jewelry_type: p.jewelry_type,
    min_weight_mg: p.min_weight_mg,
    max_weight_mg: p.max_weight_mg,
  };
  const previousNative = native;
  try {
    if (native) {
      const { updateProductsWorkflow } =
        await import("@medusajs/medusa/core-flows");
      await updateProductsWorkflow(req.scope).run({
        input: {
          products: [
            {
              id: native,
              title: p.title,
              description: p.description,
              status:
                p.active && p.published && p.approved ? "published" : "draft",
              metadata,
            },
          ],
        },
      });
    } else {
      const { createProductsWorkflow } =
        await import("@mercurjs/core/workflows");
      const { result } = await createProductsWorkflow(req.scope).run({
        input: {
          created_by: u.id,
          products: [
            {
              title: p.title,
              description: p.description,
              handle: `didar-${id}`,
              status:
                p.active && p.published && p.approved ? "published" : "draft",
              variants: [{ title: "Standard" }],
              metadata,
            },
          ],
        },
      });
      native = result[0].id;
    }
    await c.query(
      `INSERT INTO didar_product(id,title,category,description,purity,native_id,active,category_id,reference,jewelry_type,min_weight_mg,max_weight_mg,published,approved,attributes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,category=EXCLUDED.category,description=EXCLUDED.description,purity=EXCLUDED.purity,native_id=EXCLUDED.native_id,active=EXCLUDED.active,category_id=EXCLUDED.category_id,reference=EXCLUDED.reference,jewelry_type=EXCLUDED.jewelry_type,min_weight_mg=EXCLUDED.min_weight_mg,max_weight_mg=EXCLUDED.max_weight_mg,published=EXCLUDED.published,approved=EXCLUDED.approved,attributes=EXCLUDED.attributes`,
      [
        id,
        p.title,
        p.category,
        p.description,
        p.purity,
        native,
        p.active,
        p.category_id,
        p.reference,
        p.jewelry_type,
        p.min_weight_mg,
        p.max_weight_mg,
        p.published,
        p.approved,
        JSON.stringify(p.attributes),
      ],
    );
    await c.query("UPDATE didar_product SET slug=$1 WHERE id=$2", [p.slug, id]);
    if (b.collection_ids !== undefined) {
      if (!Array.isArray(b.collection_ids) || b.collection_ids.length > 50)
        throw new Error("INVALID_COLLECTIONS");
      await c.query(
        "DELETE FROM didar_collection_product WHERE product_id=$1",
        [id],
      );
      for (const cid of new Set(b.collection_ids))
        await c.query("INSERT INTO didar_collection_product VALUES($1,$2)", [
          text(cid),
          id,
        ]);
    }
    if (old && old.purity !== p.purity) {
      await c.query(
        "SELECT id FROM didar_offer WHERE product_id=$1 ORDER BY id FOR UPDATE",
        [id],
      );
      await c.query(
        "UPDATE didar_offer SET version=version+1 WHERE product_id=$1",
        [id],
      );
    }
    await audit(c, u.id, old ? "product_updated" : "product_created", {
      id,
      ...p,
    });
    return { id };
  } catch (error) {
    // Native workflows use their own transaction. Compensate their mirror if the gold write fails.
    if (native) {
      try {
        if (previousNative) {
          const { updateProductsWorkflow } =
            await import("@medusajs/medusa/core-flows");
          await updateProductsWorkflow(req.scope).run({
            input: {
              products: [
                {
                  id: native,
                  title: old.title,
                  description: old.description,
                  status: old.active && old.published ? "published" : "draft",
                  metadata: {
                    didar: true,
                    purity: old.purity,
                    reference: old.reference,
                    jewelry_type: old.jewelry_type,
                    min_weight_mg: old.min_weight_mg,
                    max_weight_mg: old.max_weight_mg,
                  },
                },
              ],
            },
          });
        } else {
          const { deleteProductsWorkflow } =
            await import("@medusajs/medusa/core-flows");
          await deleteProductsWorkflow(req.scope).run({
            input: { ids: [native] },
          });
        }
      } catch {
        console.error(
          "Didar native product compensation failed; reconciliation required for",
          id,
        );
      }
    }
    throw error;
  }
}
async function approved(c: any, id: string) {
  const {
    rows: [s],
  } = await c.query("SELECT * FROM didar_supplier WHERE id=$1 FOR SHARE", [id]);
  if (!s || !s.active || s.status !== "approved") throw new Error("FORBIDDEN");
  return s;
}
export async function manage(req: any, u: any) {
  const b = req.body || {};
  if (req.method === "GET") {
    const data = await catalog(u);
    const { rows: suppliers } = await db.query(
      "SELECT * FROM didar_supplier WHERE $1='admin' OR id=$2 ORDER BY name",
      [u.role, u.supplier_id],
    );
    const { rows: product_requests } = await db.query(
      "SELECT r.*,s.name supplier FROM didar_product_request r JOIN didar_supplier s ON s.id=r.supplier_id WHERE $1='admin' OR r.supplier_id=$2 ORDER BY r.created_at DESC LIMIT 100",
      [u.role, u.supplier_id],
    );
    const { rows: auditRows } =
      u.role === "admin"
        ? await db.query(
            "SELECT a.*,u.name actor FROM didar_audit a LEFT JOIN didar_user u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100",
          )
        : { rows: [] };
    return {
      ...data,
      suppliers,
      permissions: await permissions(db, u),
      product_requests,
      ...(u.role === "admin" ? { audit: auditRows } : {}),
    };
  }
  if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");
  if (u.role === "supplier") await approved(db, u.supplier_id);
  if (b.kind === "offer" || b.kind === "new_offer")
    return transaction(async (c) => {
      const creating = b.kind === "new_offer";
      const id = creating ? randomUUID() : text(b.id);
      const {
        rows: [old],
      } = creating
        ? { rows: [] }
        : await c.query("SELECT * FROM didar_offer WHERE id=$1 FOR UPDATE", [
            id,
          ]);
      if (!creating && !old) throw new Error("NOT_FOUND");
      if (old && u.role === "supplier" && old.supplier_id !== u.supplier_id)
        throw new Error("FORBIDDEN");
      if (old && old.version !== b.version) throw new Error("CONFLICT_VERSION");
      const supplier = creating
        ? u.role === "supplier"
          ? u.supplier_id
          : text(b.supplier_id)
        : old.supplier_id;
      if (creating) await authorize(c, u, supplier, "CREATE_OWN_OFFER");
      else {
        const changed = (keys: string[]) =>
          keys.some(
            (k) => b[k] !== undefined && String(b[k]) !== String(old[k]),
          );
        const rights: string[] = [];
        if (changed(["quantity"])) rights.push("EDIT_OWN_INVENTORY");
        if (
          changed([
            "labor_irr",
            "labor_bps",
            "labor_mode",
            "making_mode",
            "making_bps",
            "making_weight_mg",
          ])
        )
          rights.push("EDIT_OWN_MAKING_CHARGE");
        if (changed(["active", "terms", "margin_bps"]))
          rights.push("EDIT_OWN_OFFER");
        if (!rights.length) rights.push("EDIT_OWN_OFFER");
        for (const right of rights) await authorize(c, u, supplier, right);
        if (
          old.stock_mode === "itemized" &&
          b.quantity !== undefined &&
          b.quantity !== old.quantity
        )
          throw new Error("CONFLICT_DERIVED_STOCK");
      }
      if (u.role !== "admin" || creating) await approved(c, supplier);
      const product = creating ? text(b.product_id) : old.product_id;
      const {
        rows: [p],
      } = await c.query("SELECT * FROM didar_product WHERE id=$1 FOR SHARE", [
        product,
      ]);
      if (!p || ((!p.active || !p.published) && u.role === "supplier"))
        throw new Error("INVALID_PRODUCT");
      const weight = creating
        ? integer(b.weight_mg, "WEIGHT", 1, 1000000)
        : old.weight_mg;
      if (
        (p.min_weight_mg && weight < p.min_weight_mg) ||
        (p.max_weight_mg && weight > p.max_weight_mg)
      )
        throw new Error("INVALID_WEIGHT_RANGE");
      const laborMode = b.labor_mode ?? old?.labor_mode ?? "fixed";
      if (!["fixed", "percent"].includes(laborMode))
        throw new Error("INVALID_LABOR_MODE");
      const {
        rows: [policy],
      } = await c.query("SELECT default_margin_bps FROM didar_rate WHERE id=1");
      const quantity = integer(
          b.quantity ?? old?.quantity ?? 0,
          "QUANTITY",
          0,
          100000,
        ),
        labor = integer(b.labor_irr ?? Number(old?.labor_irr ?? 0), "LABOR"),
        margin = integer(
          b.margin_bps ?? old?.margin_bps ?? policy.default_margin_bps,
          "MARGIN",
          0,
          10000,
        ),
        laborBps = integer(
          b.labor_bps ?? old?.labor_bps ?? 0,
          "LABOR_PERCENT",
          0,
          10000,
        ),
        active = bool(b.active, old?.active ?? true),
        terms = optional(b.terms ?? old?.terms, 2000);
      if (creating)
        await c.query(
          "INSERT INTO didar_offer(id,product_id,supplier_id,weight_mg,quantity,labor_irr,margin_bps,labor_bps,active,terms,labor_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            id,
            product,
            supplier,
            weight,
            quantity,
            labor,
            margin,
            laborBps,
            active,
            terms,
            laborMode,
          ],
        );
      else
        await c.query(
          "UPDATE didar_offer SET quantity=$1,labor_irr=$2,margin_bps=$3,labor_bps=$4,active=$5,terms=$6,labor_mode=$7,version=version+1 WHERE id=$8",
          [quantity, labor, margin, laborBps, active, terms, laborMode, id],
        );
      if (b.making_mode !== undefined || old?.making_mode) {
        const mode = b.making_mode ?? old.making_mode;
        if (!["percent", "fixed_gold"].includes(mode))
          throw new Error("INVALID_MAKING_MODE");
        const bps = integer(
            b.making_bps ?? old?.making_bps ?? 0,
            "MAKING",
            0,
            10000,
          ),
          mg = integer(
            b.making_weight_mg ?? old?.making_weight_mg ?? 0,
            "MAKING_WEIGHT",
            0,
            1000000,
          );
        await c.query(
          "UPDATE didar_offer SET making_mode=$1,making_bps=$2,making_weight_mg=$3 WHERE id=$4",
          [mode, bps, mg, id],
        );
      }
      await audit(c, u.id, creating ? "offer_created" : "offer_updated", {
        supplier_id: supplier,
        admin_override: u.role === "admin",
        making_mode: b.making_mode,
        making_bps: b.making_bps,
        making_weight_mg: b.making_weight_mg,
        id,
        quantity,
        labor_irr: labor,
        labor_bps: laborBps,
        margin_bps: margin,
        labor_mode: laborMode,
        active,
        terms,
      });
      return { ok: true, id };
    });
  if (b.kind === "product_request") {
    if (u.role !== "supplier") throw new Error("FORBIDDEN");
    const payload = productInput(b);
    payload.published = false;
    const id = randomUUID();
    await transaction(async (c) => {
      await authorize(c, u, u.supplier_id, "REQUEST_PRODUCT_CREATION");
      await c.query(
        "INSERT INTO didar_product_request(id,supplier_id,payload) VALUES($1,$2,$3)",
        [id, u.supplier_id, JSON.stringify(payload)],
      );
      await audit(c, u.id, "product_requested", {
        id,
        supplier_id: u.supplier_id,
      });
    });
    return { id };
  }
  if (u.role !== "admin") throw new Error("FORBIDDEN");
  if (b.kind === "product")
    return transaction((c) => saveProduct(req, u, b, c));
  if (b.kind === "category")
    return transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "didar:category-tree",
      ]);
      const id = b.id ? text(b.id) : randomUUID(),
        name = text(b.name, 100),
        parent = b.parent_id ? text(b.parent_id) : null;
      if (parent) {
        const { rows } = await c.query(
          "WITH RECURSIVE ancestors AS (SELECT id,parent_id FROM didar_category WHERE id=$1 UNION SELECT c.id,c.parent_id FROM didar_category c JOIN ancestors a ON c.id=a.parent_id) SELECT id FROM ancestors",
          [parent],
        );
        if (!rows.length || rows.some((r: any) => r.id === id))
          throw new Error("INVALID_CATEGORY_PARENT");
      }
      await c.query(
        "INSERT INTO didar_category(id,name,slug,parent_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,parent_id=EXCLUDED.parent_id",
        [id, name, slug(b.slug), parent],
      );
      await c.query(
        "UPDATE didar_product SET category=$1 WHERE category_id=$2",
        [name, id],
      );
      await audit(c, u.id, "category_saved", { id, name, parent_id: parent });
      return { id };
    });
  if (b.kind === "collection")
    return transaction(async (c) => {
      const id = b.id ? text(b.id) : randomUUID();
      await c.query(
        "INSERT INTO didar_collection(id,name,slug) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug",
        [id, text(b.name, 100), slug(b.slug)],
      );
      if (b.product_ids !== undefined) {
        if (!Array.isArray(b.product_ids) || b.product_ids.length > 500)
          throw new Error("INVALID_PRODUCTS");
        for (const pid of new Set(b.product_ids)) {
          const { rowCount } = await c.query(
            "SELECT id FROM didar_product WHERE id=$1",
            [text(pid)],
          );
          if (!rowCount) throw new Error("INVALID_PRODUCT");
        }
        await c.query(
          "DELETE FROM didar_collection_product WHERE collection_id=$1",
          [id],
        );
        for (const pid of new Set(b.product_ids))
          await c.query("INSERT INTO didar_collection_product VALUES($1,$2)", [
            id,
            text(pid),
          ]);
      }
      await audit(c, u.id, "collection_saved", { id });
      return { id };
    });
  if (b.kind === "supplier_state") {
    if (!["pending", "approved", "rejected"].includes(b.status))
      throw new Error("INVALID_SUPPLIER_STATUS");
    const id = text(b.id),
      active = bool(b.active, b.status === "approved");
    return transaction(async (c) => {
      const { rowCount } = await c.query(
        "UPDATE didar_supplier SET status=$1,active=$2 WHERE id=$3",
        [b.status, active, id],
      );
      if (!rowCount) throw new Error("NOT_FOUND");
      await audit(c, u.id, "supplier_state", { id, status: b.status, active });
      return { ok: true };
    });
  }
  if (b.kind === "supplier") {
    const id = randomUUID();
    await transaction(async (c) => {
      await c.query("INSERT INTO didar_supplier(id,name) VALUES($1,$2)", [
        id,
        text(b.name, 100),
      ]);
      if (b.email || b.password) {
        const email = text(b.email, 150).toLowerCase(),
          password = text(b.password, 128);
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !demoAccountAllowed(email)
        )
          throw new Error("INVALID_EMAIL");
        if (password.length < 12) throw new Error("INVALID_PASSWORD_MIN_12");
        await c.query(
          "INSERT INTO didar_user(id,email,name,password,role,supplier_id) VALUES($1,$2,$3,$4,'supplier',$5)",
          [randomUUID(), email, text(b.name, 100), hashPassword(password), id],
        );
      }
      await audit(c, u.id, "supplier_created", { id });
    });
    return { id };
  }
  if (b.kind === "review_request")
    return transaction(async (c) => {
      if (!["approved", "rejected"].includes(b.decision))
        throw new Error("INVALID_DECISION");
      const id = text(b.id);
      const {
        rows: [r],
      } = await c.query(
        "SELECT * FROM didar_product_request WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!r) throw new Error("NOT_FOUND");
      if (r.status !== "pending")
        return { id, product_id: r.product_id, status: r.status };
      const result =
        b.decision === "approved"
          ? await saveProduct(
              req,
              u,
              {
                ...r.payload,
                ...(b.category_id !== undefined
                  ? { category_id: b.category_id }
                  : {}),
                published: true,
                approved: true,
              },
              c,
            )
          : null;
      await c.query(
        "UPDATE didar_product_request SET status=$1,reason=$2,product_id=$3,reviewed_by=$4,reviewed_at=now() WHERE id=$5",
        [b.decision, optional(b.reason, 2000), result?.id ?? null, u.id, id],
      );
      await audit(c, u.id, "product_request_reviewed", {
        id,
        decision: b.decision,
        product_id: result?.id,
      });
      return { id, product_id: result?.id, status: b.decision };
    });
  if (b.kind === "image_upload")
    return transaction(async (c) => {
      const product = text(b.product_id);
      const {
        rows: [p],
      } = await c.query("SELECT id FROM didar_product WHERE id=$1 FOR UPDATE", [
        product,
      ]);
      if (!p) throw new Error("NOT_FOUND");
      const {
        rows: [count],
      } = await c.query(
        "SELECT count(*)::int n FROM didar_product_image WHERE product_id=$1",
        [product],
      );
      if (count.n >= 10) throw new Error("INVALID_IMAGE_LIMIT");
      if (
        typeof b.data !== "string" ||
        b.data.length > 1048576 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(b.data)
      )
        throw new Error("INVALID_IMAGE");
      const data = Buffer.from(b.data, "base64");
      const png = data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
      const webp =
        data.toString("ascii", 0, 4) === "RIFF" &&
        data.toString("ascii", 8, 12) === "WEBP";
      if (
        data.length < 16 ||
        data.length > 786432 ||
        !{ "image/png": png, "image/jpeg": jpeg, "image/webp": webp }[
          b.mime_type as string
        ]
      )
        throw new Error("INVALID_IMAGE");
      const id = randomUUID();
      await c.query(
        "INSERT INTO didar_product_image(id,product_id,mime_type,data,alt,position) VALUES($1,$2,$3,$4,$5,$6)",
        [id, product, b.mime_type, data, optional(b.alt, 250), count.n],
      );
      await audit(c, u.id, "image_uploaded", { id, product_id: product });
      return { id, url: `/api/didar/image?id=${id}` };
    });
  if (b.kind === "image_update" || b.kind === "image_delete")
    return transaction(async (c) => {
      const id = text(b.id);
      const result =
        b.kind === "image_delete"
          ? await c.query(
              "DELETE FROM didar_product_image WHERE id=$1 RETURNING product_id",
              [id],
            )
          : await c.query(
              "UPDATE didar_product_image SET alt=$1,position=$2 WHERE id=$3 RETURNING product_id",
              [
                optional(b.alt, 250),
                integer(b.position, "POSITION", 0, 100),
                id,
              ],
            );
      if (!result.rowCount) throw new Error("NOT_FOUND");
      await audit(c, u.id, b.kind, {
        id,
        product_id: result.rows[0].product_id,
      });
      return { ok: true };
    });
  // Pricing policy is handled by the commerce extension before this dispatcher.
  throw new Error("INVALID_KIND");
}
