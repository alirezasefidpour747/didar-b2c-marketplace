import { randomUUID } from "node:crypto";
import { transaction } from "./db";
import { authorize } from "./permissions";
import { integer } from "./pricing";
import { parseDiscovery } from "./discovery";
export const clean = (x: unknown, max = 2000) => {
  if (
    typeof x !== "string" ||
    x.trim().length < 1 ||
    x.length > max ||
    /[\u0000-\u001f<>]/.test(x)
  )
    throw new Error("INVALID_CLASSIFICATION_TEXT");
  return x.trim();
};
const flag = (x: any, fallback: boolean) => {
  if (x === undefined) return fallback;
  if (typeof x !== "boolean") throw new Error("INVALID_BOOLEAN");
  return x;
};
const code = (x: any) => {
  const s = clean(x, 80);
  if (!/^[a-z][a-z0-9_]{1,79}$/.test(s)) throw new Error("INVALID_FACET_CODE");
  return s;
};
const version = (b: any, old: any) => {
  if (old && b.version !== old.version) throw new Error("CONFLICT_VERSION");
};
export const classificationEvent = async (
  c: any,
  u: any,
  action: string,
  id: string,
  details: any,
) => {
  await c.query(
    "INSERT INTO didar_classification_event(actor_id,action,entity_id,details) VALUES($1,$2,$3,$4)",
    [u.id, action, id, JSON.stringify(details)],
  );
  await c.query(
    "INSERT INTO didar_audit(actor_id,action,details) VALUES($1,$2,$3)",
    [u.id, action, JSON.stringify({ id, ...details })],
  );
};
export async function ownedProduct(c: any, u: any, id: string, write = false) {
  if (u.role === "supplier")
    await authorize(
      c,
      u,
      u.supplier_id,
      write ? "SUGGEST_OWN_CLASSIFICATION" : undefined,
    );
  const {
    rows: [p],
  } = await c.query(
    `SELECT * FROM didar_product WHERE id=$1 ${write ? "FOR UPDATE" : ""}`,
    [id],
  );
  if (!p) throw new Error("NOT_FOUND");
  if (u.role !== "admin") {
    const { rowCount } = await c.query(
      "SELECT 1 FROM didar_offer WHERE product_id=$1 AND supplier_id=$2 UNION SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=$1 AND b.supplier_id=$2 UNION SELECT 1 FROM didar_product_request WHERE product_id=$1 AND supplier_id=$2 AND status='approved'",
      [id, u.supplier_id],
    );
    if (!rowCount) throw new Error("FORBIDDEN");
  }
  return p;
}
export async function classificationRead(u: any, q: any) {
  return transaction(async (c) => {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    if (Object.keys(q).some((k) => k !== "product_id"))
      throw new Error("INVALID_FILTER");
    if (u.role === "supplier") await authorize(c, u, u.supplier_id);
    const { rows: facets } = await c.query(
      "SELECT * FROM didar_facet ORDER BY number",
    );
    const { rows: values } = await c.query(
      "SELECT * FROM didar_facet_value ORDER BY sort_order,code",
    );
    const { rows: translations } = await c.query(
      `SELECT * FROM didar_catalog_translation WHERE $1='admin' OR (status='approved' AND entity_type IN ('facet','value')) ORDER BY created_at DESC,id`,
      [u.role],
    );
    let assignments: any[] = [],
      events: any[] = [];
    if (q.product_id !== undefined) {
      const id = clean(q.product_id, 120);
      await ownedProduct(c, u, id);
      assignments = (
        await c.query(
          `SELECT * FROM didar_product_facet_assignment WHERE product_id=$1 AND ($2='admin' OR status='approved' OR supplier_id=$3) ORDER BY created_at,id`,
          [id, u.role, u.supplier_id],
        )
      ).rows;
      if (u.role === "admin")
        events = (
          await c.query(
            "SELECT * FROM didar_classification_event WHERE entity_id=$1 ORDER BY id DESC LIMIT 100",
            [id],
          )
        ).rows;
    }
    const pages =
      u.role === "admin"
        ? (
            await c.query(
              "SELECT * FROM didar_discovery_page ORDER BY sort_order,slug",
            )
          ).rows
        : [];
    const { rows: products } = await c.query(
      `SELECT p.id,p.title FROM didar_product p WHERE $1='admin' OR EXISTS(SELECT 1 FROM didar_offer o WHERE o.product_id=p.id AND o.supplier_id=$2) OR EXISTS(SELECT 1 FROM didar_intake_line l JOIN didar_intake_batch b ON b.id=l.batch_id WHERE l.product_id=p.id AND b.supplier_id=$2) OR EXISTS(SELECT 1 FROM didar_product_request r WHERE r.product_id=p.id AND r.supplier_id=$2 AND r.status='approved') ORDER BY p.title,p.id`,
      [u.role, u.supplier_id],
    );
    return {
      can_suggest:
        u.role === "admin" ||
        !!(
          await c.query(
            "SELECT granted FROM didar_supplier_permission WHERE supplier_id=$1 AND permission='SUGGEST_OWN_CLASSIFICATION'",
            [u.supplier_id],
          )
        ).rows[0]?.granted,
      products,
      facets,
      values,
      translations:
        u.role === "admin"
          ? translations
          : translations.map((t: any) => ({
              entity_type: t.entity_type,
              entity_id: t.entity_id,
              locale: t.locale,
              label: t.label,
              status: t.status,
            })),
      assignments:
        u.role === "admin"
          ? assignments
          : assignments.map((a: any) =>
              a.supplier_id === u.supplier_id
                ? a
                : {
                    id: a.id,
                    product_id: a.product_id,
                    value_id: a.value_id,
                    facet_code: a.facet_code,
                    status: a.status,
                    version: a.version,
                  },
            ),
      events,
      pages,
      storefront_locales: ["fa"],
      translation_locales: ["fa", "en", "ar", "fr"],
    };
  });
}
export async function classificationWrite(u: any, b: any) {
  return transaction(async (c) => {
    const op = b.operation;
    if (b.kind === "classification") {
      const product = clean(b.product_id, 120);
      await ownedProduct(c, u, product, true);
      const admin = u.role === "admin";
      if (!admin && op !== "suggest") throw new Error("FORBIDDEN");
      if (!["suggest", "assign", "review", "retire"].includes(op))
        throw new Error("INVALID_OPERATION");
      const {
        rows: [v],
      } = await c.query(
        "SELECT v.*,f.target,f.active facet_active FROM didar_facet_value v JOIN didar_facet f ON f.code=v.facet_code WHERE v.id=$1 FOR SHARE OF v,f",
        [clean(b.value_id, 150)],
      );
      if (!v || v.target === "collection" || (!admin && v.target !== "product"))
        throw new Error(admin ? "INVALID_FACET_VALUE" : "FORBIDDEN");
      const {
        rows: [old],
      } = await c.query(
        "SELECT * FROM didar_product_facet_assignment WHERE product_id=$1 AND value_id=$2 FOR UPDATE",
        [product, v.id],
      );
      if (old && !admin && old.supplier_id !== u.supplier_id)
        throw new Error("CONFLICT_CLASSIFICATION_OWNERSHIP");
      if (old) version(b, old);
      if (!admin && old?.status === "approved")
        throw new Error("CONFLICT_CLASSIFICATION_APPROVED");
      if ((op === "review" || op === "retire") && !old)
        throw new Error("NOT_FOUND");
      if (op === "suggest" && (!v.active || !v.facet_active))
        throw new Error("INVALID_FACET_VALUE");
      const status =
        op === "suggest"
          ? "pending"
          : op === "retire"
            ? "retired"
            : op === "review"
              ? b.decision
              : "approved";
      if (!["pending", "approved", "rejected", "retired"].includes(status))
        throw new Error("INVALID_DECISION");
      if (op === "review" && !["approved", "rejected"].includes(status))
        throw new Error("INVALID_DECISION");
      const reason = clean(b.reason, 2000);
      if (reason.length < 5) throw new Error("INVALID_CLASSIFICATION_REASON");
      const evidence =
        b.evidence === undefined
          ? old?.evidence || ""
          : b.evidence === ""
            ? ""
            : clean(b.evidence, 5000);
      const starts =
          b.starts_at === undefined
            ? old?.starts_at || null
            : date(b.starts_at),
        ends = b.ends_at === undefined ? old?.ends_at || null : date(b.ends_at);
      const id = old?.id || randomUUID();
      const {
        rows: [saved],
      } = await c.query(
        `INSERT INTO didar_product_facet_assignment(id,product_id,value_id,facet_code,status,supplier_id,actor_id,reviewed_by,reviewed_at,evidence,reason,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,$9,$10,$11,$12) ON CONFLICT(product_id,value_id) DO UPDATE SET status=EXCLUDED.status,actor_id=EXCLUDED.actor_id,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=EXCLUDED.reviewed_at,evidence=EXCLUDED.evidence,reason=EXCLUDED.reason,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,updated_at=now(),version=didar_product_facet_assignment.version+1 RETURNING *`,
        [
          id,
          product,
          v.id,
          v.facet_code,
          status,
          old?.supplier_id || (!admin ? u.supplier_id : null),
          u.id,
          admin ? u.id : null,
          evidence,
          reason,
          starts,
          ends,
        ],
      );
      await classificationEvent(c, u, "classification_" + op, product, {
        before: old || null,
        after: saved,
      });
      return saved;
    }
    if (u.role !== "admin") throw new Error("FORBIDDEN");
    if (b.kind === "vocabulary") {
      if (op === "translation_draft") {
        const type = clean(b.entity_type, 20),
          id = clean(b.entity_id, 150),
          locale = clean(b.locale, 2),
          label = clean(b.label, 200);
        if (!["fa", "en", "ar", "fr"].includes(locale) || label.length < 2)
          throw new Error("INVALID_TRANSLATION");
        if (!["facet", "value", "collection", "page"].includes(type))
          throw new Error("INVALID_TRANSLATION_ENTITY");
        const table = (
          {
            facet: "didar_facet",
            value: "didar_facet_value",
            collection: "didar_collection",
            page: "didar_discovery_page",
          } as any
        )[type];
        if (!table) throw new Error("INVALID_TRANSLATION_ENTITY");
        if (
          !(
            await c.query(
              `SELECT 1 FROM ${table} WHERE ${type === "facet" ? "code" : "id"}=$1`,
              [id],
            )
          ).rowCount
        )
          throw new Error("INVALID_TRANSLATION_ENTITY");
        const tid = randomUUID();
        await c.query(
          `INSERT INTO didar_catalog_translation(id,entity_type,entity_id,locale,label,status,actor_id,source_ref) VALUES($1,$2,$3,$4,$5,'draft',$6,$7)`,
          [
            tid,
            type,
            id,
            locale,
            label,
            u.id,
            b.source_ref ? clean(b.source_ref, 500) : "",
          ],
        );
        await classificationEvent(c, u, "translation_drafted", id, {
          translation_id: tid,
          locale,
          label,
        });
        return { id: tid };
      }
      if (op === "translation_review") {
        const id = clean(b.id, 150);
        // Serialize all locale approvals before locking revisions, avoiding cross-revision deadlocks.
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext('didar:translation-review'))",
        );
        const {
          rows: [old],
        } = await c.query(
          "SELECT * FROM didar_catalog_translation WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!old) throw new Error("NOT_FOUND");
        if (old.status !== "draft")
          throw new Error("CONFLICT_TRANSLATION_REVIEWED");
        if (!["approved", "rejected"].includes(b.decision))
          throw new Error("INVALID_DECISION");
        const reason = clean(b.reason);
        if (reason.length < 5) throw new Error("INVALID_REASON");
        if (b.decision === "approved") {
          if (
            (["fa", "ar"].includes(old.locale) &&
              !/[\u0600-\u06ff]/.test(old.label)) ||
            (["en", "fr"].includes(old.locale) &&
              !/[A-Za-zÀ-ÿ]/.test(old.label))
          )
            throw new Error("INVALID_TRANSLATION_SCRIPT");
          await c.query(
            "UPDATE didar_catalog_translation SET status='retired' WHERE entity_type=$1 AND entity_id=$2 AND locale=$3 AND status='approved'",
            [old.entity_type, old.entity_id, old.locale],
          );
        }
        await c.query(
          "UPDATE didar_catalog_translation SET status=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3",
          [b.decision, u.id, id],
        );
        await classificationEvent(c, u, "translation_reviewed", old.entity_id, {
          id,
          before: old,
          decision: b.decision,
          reason,
        });
        return { id };
      }
      if (op === "value_create") {
        const facet = clean(b.facet_code, 60),
          value = code(b.code),
          id = facet + "." + value;
        if (
          !(await c.query("SELECT 1 FROM didar_facet WHERE code=$1", [facet]))
            .rowCount
        )
          throw new Error("INVALID_FACET");
        await c.query(
          "INSERT INTO didar_facet_value(id,facet_code,code,evidence_required,sort_order) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            facet,
            value,
            facet === "heritage" || flag(b.evidence_required, false),
            integer(b.sort_order ?? 0, "SORT", 0, 10000),
          ],
        );
        await classificationEvent(c, u, "facet_value_created", id, {
          facet,
          code: value,
        });
        return { id };
      }
      if (op === "value_update" || op === "facet_update") {
        const table =
            op === "value_update" ? "didar_facet_value" : "didar_facet",
          key = op === "value_update" ? "id" : "code",
          id = clean(b.id, 150);
        const {
          rows: [old],
        } = await c.query(`SELECT * FROM ${table} WHERE ${key}=$1 FOR UPDATE`, [
          id,
        ]);
        if (!old) throw new Error("NOT_FOUND");
        version(b, old);
        await c.query(
          `UPDATE ${table} SET active=$1,visible=$2,sort_order=$3,version=version+1 WHERE ${key}=$4`,
          [
            flag(b.active, old.active),
            flag(b.visible, old.visible),
            integer(b.sort_order ?? old.sort_order, "SORT", 0, 10000),
            id,
          ],
        );
        await classificationEvent(c, u, op, id, {
          before: old,
          active: b.active,
          visible: b.visible,
          sort_order: b.sort_order,
          reason: clean(b.reason),
        });
        return { id };
      }
      throw new Error("INVALID_OPERATION");
    }
    if (b.kind === "curated_page") {
      const id = b.id ? clean(b.id, 120) : randomUUID();
      const {
        rows: [old],
      } = await c.query(
        "SELECT * FROM didar_discovery_page WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (b.id && !old) throw new Error("NOT_FOUND");
      if (old) version(b, old);
      const slug = clean(b.slug, 100);
      if (
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
        !["lifestyle", "occasion", "heritage", "curated"].includes(b.page_kind)
      )
        throw new Error("INVALID_DISCOVERY_PAGE");
      if (!b.query || Array.isArray(b.query) || typeof b.query !== "object")
        throw new Error("INVALID_DISCOVERY_QUERY");
      const parsed = parseDiscovery(b.query, true);
      await validateFilterValues(c, parsed.filters);
      const name = clean(b.name, 150);
      const {
        rows: [saved],
      } = await c.query(
        "INSERT INTO didar_discovery_page(id,slug,name,kind,query,active,sort_order,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,name=EXCLUDED.name,kind=EXCLUDED.kind,query=EXCLUDED.query,active=EXCLUDED.active,sort_order=EXCLUDED.sort_order,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,version=didar_discovery_page.version+1 RETURNING *",
        [
          id,
          slug,
          name,
          b.page_kind,
          JSON.stringify(b.query),
          flag(b.active, old?.active ?? true),
          integer(b.sort_order ?? 0, "SORT", 0, 10000),
          date(b.starts_at),
          date(b.ends_at),
        ],
      );
      await approveCollectionLabel(c, u, "page", id, name);
      await classificationEvent(c, u, "curated_page_saved", id, {
        before: old || null,
        after: saved,
        reason: clean(b.reason),
      });
      return saved;
    }
    throw new Error("INVALID_KIND");
  });
}
export async function validateFilterValues(
  c: any,
  filters: Record<string, string[]>,
) {
  for (const [facet, codes] of Object.entries(filters)) {
    const { rows } = await c.query(
      "SELECT code FROM didar_facet_value WHERE facet_code=$1 AND code=ANY($2::text[])",
      [facet, codes],
    );
    if (rows.length !== codes.length) throw new Error("INVALID_FILTER_VALUE");
  }
}
function date(x: any) {
  if (x === null || x === "" || x === undefined) return null;
  if (
    typeof x !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(x) ||
    !Number.isFinite(Date.parse(x))
  )
    throw new Error("INVALID_DATE");
  return new Date(x).toISOString();
}
async function approveCollectionLabel(
  c: any,
  u: any,
  type: string,
  id: string,
  label: string,
) {
  await c.query(
    "UPDATE didar_catalog_translation SET status='retired' WHERE entity_type=$1 AND entity_id=$2 AND locale='fa' AND status='approved'",
    [type, id],
  );
  await c.query(
    "INSERT INTO didar_catalog_translation(id,entity_type,entity_id,locale,label,status,actor_id,reviewed_by,reviewed_at) VALUES($1,$2,$3,'fa',$4,'approved',$5,$5,now())",
    [randomUUID(), type, id, label, u.id],
  );
}
export async function saveCollection(c: any, u: any, b: any) {
  const id = b.id ? clean(b.id, 120) : randomUUID();
  const {
    rows: [old],
  } = await c.query("SELECT * FROM didar_collection WHERE id=$1 FOR UPDATE", [
    id,
  ]);
  if (b.id && !old) throw new Error("NOT_FOUND");
  if (old) version(b, old);
  const name = clean(b.name, 100),
    slug = clean(b.slug, 100);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("INVALID_SLUG");
  const type =
    b.type_code === undefined
      ? old?.type_id || null
      : b.type_code
        ? "collection_type." + code(b.type_code)
        : null;
  const supplier =
    b.owner_supplier_id === undefined
      ? old?.owner_supplier_id || null
      : b.owner_supplier_id
        ? clean(b.owner_supplier_id, 120)
        : null;
  const image =
    b.image_id === undefined
      ? old?.image_id || null
      : b.image_id
        ? clean(b.image_id, 120)
        : null;
  const {
    rows: [saved],
  } = await c.query(
    `INSERT INTO didar_collection(id,name,slug,code,type_id,owner_supplier_id,active,published,approved,description,image_id,sort_order,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,slug=EXCLUDED.slug,type_id=EXCLUDED.type_id,owner_supplier_id=EXCLUDED.owner_supplier_id,active=EXCLUDED.active,published=EXCLUDED.published,approved=EXCLUDED.approved,description=EXCLUDED.description,image_id=EXCLUDED.image_id,sort_order=EXCLUDED.sort_order,evidence=EXCLUDED.evidence,updated_at=now(),version=didar_collection.version+1 RETURNING *`,
    [
      id,
      name,
      slug,
      old?.code || (b.code ? clean(b.code, 100) : "collection." + id),
      type,
      supplier,
      flag(b.active, old?.active ?? true),
      flag(b.published, old?.published ?? false),
      flag(b.approved, old?.approved ?? false),
      b.description === undefined
        ? old?.description || ""
        : b.description
          ? clean(b.description, 2000)
          : "",
      image,
      integer(b.sort_order ?? old?.sort_order ?? 0, "SORT", 0, 10000),
      b.evidence === undefined
        ? old?.evidence || ""
        : b.evidence
          ? clean(b.evidence, 5000)
          : "",
    ],
  );
  if (b.code && b.code !== saved.code)
    throw new Error("INVALID_COLLECTION_IDENTITY");
  if (b.product_ids !== undefined) {
    if (!Array.isArray(b.product_ids) || b.product_ids.length > 500)
      throw new Error("INVALID_PRODUCTS");
    const ids = [...new Set(b.product_ids.map((x: any) => clean(x, 120)))];
    if (
      (
        await c.query("SELECT id FROM didar_product WHERE id=ANY($1::text[])", [
          ids,
        ])
      ).rowCount !== ids.length
    )
      throw new Error("INVALID_PRODUCT");
    await c.query(
      "DELETE FROM didar_collection_product WHERE collection_id=$1",
      [id],
    );
    for (const pid of ids)
      await c.query("INSERT INTO didar_collection_product VALUES($1,$2)", [
        id,
        pid,
      ]);
  }
  await approveCollectionLabel(c, u, "collection", id, name);
  await classificationEvent(c, u, "collection_saved", id, {
    before: old || null,
    after: saved,
    product_ids: b.product_ids,
  });
  return saved;
}
