"use client";
import { Link } from "./store";
import { MerchantPricing } from "./merchant-pricing";
import {
  ClassificationHub,
  ProductClassification,
  CollectionGovernance,
  collectionFields,
} from "./classification";
import { useEffect, useState, type FormEvent } from "react";
import { RequireUser, useDidar, type Product, type Offer } from "./store";
import { date, states, weight } from "./locale";
import { ImageAsset } from "./catalog";
type FieldProps = {
  name: string;
  label: string;
  value?: any;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
  type?: string;
};
function Field({
  name,
  label,
  value,
  min,
  max,
  required = true,
  disabled = false,
  type = "text",
}: FieldProps) {
  return (
    <label>
      {label}
      <input
        disabled={disabled}
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        max={max}
        required={required}
        maxLength={type === "text" ? 500 : undefined}
      />
    </label>
  );
}
const num = (f: FormData, k: string) => Number(f.get(k) || 0);
export function productData(f: FormData) {
  return {
    title: f.get("title"),
    slug: f.get("slug") || "product",
    description: f.get("description"),
    category_id: f.get("category_id") || null,
    category: f.get("category") || "",
    reference: f.get("reference") || "",
    jewelry_type: f.get("jewelry_type") || "",
    purity: num(f, "purity"),
    min_weight_mg: num(f, "min_weight_mg") || null,
    max_weight_mg: num(f, "max_weight_mg") || null,
    active: f.get("active") === "on",
    published: f.get("published") === "on",
    approved: f.get("approved") === "on",
    attributes: JSON.parse(String(f.get("attributes") || "{}")),
  };
}
export function ProductFields({
  p,
  categories,
  request = false,
}: {
  p?: Product;
  categories: any[];
  request?: boolean;
}) {
  const [selected, setSelected] = useState(p?.category_id || "");
  const [published, setPublished] = useState(p?.published ?? false);
  const chain = (id: string): any[] => {
    const found: any[] = [];
    const seen = new Set<string>();
    let c = categories.find((c) => c.id === id);
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      found.unshift(c);
      c = categories.find((n) => n.id === c.parent_id);
    }
    return found;
  };
  const families = categories.filter((c) => c.kind === "family" && c.active);
  const leaves = categories.filter(
    (c) =>
      c.kind === "subcategory" &&
      c.active &&
      !categories.some((n) => n.parent_id === c.id) &&
      chain(c.id).length === 3 &&
      chain(c.id).every((c) => c.active),
  );
  const parentOptions = categories.filter(
    (c) => c.kind === "category" && c.active,
  );
  const [parent, setParent] = useState(
    categories.find((c) => c.id === selected)?.parent_id || "",
  );
  const [family, setFamily] = useState(
    categories.find((c) => c.id === parent)?.parent_id || "",
  );
  const valid = leaves.some((c) => c.id === selected);
  return (
    <>
      {!request && (
        <>
          <label>
            ویژگی‌ها JSON
            <textarea
              name="attributes"
              defaultValue={JSON.stringify(p?.attributes || {})}
            />
          </label>
          <label className="check">
            <input
              name="approved"
              type="checkbox"
              defaultChecked={p?.approved ?? true}
            />
            تأیید محصول مشترک
          </label>
        </>
      )}
      <Field name="title" label="نام" value={p?.title} />
      <label>
        توضیحات
        <textarea
          name="description"
          defaultValue={p?.description || ""}
          maxLength={4000}
        />
      </label>
      <Field
        name="reference"
        label="مدل / کد مرجع"
        value={p?.reference}
        required={false}
      />
      <Field
        name="jewelry_type"
        label="نوع زیور"
        value={p?.jewelry_type}
        required={false}
      />
      <Field
        name="slug"
        label="نامک محصول (انگلیسی)"
        value={p?.slug || "product"}
      />
      <label>
        خانواده
        <select
          aria-label="خانواده"
          value={family}
          onChange={(e) => {
            setFamily(e.target.value);
            setParent("");
            setSelected("");
            setPublished(false);
          }}
        >
          <option value="">انتخاب خانواده</option>
          {families.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        دسته
        <select
          aria-label="دسته اصلی"
          value={parent}
          disabled={!family}
          onChange={(e) => {
            setParent(e.target.value);
            setSelected("");
            setPublished(false);
          }}
        >
          <option value="">انتخاب دسته</option>
          {parentOptions
            .filter((c) => c.parent_id === family)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {chain(c.id)
                  .map((n) => n.name)
                  .join(" / ")}
              </option>
            ))}
        </select>
      </label>
      <label>
        زیردسته
        <select
          name="category_id"
          aria-label="زیردسته"
          value={selected}
          disabled={!parent && !p?.category_id}
          onChange={(e) => {
            setSelected(e.target.value);
            if (!e.target.value) setPublished(false);
          }}
        >
          <option value="">انتخاب زیردسته</option>
          {p?.category_id &&
            !leaves.some((c) => c.id === p.category_id) &&
            selected === p.category_id && (
              <option value={p.category_id}>
                طبقه‌بندی قدیمی؛ نیازمند بازبینی
              </option>
            )}
          {leaves
            .filter((c) => c.parent_id === parent)
            .map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      {!valid && (
        <p role="status">
          پیش‌نویس و بارگذاری تصویر مجاز است؛ انتشار جدید و QR مشتری نیازمند
          خانواده، دسته و زیردسته فعال است. انتشار قدیمی فقط تا بازبینی حفظ
          می‌شود.
        </p>
      )}
      {p?.canonical_path && p.published && p.active && p.approved && (
        <p>
          نشانی عمومی فعلی:{" "}
          <Link dir="ltr" href={p.canonical_path}>
            {p.canonical_path}
          </Link>
          {!p.taxonomy_ready && " (قدیمی؛ QR مشتری تا بازبینی غیرفعال)"}
        </p>
      )}
      <Field
        name="purity"
        label="عیار هزارگانی"
        type="number"
        value={p?.purity || 750}
        min={1}
        max={1000}
      />
      <Field
        name="min_weight_mg"
        label="حداقل وزن میلی‌گرم"
        type="number"
        value={p?.min_weight_mg || ""}
        min={1}
        max={1000000}
        required={false}
      />
      <Field
        name="max_weight_mg"
        label="حداکثر وزن میلی‌گرم"
        type="number"
        value={p?.max_weight_mg || ""}
        min={1}
        max={1000000}
        required={false}
      />
      {!request && (
        <>
          <label className="check">
            <input
              type="checkbox"
              name="active"
              defaultChecked={p?.active ?? true}
            />
            محصول فعال
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="published"
              checked={published}
              disabled={!valid && !published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            انتشار در ویترین
          </label>
        </>
      )}
    </>
  );
}
function CategoryGovernance({ category }: { category?: any }) {
  return (
    <>
      <label>
        رتبه ساختاری
        <select name="taxonomy_kind" defaultValue={category?.kind || ""}>
          <option value="">خودکار بر اساس والد</option>
          {category?.kind === "legacy" && (
            <option value="legacy">قدیمی؛ نیازمند بازبینی</option>
          )}
          <option value="family">خانواده</option>
          <option value="category">دسته</option>
          <option value="subcategory">زیردسته نهایی</option>
        </select>
      </label>
      <label className="check">
        <input
          name="category_active"
          type="checkbox"
          defaultChecked={category?.active ?? true}
        />
        گره فعال
      </label>
      {category?.code && (
        <p>
          کد ثابت: <code>{category.code}</code>
        </p>
      )}
    </>
  );
}
function RequestClassification({
  categories,
  initial,
  busy,
}: {
  categories: any[];
  initial?: string;
  busy: boolean;
}) {
  const [category, setCategory] = useState(initial || "");
  const [decision, setDecision] = useState("approved");
  const leaves = categories.filter(
    (c) =>
      c.kind === "subcategory" &&
      c.active &&
      !categories.some((n) => n.parent_id === c.id),
  );
  function path(id: string) {
    const result: string[] = [];
    const seen = new Set<string>();
    let c = categories.find((c) => c.id === id);
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      result.unshift(c.name);
      c = categories.find((n) => n.id === c.parent_id);
    }
    return result.join(" / ");
  }
  const valid = leaves.some((c) => c.id === category);
  return (
    <>
      <label>
        طبقه‌بندی برای تأیید محصول
        <select
          name="category_id"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">انتخاب دسته و زیردسته</option>
          {leaves.map((c) => (
            <option key={c.id} value={c.id}>
              {path(c.id)}
            </option>
          ))}
        </select>
      </label>
      <label>
        تصمیم
        <select
          name="decision"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
        >
          <option value="approved">تأیید</option>
          <option value="rejected">رد</option>
        </select>
      </label>
      {!valid && decision === "approved" && (
        <p role="status">تأیید و انتشار نیازمند طبقه‌بندی کامل است.</p>
      )}
      <Field name="reason" label="توضیح بررسی" required={false} />
      <button disabled={busy || (decision === "approved" && !valid)}>
        ثبت تصمیم درخواست
      </button>
    </>
  );
}
export function Manage({ role }: { role?: string }) {
  return (
    <RequireUser roles={role ? [role] : ["admin", "supplier"]}>
      <Management />
    </RequireUser>
  );
}
function Management() {
  const { user, api, run, busy, refresh, setMessage } = useDidar();
  const [managed, setManaged] = useState<any>(null),
    [tab, setTab] = useState(() =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("product_id")
        ? "catalog"
        : "inventory",
    );
  const admin = user?.role === "admin";
  const can = (p: string) =>
    admin ||
    managed?.permissions?.some(
      (r: any) =>
        r.supplier_id === user?.supplier_id && r.permission === p && r.granted,
    );
  const canEdit =
    can("EDIT_OWN_OFFER") ||
    can("EDIT_OWN_INVENTORY") ||
    can("EDIT_OWN_MAKING_CHARGE");
  async function load() {
    const [data, metadata] = await Promise.all([
      api("manage"),
      admin ? api("classification") : Promise.resolve(null),
    ]);
    setManaged({ ...data, classification_metadata: metadata });
  }
  useEffect(() => {
    run(load);
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("product_id");
    if (
      tab !== "catalog" ||
      !id ||
      !managed?.products.some((p: any) => p.id === id)
    )
      return;
    const frame = requestAnimationFrame(() => {
      const element = document.querySelector(
        '[data-product-id="' + CSS.escape(id) + '"]',
      );
      if (element instanceof HTMLDetailsElement) {
        element.open = true;
        element.scrollIntoView({ block: "start" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [managed, tab]);
  async function mutate(data: any, message = "اطلاعات ذخیره شد.") {
    await api("manage", data);
    await load();
    await refresh();
    setMessage(message);
  }
  function submit(fn: (f: FormData) => Promise<void>) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      run(() => fn(f));
    };
  }
  if (!managed)
    return (
      <section>
        <h1>{admin ? "مدیریت بازار دیدار" : "پنل تأمین‌کننده"}</h1>
        <p role="status">در حال دریافت اطلاعات…</p>
        <button onClick={() => run(load)}>تلاش دوباره</button>
      </section>
    );
  const categories = managed.categories || [],
    collections = managed.collections || [],
    requests = managed.product_requests || [];
  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">عملیات دیدار گلد</p>
          <h1>{admin ? "مدیریت بازار دیدار" : "پنل تأمین‌کننده"}</h1>
        </div>
        <button onClick={() => run(load)} disabled={busy}>
          تازه‌سازی مدیریت
        </button>
      </div>
      <p className="muted">
        وزن بر حسب میلی‌گرم، قیمت بر حسب ریال و درصدها بر حسب صدم درصد (۷۰۰ =
        ۷٪). موجودی، تعداد قابل فروش است و شامل قطعات رزروشده نیست.
      </p>
      <nav className="manage-tabs" aria-label="بخش‌های مدیریت">
        {[
          ["inventory", "موجودی و عرضه"],
          ["catalog", admin ? "کاتالوگ و تصاویر" : "درخواست محصول"],
          ["classification", "طبقه‌بندی و پیشنهادها"],
          ["pricing", "پروفایل قیمت‌گذاری"],
          ...(admin
            ? [
                ["suppliers", "تأمین‌کنندگان"],
                ["settings", "نرخ و تنظیمات"],
                ["audit", "گزارش تغییرات"],
              ]
            : []),
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "selected" : ""}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
        <Link href="/manage/finance">حساب‌ها و قراردادهای مالی</Link>
        <Link href="/manage/operations">پذیرش، UID و RFID و مجوزها</Link>
        <Link href="/orders">سفارش‌ها و ارسال</Link>
      </nav>
      {!admin &&
        managed.suppliers?.map((s: any) => (
          <div className="notice" key={s.id}>
            وضعیت تأمین‌کننده {s.name}:{" "}
            <strong>
              {s.status === "pending"
                ? "در انتظار تأیید"
                : states[s.status] || s.status}
            </strong>{" "}
            · {s.active ? "فعال" : "غیرفعال"}
            {s.status !== "approved" && (
              <p>
                ثبت درخواست محصول، موجودی و فروش پس از تأیید مدیر فعال می‌شود.
              </p>
            )}
          </div>
        ))}
      {tab === "pricing" && <MerchantPricing />}
      {tab === "classification" && (
        <ClassificationHub collections={collections} />
      )}
      {tab === "inventory" && (
        <>
          {can("CREATE_OWN_OFFER") && (
            <form
              className="card form-grid"
              data-testid="new-offer-form"
              onSubmit={submit(async (f) =>
                mutate(
                  {
                    kind: "new_offer",
                    product_id: f.get("product_id"),
                    ...(admin ? { supplier_id: f.get("supplier_id") } : {}),
                    weight_mg: num(f, "weight_mg"),
                    quantity: num(f, "quantity"),
                    making_mode: f.get("making_mode"),
                    making_bps: num(f, "making_bps"),
                    making_weight_mg: num(f, "making_weight_mg"),
                    labor_irr: 0,
                    terms: f.get("terms"),
                    active: true,
                  },
                  "عرضه شما ثبت شد.",
                ),
              )}
            >
              <h2>{admin ? "عرضه با وزن دقیق" : "عرضه در کاتالوگ مشترک"}</h2>
              <label>
                محصول
                <select name="product_id" required>
                  {managed.products.map((p: Product) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              {admin && (
                <label>
                  تأمین‌کننده
                  <select name="supplier_id" required>
                    {managed.suppliers.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} · {states[s.status] || s.status}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Field
                name="weight_mg"
                label="وزن میلی‌گرم"
                type="number"
                min={1}
                max={1000000}
              />
              <Field
                name="quantity"
                label="تعداد قابل فروش"
                type="number"
                min={0}
                max={100000}
              />
              <GoldFields />
              <p>
                عرضه تجمیعی قدیمی؛ برای موجودی فیزیکی از پذیرش UID استفاده کنید.
              </p>
              <label>
                شرایط تأمین
                <textarea name="terms" maxLength={1000} />
              </label>
              <button
                className="primary"
                disabled={busy || !managed.products.length}
              >
                {admin ? "ثبت عرضه" : "ثبت عرضه من"}
              </button>
            </form>
          )}
          {!canEdit && (
            <p className="notice">
              عرضه‌ها فقط خواندنی‌اند؛ مجوز نوشتن باید توسط مدیر اعطا شود.
            </p>
          )}
          {managed.products.map(
            (p: Product) =>
              p.offers.length > 0 && (
                <article className="order" key={p.id}>
                  <h2>{p.title}</h2>
                  {p.offers.map((o: Offer) => (
                    <form
                      className="inventory-form"
                      key={o.id + ":" + o.version}
                      data-offer-id={o.id}
                      onSubmit={submit(async (f) =>
                        mutate(
                          {
                            kind: "offer",
                            id: o.id,
                            version: o.version,
                            ...(can("EDIT_OWN_INVENTORY") &&
                            o.stock_mode !== "itemized"
                              ? { quantity: num(f, "quantity") }
                              : {}),
                            ...(can("EDIT_OWN_MAKING_CHARGE") &&
                            f.get("making_mode")
                              ? {
                                  making_mode: f.get("making_mode"),
                                  making_bps: num(f, "making_bps"),
                                  making_weight_mg: num(f, "making_weight_mg"),
                                }
                              : {}),
                            ...(can("EDIT_OWN_OFFER")
                              ? {
                                  terms: f.get("terms"),
                                  active: f.get("active") === "on",
                                }
                              : {}),
                          },
                          "موجودی ذخیره شد.",
                        ),
                      )}
                    >
                      <strong>
                        {o.stock_mode === "itemized"
                          ? "قطعات واقعی؛ تعداد مشتق‌شده"
                          : "موجودی تجمیعی قدیمی؛ بدون UID"}{" "}
                        · {o.supplier} · {weight(o.weight_mg)}
                      </strong>
                      <Field
                        name="quantity"
                        label="تعداد"
                        type="number"
                        min={0}
                        disabled={
                          o.stock_mode === "itemized" ||
                          !can("EDIT_OWN_INVENTORY")
                        }
                        value={o.quantity}
                      />
                      {!o.making_mode && (
                        <p>
                          اجرت قدیمی ریالی: {o.labor_irr}؛ تبدیل به شرایط طلایی
                          نیازمند تأیید مستقل است.
                        </p>
                      )}
                      <GoldFields
                        offer={o}
                        disabled={!can("EDIT_OWN_MAKING_CHARGE")}
                      />
                      <Field
                        disabled={!can("EDIT_OWN_OFFER")}
                        name="terms"
                        label="شرایط تأمین"
                        value={o.terms || ""}
                        required={false}
                      />
                      <label className="check">
                        <input
                          disabled={!can("EDIT_OWN_OFFER")}
                          name="active"
                          type="checkbox"
                          defaultChecked={o.active ?? true}
                        />
                        عرضه فعال
                      </label>
                      <button disabled={busy || !canEdit}>ذخیره</button>
                    </form>
                  ))}
                </article>
              ),
          )}
        </>
      )}
      {tab === "catalog" && (
        <>
          {admin ? (
            <>
              <form
                className="card form-grid"
                data-testid="product-form"
                onSubmit={submit(async (f) =>
                  mutate(
                    { kind: "product", ...productData(f) },
                    "محصول در کاتالوگ ثبت شد.",
                  ),
                )}
              >
                <h2>محصول مشترک جدید</h2>
                <ProductFields categories={categories} />
                <button className="primary" disabled={busy}>
                  ثبت در کاتالوگ Mercur
                </button>
              </form>
              <div className="admin-grid">
                <form
                  className="card"
                  data-testid="category-form"
                  onSubmit={submit(async (f) =>
                    mutate(
                      {
                        kind: "category",
                        name: f.get("name"),
                        slug: f.get("slug"),
                        parent_id: f.get("parent_id") || null,
                        taxonomy_kind: f.get("taxonomy_kind") || undefined,
                        active: f.get("category_active") === "on",
                      },
                      "دسته ذخیره شد.",
                    ),
                  )}
                >
                  <h2>دسته و زیردسته جدید</h2>
                  <Field name="name" label="نام دسته" />
                  <Field name="slug" label="نشانی دسته (slug)" />
                  <label>
                    دسته والد
                    <select name="parent_id">
                      <option value="">بدون والد</option>
                      {categories.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CategoryGovernance />
                  <button disabled={busy}>ثبت دسته</button>
                </form>
                <form
                  className="card"
                  data-testid="collection-form"
                  onSubmit={submit(async (f) =>
                    mutate(
                      {
                        kind: "collection",
                        ...collectionFields(f),
                        name: f.get("name"),
                        slug: f.get("slug"),
                        product_ids: f.getAll("product_ids"),
                      },
                      "مجموعه ذخیره شد.",
                    ),
                  )}
                >
                  <h2>مجموعه جدید</h2>
                  <Field name="name" label="نام مجموعه" />
                  <Field name="slug" label="نشانی مجموعه (slug)" />
                  <CollectionGovernance managed={managed} />
                  <label>
                    محصولات مجموعه
                    <select name="product_ids" multiple size={5}>
                      {managed.products.map((p: Product) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button disabled={busy}>ثبت مجموعه</button>
                </form>
              </div>
              <details className="card">
                <summary>ویرایش دسته‌ها و مجموعه‌ها</summary>
                {categories.map((c: any) => (
                  <form
                    key={c.id}
                    className="inline-form"
                    onSubmit={submit(async (f) =>
                      mutate({
                        kind: "category",
                        id: c.id,
                        name: f.get("name"),
                        slug: f.get("slug"),
                        parent_id: f.get("parent_id") || null,
                        taxonomy_kind: f.get("taxonomy_kind") || undefined,
                        active: f.get("category_active") === "on",
                      }),
                    )}
                  >
                    <Field name="name" label="نام دسته" value={c.name} />
                    <Field name="slug" label="نشانی دسته" value={c.slug} />
                    <label>
                      والد
                      <select name="parent_id" defaultValue={c.parent_id || ""}>
                        <option value="">بدون والد</option>
                        {categories
                          .filter((x: any) => x.id !== c.id)
                          .map((x: any) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <CategoryGovernance category={c} />
                    <button disabled={busy}>ذخیره دسته</button>
                  </form>
                ))}
                {collections.map((c: any) => (
                  <form
                    key={c.id}
                    className="inline-form"
                    onSubmit={submit(async (f) =>
                      mutate({
                        kind: "collection",
                        ...collectionFields(f),
                        id: c.id,
                        name: f.get("name"),
                        slug: f.get("slug"),
                        product_ids: f.getAll("product_ids"),
                      }),
                    )}
                  >
                    <Field name="name" label="نام مجموعه" value={c.name} />
                    <Field name="slug" label="نشانی مجموعه" value={c.slug} />
                    <CollectionGovernance managed={managed} collection={c} />
                    <label>
                      محصولات
                      <select
                        name="product_ids"
                        multiple
                        defaultValue={c.product_ids || []}
                        size={4}
                      >
                        {managed.products.map((p: Product) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button disabled={busy}>ذخیره مجموعه</button>
                  </form>
                ))}
              </details>
              {managed.taxonomy_review?.some(
                (r: any) => r.status === "pending",
              ) && (
                <p className="notice">
                  محصولات دارای طبقه‌بندی قدیمی تا بازبینی در نشانی قبلی
                  می‌مانند؛ انتشار مجدد و QR مشتری نیازمند تکمیل سه سطح است.
                </p>
              )}
              {managed.products.map((p: Product) => (
                <details
                  className="card product-editor"
                  key={p.id}
                  data-product-id={p.id}
                >
                  <summary>
                    {p.title} · {p.published ? "منتشر شده" : "پیش‌نویس"} ·{" "}
                    {p.active ? "فعال" : "غیرفعال"}
                  </summary>
                  <form
                    className="form-grid"
                    onSubmit={submit(async (f) =>
                      mutate(
                        { kind: "product", id: p.id, ...productData(f) },
                        "محصول ویرایش شد.",
                      ),
                    )}
                  >
                    <ProductFields p={p} categories={categories} />
                    <button className="primary" disabled={busy}>
                      ذخیره محصول
                    </button>
                  </form>
                  <ProductClassification productId={p.id} />
                  <ImageManager product={p} mutate={mutate} />
                </details>
              ))}
            </>
          ) : (
            <form
              className="card form-grid"
              data-testid="product-request-form"
              onSubmit={submit(async (f) =>
                mutate(
                  { kind: "product_request", ...productData(f) },
                  "درخواست محصول برای بررسی مدیر ثبت شد.",
                ),
              )}
            >
              <fieldset disabled={!can("REQUEST_PRODUCT_CREATION")}>
                <h2>درخواست محصول جدید</h2>
                <p>محصول پس از بررسی مدیر به کاتالوگ مشترک اضافه می‌شود.</p>
                <ProductFields categories={categories} request />
                <button className="primary" disabled={busy}>
                  ارسال درخواست محصول
                </button>
              </fieldset>
            </form>
          )}
          <h2>درخواست‌های محصول</h2>
          {!requests.length && (
            <p className="empty">درخواست محصولی ثبت نشده است.</p>
          )}
          {requests.map((r: any) => (
            <article className="card" key={r.id} data-request-id={r.id}>
              <h3>
                {r.title ||
                  r.payload?.title ||
                  r.data?.title ||
                  "درخواست محصول"}
              </h3>
              <p>
                {r.description || r.payload?.description || r.data?.description}
              </p>
              <p>
                {r.supplier_name || r.supplier} ·{" "}
                {r.status === "pending" ? "در انتظار بررسی" : states[r.status]}
              </p>
              {r.reason && <p>دلیل بررسی: {r.reason}</p>}
              {admin && r.status === "pending" && (
                <form
                  onSubmit={submit(async (f) =>
                    mutate(
                      {
                        kind: "review_request",
                        id: r.id,
                        decision: f.get("decision"),
                        category_id: f.get("category_id") || null,
                        reason: f.get("reason"),
                      },
                      "درخواست بررسی شد.",
                    ),
                  )}
                >
                  <RequestClassification
                    categories={categories}
                    initial={r.payload?.category_id}
                    busy={busy}
                  />
                </form>
              )}
            </article>
          ))}
        </>
      )}
      {tab === "suppliers" && admin && (
        <>
          <form
            className="card"
            data-testid="supplier-form"
            onSubmit={submit(async (f) =>
              mutate(
                {
                  kind: "supplier",
                  name: f.get("name"),
                  email: f.get("email") || undefined,
                  password: f.get("password") || undefined,
                },
                "تأمین‌کننده ایجاد شد.",
              ),
            )}
          >
            <h2>تأمین‌کننده جدید</h2>
            <Field name="name" label="نام تأمین‌کننده" />
            <Field
              name="email"
              label="ایمیل حساب تأمین‌کننده (اختیاری)"
              type="email"
              required={false}
            />
            <Field
              name="password"
              label="رمز اولیه حداقل ۱۲ نویسه (اختیاری)"
              type="password"
              required={false}
            />
            <button disabled={busy}>ثبت تأمین‌کننده</button>
            <p className="muted">
              تأمین‌کنندگان می‌توانند از صفحه عضویت حساب خود را ثبت کنند. حساب
              مدیر فقط با ابزار امن ایجاد می‌شود.
            </p>
          </form>
          {managed.suppliers.map((s: any) => (
            <article className="card" key={s.id} data-supplier-id={s.id}>
              <h2>{s.name}</h2>
              <p>
                {s.status === "pending"
                  ? "در انتظار تأیید"
                  : states[s.status] || s.status}{" "}
                · {s.active ? "فعال" : "غیرفعال"}
              </p>
              <code>{s.id}</code>
              <div className="actions">
                {s.status !== "approved" && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        mutate(
                          {
                            kind: "supplier_state",
                            id: s.id,
                            status: "approved",
                            active: true,
                          },
                          "تأمین‌کننده تأیید شد.",
                        ),
                      )
                    }
                  >
                    تأیید تأمین‌کننده
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      mutate({
                        kind: "supplier_state",
                        id: s.id,
                        status: s.status,
                        active: !s.active,
                      }),
                    )
                  }
                >
                  {s.active ? "غیرفعال کردن" : "فعال کردن"}
                </button>
                {s.status !== "rejected" && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        mutate({
                          kind: "supplier_state",
                          id: s.id,
                          status: "rejected",
                          active: false,
                        }),
                      )
                    }
                  >
                    رد تأمین‌کننده
                  </button>
                )}
              </div>
            </article>
          ))}
        </>
      )}
      {tab === "settings" && admin && (
        <form
          className="card form-grid"
          data-testid="rate-form"
          key={managed.rate.version}
          onSubmit={submit(async (f) =>
            mutate(
              {
                kind: "rate",
                rate_irr: num(f, "rate"),
                tax_bps: num(f, "tax"),
                fee_irr: num(f, "fee_irr"),
                rounding_step: num(f, "rounding_step"),
                distribution_bps: num(f, "distribution_bps"),
                retail_bps: num(f, "retail_bps"),
                taxable_components: f.getAll("taxable_components"),
              },
              "نرخ ذخیره شد.",
            ),
          )}
        >
          <h2>نرخ و مالیات</h2>
          <p>
            منبع: دستی. این مقادیر نمونه تجاری هستند و پیش از فروش واقعی نیازمند
            تأیید مالک و بررسی حقوقی‌اند.
          </p>
          <Field
            name="rate"
            label="ریال / گرم"
            type="number"
            min={1}
            value={managed.rate.rate_irr}
          />
          <Field
            name="tax"
            label="مالیات (bps)"
            type="number"
            min={0}
            max={10000}
            value={managed.rate.tax_bps}
          />
          <Field
            name="fee_irr"
            label="هزینه ثابت ریال"
            type="number"
            min={0}
            value={managed.rate.fee_irr || 0}
          />
          <Field
            name="rounding_step"
            label="گام گرد کردن ریال"
            type="number"
            min={1}
            value={managed.rate.rounding_step || 1}
          />
          <Field
            name="distribution_bps"
            label="حاشیه توزیع bps"
            type="number"
            max={10000}
            value={managed.rate.distribution_bps}
          />
          <Field
            name="retail_bps"
            label="حاشیه خرده‌فروشی bps"
            type="number"
            max={10000}
            value={managed.rate.retail_bps}
          />
          <fieldset>
            <legend>اجزای مشمول VAT؛ تعهد مالیات به ریال ثبت می‌شود</legend>
            {[
              ["gold", "اصل طلا"],
              ["making", "اجرت"],
              ["distribution", "توزیع"],
              ["retail", "خرده‌فروشی"],
            ].map(([k, l]) => (
              <label className="check" key={k}>
                <input
                  type="checkbox"
                  name="taxable_components"
                  value={k}
                  defaultChecked={managed.rate.taxable_components?.includes(k)}
                />
                {l}
              </label>
            ))}
          </fieldset>
          <p>
            همه درصدها به‌صورت جمعی بر پایه مشترک وزن طلا محاسبه می‌شوند. نسخه
            سیاست: {managed.rate.pricing_policy_id}
          </p>
          <button className="primary" disabled={busy}>
            ذخیره نرخ
          </button>
        </form>
      )}
      {tab === "audit" && admin && (
        <div className="card">
          <h2>گزارش تغییرات و عملیات</h2>
          <p>تغییرات موجودی، سفارش و پرداخت در دفتر دیدار ثبت می‌شوند.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>عملیات</th>
                  <th>عامل</th>
                  <th>جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {(managed.audits || managed.audit || []).map((a: any) => (
                  <tr key={a.id}>
                    <td>{date(a.created_at)}</td>
                    <td dir="ltr">{a.action}</td>
                    <td>
                      <code>{a.actor_id || "سیستم"}</code>
                    </td>
                    <td>
                      <pre>{JSON.stringify(a.details, null, 2)}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
function ImageManager({
  product: p,
  mutate,
}: {
  product: Product;
  mutate: (d: any, s?: string) => Promise<void>;
}) {
  const { run, busy } = useDidar();
  return (
    <div className="image-manager">
      <h3>تصاویر واقعی محصول</h3>
      <p className="muted">
        فقط تصویر واقعی و مجاز بارگذاری کنید. PNG، JPEG یا WebP تا ۷۶۸ کیلوبایت؛
        حداکثر ۱۰ تصویر.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(async () => {
            const file = f.get("file") as File;
            if (!file || !file.size) throw new Error("تصویر را انتخاب کنید.");
            if (
              file.size > 768 * 1024 ||
              !["image/png", "image/jpeg", "image/webp"].includes(file.type)
            )
              throw new Error("فرمت یا اندازه تصویر مجاز نیست.");
            const data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve(String(reader.result).split(",")[1]);
              reader.onerror = () =>
                reject(new Error("خواندن تصویر ممکن نشد."));
              reader.readAsDataURL(file);
            });
            await mutate(
              {
                kind: "image_upload",
                product_id: p.id,
                data,
                mime_type: file.type,
                alt: f.get("alt"),
              },
              "تصویر بارگذاری شد.",
            );
          });
        }}
      >
        <label>
          فایل تصویر
          <input
            aria-label={"بارگذاری تصاویر " + p.title}
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp"
            required
          />
        </label>
        <Field name="alt" label="توضیح تصویر" />
        <button disabled={busy}>بارگذاری تصویر</button>
      </form>
      <div className="image-grid">
        {p.images?.map((im) => (
          <div className="card" key={im.id}>
            <ImageAsset
              src={im.url}
              alt={im.alt || p.title}
              privateImage={p.active === false || p.published === false}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  mutate(
                    {
                      kind: "image_update",
                      id: im.id,
                      alt: f.get("alt"),
                      position: num(f, "position"),
                    },
                    "تصویر ویرایش شد.",
                  ),
                );
              }}
            >
              <Field name="alt" label="توضیح تصویر" value={im.alt} />
              <Field
                name="position"
                label="ترتیب تصویر"
                type="number"
                min={0}
                max={99}
                value={im.position}
              />
              <button disabled={busy}>ذخیره تصویر</button>
            </form>
            <button
              disabled={busy}
              onClick={() =>
                run(() =>
                  mutate({ kind: "image_delete", id: im.id }, "تصویر حذف شد."),
                )
              }
            >
              حذف تصویر
            </button>
          </div>
        ))}
      </div>
      {!p.images?.length && (
        <p>هنوز تصویری برای این محصول بارگذاری نشده است.</p>
      )}
    </div>
  );
}

function GoldFields({
  offer,
  disabled = false,
}: {
  offer?: Offer;
  disabled?: boolean;
}) {
  return (
    <>
      <label>
        روش اجرت طلایی
        <select
          name="making_mode"
          defaultValue={offer ? offer.making_mode || "" : "percent"}
          disabled={disabled}
        >
          {offer && !offer.making_mode && (
            <option value="">حفظ اجرت تاریخی تا بازبینی</option>
          )}
          <option value="percent">درصد وزن پایه</option>
          <option value="fixed_gold">وزن معادل ثابت برای هر قطعه</option>
        </select>
      </label>
      <Field
        name="making_bps"
        label="اجرت طلایی bps"
        type="number"
        max={10000}
        value={offer?.making_bps ?? 0}
        disabled={disabled}
      />
      <Field
        name="making_weight_mg"
        label="اجرت ثابت معادل ۷۵۰؛ میلی‌گرم"
        type="number"
        max={1000000}
        value={offer?.making_weight_mg ?? 0}
        disabled={disabled}
      />
    </>
  );
}
