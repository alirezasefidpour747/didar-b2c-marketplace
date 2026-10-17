"use client";
import { useEffect, useState } from "react";
import { RequireUser, useDidar } from "./store";
import { date, number } from "./locale";
import { Invoice } from "./invoice";

type Mandate = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  version: number;
  mode: "AGENCY" | "DIRECT_DIDAR";
  contract_id?: string;
  effective_at: string;
  expires_at: string;
  rounding_limit_irr?: number;
  reason?: string;
  approved: boolean | null;
  revoked: boolean;
  allocation_rule?: string;
  beneficiaries?: Record<string, string>;
};
type AgencyData = {
  enabled: boolean;
  mandates: Mandate[];
  suppliers: { id: string; name: string }[];
  contracts: {
    id: string;
    supplier_id: string;
    version: number;
    approved: boolean | null;
    mode: string;
    ownership: string;
  }[];
};
const modeLabel = (mode: string) =>
  mode === "AGENCY" ? "فروش نیابتی" : "فروش مستقیم دیدار";
function status(
  m: Pick<Mandate, "revoked" | "approved" | "effective_at" | "expires_at">,
) {
  if (m.revoked) return "لغوشده";
  if (m.approved === false) return "ردشده";
  if (m.approved === null) return "در انتظار تأیید";
  if (Date.parse(m.expires_at) <= Date.now()) return "منقضی‌شده";
  if (Date.parse(m.effective_at) > Date.now()) return "تأییدشده؛ شروع در آینده";
  return "تأییدشده؛ در بازه اثر";
}

export function Agency() {
  return (
    <RequireUser>
      <AgencyContent />
    </RequireUser>
  );
}
function AgencyContent() {
  const { api, user, run, busy } = useDidar();
  const [data, setData] = useState<AgencyData | null>(null);
  const [error, setError] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceDraft, setInvoiceDraft] = useState("");
  const [beneficiaries, setBeneficiaries] = useState<
    { code: string; supplier_id: string }[]
  >([]);
  const admin = user?.role === "admin";
  const load = async () => {
    const next = await api("agency");
    setData(next);
    setError("");
  };
  useEffect(() => {
    let active = true;
    api("agency")
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const send = async (body: Record<string, unknown>) => {
    await api("agency", body);
    await load();
  };
  const selectedSupplier = supplierId || data?.suppliers[0]?.id || "";
  return (
    <section dir="rtl">
      <h1>مجوز فروش و اسناد نیابتی</h1>
      <p>
        SANDBOX_PROVISIONAL · مجوز نسخه‌دار فروش، نقش فروشنده و سند آزمایشی؛
        بدون پرداخت واقعی یا تأیید قانونی.
      </p>
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={() => run(load)}>
        تازه‌سازی مجوزها
      </button>
      {!data && !error && <p role="status">در حال دریافت مجوزها…</p>}
      {data && (
        <>
          {!data.enabled && (
            <p role="status">
              قابلیت نقش فروش جدید در این محیط غیرفعال است؛ هیچ مجوز یا معامله
              جدیدی از این بخش ایجاد نمی‌شود.
            </p>
          )}
          {!admin && (
            <p>
              این بخش فقط مجوزها و اسناد مجاز کسب‌وکار انتخاب‌شده را نمایش
              می‌دهد. ایجاد، تأیید و لغو در اختیار مدیریت مرکزی است.
            </p>
          )}
          {admin && data.enabled && (
            <section>
              <h2>درخواست مجوز نسخه جدید</h2>
              <p>
                فروشنده، قرارداد تأییدشده و بازه اثر باید مستند باشند. نام
                ویترین و ورود فروشنده به پنل، تعیین‌کننده فروشنده معامله نیستند.
              </p>
              <p>
                قاعده تخصیص مصوب COMPONENTS_V1: تعهد دقیق فروشنده طبق نسخه
                قرارداد حفظ می‌شود؛ توزیع، خرده‌فروشی، کارمزد و گردکردن مصوب به
                دیدار تعلق دارند. اختلاف تبدیل باید در حد مستند گردکردن باشد؛
                مبلغ نامعلوم رد می‌شود.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(async () => {
                    if (
                      new Set(beneficiaries.map((b) => b.code)).size !==
                      beneficiaries.length
                    )
                      throw Error("کد ذی‌نفع تکراری است.");
                    await send({
                      operation: "mandate_request",
                      supplier_id: selectedSupplier,
                      mode: form.get("mode"),
                      contract_id: form.get("contract_id"),
                      effective_at: new Date(
                        String(form.get("effective_at")),
                      ).toISOString(),
                      expires_at: new Date(
                        String(form.get("expires_at")),
                      ).toISOString(),
                      allocation_rule: "COMPONENTS_V1",
                      beneficiaries: Object.fromEntries(
                        beneficiaries.map((b) => [b.code, b.supplier_id]),
                      ),
                      rounding_limit_irr: Number(
                        form.get("rounding_limit_irr"),
                      ),
                      reason: form.get("reason"),
                    });
                  });
                }}
              >
                <label>
                  کسب‌وکار / منبع موجودی
                  <select
                    required
                    value={selectedSupplier}
                    onChange={(event) => setSupplierId(event.target.value)}
                  >
                    {data.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  نقش فروش
                  <select name="mode" required>
                    <option value="AGENCY">
                      فروش نیابتی؛ کسب‌وکار فروشنده است
                    </option>
                    <option value="DIRECT_DIDAR">
                      فروش مستقیم؛ دیدار فروشنده است
                    </option>
                  </select>
                </label>
                <label>
                  نسخه قرارداد مصوب
                  <select
                    name="contract_id"
                    required
                    key={selectedSupplier}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      قرارداد تأییدشده را انتخاب کنید
                    </option>
                    {data.contracts
                      .filter(
                        (contract) =>
                          contract.supplier_id === selectedSupplier &&
                          contract.approved === true,
                      )
                      .map((contract) => (
                        <option value={contract.id} key={contract.id}>
                          نسخه {number(contract.version)} · {contract.mode} ·{" "}
                          {contract.ownership}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  شروع اثر
                  <input type="datetime-local" name="effective_at" required />
                </label>
                <label>
                  پایان اثر
                  <input type="datetime-local" name="expires_at" required />
                </label>
                <label>
                  حد مجاز گردکردن مصوب؛ ریال
                  <input
                    type="number"
                    name="rounding_limit_irr"
                    min={0}
                    max={10000}
                    step={1}
                    required
                    defaultValue={0}
                  />
                </label>
                <fieldset>
                  <legend>
                    ذی‌نفعان خدمات ثالث؛ فقط طبق کد قاعده مصوب پروفایل
                  </legend>
                  <p>
                    این فهرست نرخ یا کارمزد تازه ایجاد نمی‌کند. اگر خدمت ثالث
                    ذی‌نفع مصوب نداشته باشد، معامله رد می‌شود.
                  </p>
                  {beneficiaries.map((beneficiary, index) => (
                    <div key={index} className="form-grid">
                      <label>
                        کد قاعده خدمت {number(index + 1)}
                        <input
                          required
                          maxLength={100}
                          pattern="[a-zA-Z0-9_-]+"
                          value={beneficiary.code}
                          onChange={(event) =>
                            setBeneficiaries((rows) =>
                              rows.map((row, i) =>
                                i === index
                                  ? { ...row, code: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        کسب‌وکار ذی‌نفع {number(index + 1)}
                        <select
                          required
                          value={beneficiary.supplier_id}
                          onChange={(event) =>
                            setBeneficiaries((rows) =>
                              rows.map((row, i) =>
                                i === index
                                  ? { ...row, supplier_id: event.target.value }
                                  : row,
                              ),
                            )
                          }
                        >
                          <option value="" disabled>
                            انتخاب ذی‌نفع
                          </option>
                          {data.suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setBeneficiaries((rows) =>
                            rows.filter((_, i) => i !== index),
                          )
                        }
                      >
                        حذف ذی‌نفع {number(index + 1)}
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={beneficiaries.length >= 50}
                    onClick={() =>
                      setBeneficiaries((rows) => [
                        ...rows,
                        { code: "", supplier_id: "" },
                      ])
                    }
                  >
                    افزودن ذی‌نفع خدمت ثالث
                  </button>
                </fieldset>
                <label>
                  مرجع توافق و دلیل درخواست
                  <textarea name="reason" required maxLength={1000} />
                </label>
                <button disabled={busy || !selectedSupplier}>
                  ثبت درخواست مجوز
                </button>
              </form>
            </section>
          )}
          <section>
            <h2>نسخه‌ها و تصمیم‌های مجوز</h2>
            {!data.mandates.length && (
              <p>مجوزی در دامنه دسترسی شما ثبت نشده است.</p>
            )}
            {data.mandates.map((mandate) => (
              <article
                className="card"
                key={mandate.id}
                data-mandate-id={mandate.id}
              >
                <h3>
                  {mandate.supplier_name} · نسخه {number(mandate.version)}
                </h3>
                <p>
                  {modeLabel(mandate.mode)} · <strong>{status(mandate)}</strong>
                </p>
                <p>
                  مؤثر از {date(mandate.effective_at)} تا{" "}
                  {date(mandate.expires_at)}
                </p>
                {mandate.contract_id && (
                  <p>
                    مرجع قرارداد: <code>{mandate.contract_id}</code> · حد
                    گردکردن {number(mandate.rounding_limit_irr || 0)} ریال ·
                    قاعده {mandate.allocation_rule}
                  </p>
                )}
                {mandate.reason && <p>{mandate.reason}</p>}
                {mandate.beneficiaries &&
                  Object.entries(mandate.beneficiaries).map(
                    ([code, supplier]) => (
                      <p key={code}>
                        قاعده <code>{code}</code> · ذی‌نفع{" "}
                        {data.suppliers.find((s) => s.id === supplier)?.name ||
                          supplier}
                      </p>
                    ),
                  )}
                {admin &&
                  data.enabled &&
                  !mandate.revoked &&
                  mandate.approved === null && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void run(() =>
                          send({
                            operation: "mandate_review",
                            mandate_id: mandate.id,
                            approved: form.get("decision") === "approve",
                            reason: form.get("reason"),
                          }),
                        );
                      }}
                    >
                      <label>
                        تصمیم بررسی
                        <select name="decision">
                          <option value="approve">تأیید</option>
                          <option value="reject">رد</option>
                        </select>
                      </label>
                      <label>
                        مستند تصمیم
                        <textarea name="reason" required maxLength={1000} />
                      </label>
                      <button disabled={busy}>ثبت بررسی مجوز</button>
                    </form>
                  )}
                {admin &&
                  data.enabled &&
                  !mandate.revoked &&
                  mandate.approved === true && (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = new FormData(event.currentTarget);
                        void run(() =>
                          send({
                            operation: "mandate_revoke",
                            mandate_id: mandate.id,
                            reason: form.get("reason"),
                          }),
                        );
                      }}
                    >
                      <label>
                        دلیل لغو مجوز
                        <textarea name="reason" required maxLength={1000} />
                      </label>
                      <button disabled={busy}>
                        لغو مجوز برای معاملات جدید
                      </button>
                    </form>
                  )}
              </article>
            ))}
          </section>
        </>
      )}
      {data && <CurationSection enabled={data.enabled} admin={admin} />}
      <section>
        <h2>مشاهده سند مجاز سفارش</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setInvoiceId(invoiceDraft.trim());
          }}
        >
          <label>
            شناسه سفارش
            <input
              required
              value={invoiceDraft}
              onChange={(event) => setInvoiceDraft(event.target.value)}
              maxLength={100}
            />
          </label>
          <button>دریافت سند سفارش</button>
        </form>
        {invoiceId && <Invoice orderId={invoiceId} />}
      </section>
    </section>
  );
}

type CurationAgreement = {
  id: string;
  store_supplier_id: string;
  seller_supplier_id: string;
  offer_id: string;
  store_name?: string;
  seller_name?: string;
  title?: string;
  version: number;
  effective_at: string;
  expires_at: string;
  approved: boolean | null;
  revoked: boolean;
  reason: string;
};
type CurationData = {
  agreements: CurationAgreement[];
  suppliers: { id: string; name: string }[];
  offers: { id: string; supplier_id: string; title?: string }[];
};
function CurationSection({
  enabled,
  admin,
}: {
  enabled: boolean;
  admin: boolean;
}) {
  const { api, run, busy } = useDidar();
  const [data, setData] = useState<CurationData | null>(null);
  const [error, setError] = useState("");
  const [storeId, setStoreId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const load = async () => {
    setData(await api("curation"));
    setError("");
  };
  useEffect(() => {
    let active = true;
    api("curation")
      .then((next) => {
        if (active) setData(next);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const send = async (body: Record<string, unknown>) => {
    await api("curation", body);
    await load();
  };
  const name = (id: string) =>
    data?.suppliers?.find((supplier) => supplier.id === id)?.name || id;
  return (
    <section aria-label="مجوز گزینش کالای فروشنده دیگر">
      <h2>مجوز گزینش کالای فروشنده دیگر</h2>
      <p>
        ویترین A فقط گزینشگر است؛ B فروشنده واقعی می‌ماند. این مجوز انتقال
        مالکیت، فروش مجدد A یا کارمزد خودکار برای A ایجاد نمی‌کند. هویت قطعه و
        رزرو موجودی مشترک حفظ می‌شود.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">در حال دریافت توافق‌های گزینش…</p>}
      <button disabled={busy} onClick={() => run(load)}>
        تازه‌سازی توافق‌های گزینش
      </button>
      {admin && enabled && data && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(() =>
              send({
                operation: "request",
                store_supplier_id: storeId,
                seller_supplier_id: sellerId,
                offer_id: form.get("offer_id"),
                effective_at: new Date(
                  String(form.get("effective_at")),
                ).toISOString(),
                expires_at: new Date(
                  String(form.get("expires_at")),
                ).toISOString(),
                reason: form.get("reason"),
              }),
            );
          }}
        >
          <h3>درخواست توافق گزینش</h3>
          <label>
            کسب‌وکار ویترین گزینشگر
            <select
              required
              value={storeId}
              onChange={(event) => {
                setStoreId(event.target.value);
                setSellerId("");
              }}
            >
              <option value="" disabled>
                انتخاب ویترین A
              </option>
              {data.suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            فروشنده واقعی کالای گزینش‌شده
            <select
              required
              value={sellerId}
              onChange={(event) => setSellerId(event.target.value)}
            >
              <option value="" disabled>
                انتخاب فروشنده B
              </option>
              {data.suppliers
                .filter((supplier) => supplier.id !== storeId)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            عرضه مجاز فروشنده B
            <select name="offer_id" required key={sellerId} defaultValue="">
              <option value="" disabled>
                انتخاب عرضه
              </option>
              {data.offers
                .filter((offer) => offer.supplier_id === sellerId)
                .map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.title || offer.id}
                  </option>
                ))}
            </select>
          </label>
          <label>
            شروع اثر توافق گزینش
            <input type="datetime-local" name="effective_at" required />
          </label>
          <label>
            پایان اثر توافق گزینش
            <input type="datetime-local" name="expires_at" required />
          </label>
          <label>
            مرجع و دلیل توافق گزینش
            <textarea name="reason" required maxLength={1000} />
          </label>
          <button disabled={busy || !storeId || !sellerId}>
            ثبت درخواست توافق گزینش
          </button>
        </form>
      )}
      {data && !data.agreements.length && (
        <p>توافق گزینشی در دامنه دسترسی شما ثبت نشده است.</p>
      )}
      {data?.agreements.map((agreement) => (
        <article
          className="card"
          key={agreement.id}
          data-curation-id={agreement.id}
        >
          <h3>توافق گزینش · نسخه {number(agreement.version)}</h3>
          <p>
            ویترین گزینشگر:{" "}
            {agreement.store_name || name(agreement.store_supplier_id)} ·
            فروشنده واقعی:{" "}
            {agreement.seller_name || name(agreement.seller_supplier_id)}
          </p>
          <p>
            عرضه: {agreement.title || agreement.offer_id} · {status(agreement)}
          </p>
          <p>
            از {date(agreement.effective_at)} تا {date(agreement.expires_at)}
          </p>
          {agreement.reason && <p>{agreement.reason}</p>}
          {admin &&
            enabled &&
            !agreement.revoked &&
            agreement.approved === null && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(() =>
                    send({
                      operation: "review",
                      agreement_id: agreement.id,
                      approved: form.get("decision") === "approve",
                      reason: form.get("reason"),
                    }),
                  );
                }}
              >
                <label>
                  تصمیم بررسی توافق گزینش
                  <select name="decision">
                    <option value="approve">تأیید</option>
                    <option value="reject">رد</option>
                  </select>
                </label>
                <label>
                  مستند بررسی توافق گزینش
                  <textarea name="reason" required maxLength={1000} />
                </label>
                <button disabled={busy}>ثبت بررسی توافق گزینش</button>
              </form>
            )}
          {admin &&
            enabled &&
            !agreement.revoked &&
            agreement.approved === true && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(() =>
                    send({
                      operation: "revoke",
                      agreement_id: agreement.id,
                      reason: form.get("reason"),
                    }),
                  );
                }}
              >
                <label>
                  دلیل لغو توافق گزینش
                  <textarea name="reason" required maxLength={1000} />
                </label>
                <button disabled={busy}>لغو توافق گزینش</button>
              </form>
            )}
        </article>
      ))}
    </section>
  );
}
