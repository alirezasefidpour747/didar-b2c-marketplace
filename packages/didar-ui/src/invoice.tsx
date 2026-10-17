"use client";
import { useEffect, useState } from "react";
import { RequireUser, useDidar } from "./store";
import { date, money, number, weight } from "./locale";

export type SaleRole = {
  schema_version: number;
  mode: "AGENCY" | "DIRECT_DIDAR";
  seller: { id: string; name: string };
  issuer: string;
  collector: string;
  on_behalf: boolean;
  mandate_version?: number;
};

/** Customer-safe projection only; financial allocations are never supplied by this view. */
export function SaleRoleDisclosure({
  role,
  curation,
}: {
  role?: SaleRole | null;
  curation?: { role: string; curator_fee_irr: string } | null;
}) {
  if (!role) return null;
  return (
    <div className="sale-role" data-sale-mode={role.mode}>
      <p>
        فروشنده واقعی: <strong>{role.seller.name}</strong>
      </p>
      <p>
        {role.mode === "AGENCY"
          ? "فروش نیابتی؛ دیدار به نیابت از فروشنده فاکتور صادر می‌کند و وجه را دریافت می‌کند."
          : "فروش مستقیم دیدار؛ دیدار فروشنده و دریافت‌کننده وجه است."}
      </p>
      {role.mandate_version !== undefined && (
        <small>نسخه مجوز فروش: {number(role.mandate_version)}</small>
      )}
      {curation?.role === "CURATOR_ONLY" && (
        <p data-curation-role="CURATOR_ONLY">
          این ویترین فقط گزینشگر کالاست؛ فروشنده واقعی همان فروشنده فوق است.
          هزینه افزوده گزینشگر: {money(curation.curator_fee_irr)}. این گزینش به
          معنی فروش مجدد توسط صاحب ویترین نیست.
        </p>
      )}
    </div>
  );
}

type InvoiceDocument = {
  id: string;
  number: string;
  kind: "INVOICE" | "CREDIT";
  order_id: string;
  original_document_id?: string;
  created_at?: string;
  snapshot: {
    seller: { id: string; name: string };
    issuer: string;
    on_behalf: boolean;
    collector: string;
    basis: string;
    mode?: SaleRole["mode"];
    total_irr: number | string;
    lines: {
      line_id: string;
      sale_event_id?: string;
      title: string;
      quantity: number;
      weight_mg: number;
      uids?: string[];
      price: any;
      payment_method: string;
    }[];
  };
  mode: SaleRole["mode"];
};

export function Invoice({ orderId }: { orderId: string }) {
  return (
    <RequireUser>
      <InvoiceContent orderId={orderId} />
    </RequireUser>
  );
}

/** Native history entry point stays usable without commerce-edit/finance grants. */
export function InvoiceLookup({
  initialOrderId = "",
}: {
  initialOrderId?: string;
}) {
  const [draft, setDraft] = useState(initialOrderId);
  const [orderId, setOrderId] = useState(initialOrderId);
  return (
    <RequireUser>
      <section dir="rtl">
        <h1>اسناد مجاز فروشنده · فقط خواندنی</h1>
        <p>
          اسناد مجاز سفارش‌های قبلی با توقف فعالیت تجاری تغییر نمی‌کنند. ایجاد
          معامله یا تسویه از این بخش ممکن نیست.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setOrderId(draft.trim());
          }}
        >
          <label>
            شناسه سفارش
            <input
              required
              maxLength={100}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button>دریافت سند سفارش</button>
        </form>
        {orderId && <Invoice orderId={orderId} />}
      </section>
    </RequireUser>
  );
}

function InvoiceContent({ orderId }: { orderId: string }) {
  const { api } = useDidar();
  const [documents, setDocuments] = useState<InvoiceDocument[] | null>(null);
  const [error, setError] = useState("");
  const [classification, setClassification] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setDocuments(null);
    setError("");
    setClassification("");
    api("invoice?order_id=" + encodeURIComponent(orderId))
      .then((d) => {
        if (active) {
          setDocuments(d.documents);
          setClassification(d.classification || "");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "دریافت سند مجاز ممکن نشد؛ مالکیت سفارش و دسترسی را بررسی کنید.",
          );
      });
    return () => {
      active = false;
    };
  }, [api, orderId, attempt]);
  return (
    <section dir="rtl" aria-label="اسناد سفارش">
      <h1>فاکتور و اسناد اصلاحی سفارش</h1>
      <p>
        شناسه سفارش: <code>{orderId}</code>
      </p>
      <p role="note">
        سند آزمایشی و موقت · SANDBOX_PROVISIONAL؛ فاقد ارسال مالیاتی یا تأیید
        قانونی.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : documents === null ? (
        <p role="status">در حال دریافت اسناد…</p>
      ) : null}
      <button onClick={() => setAttempt((v) => v + 1)}>تازه‌سازی اسناد</button>
      {documents?.length === 0 && (
        <p role="status">
          {classification === "PENDING"
            ? "سفارش در انتظار پرداخت است؛ فاکتور فروش پس از پرداخت تأییدشده صادر می‌شود."
            : "برای این سفارش سند نقش فروش جدید ثبت نشده است. سابقه تاریخی در طرح نقش فروش جدید طبقه‌بندی نشده و بازنویسی نمی‌شود."}
        </p>
      )}
      {documents?.map((document) => (
        <article
          className="card invoice-document"
          key={document.id}
          data-document-id={document.id}
        >
          <h2>
            {document.kind === "CREDIT" ? "سند اصلاحی / اعتبار" : "فاکتور فروش"}{" "}
            · {document.number}
          </h2>
          {document.created_at && <p>{date(document.created_at)}</p>}
          {document.original_document_id && (
            <p>
              مرجع سند اصلی: <code>{document.original_document_id}</code>
            </p>
          )}
          <SaleRoleDisclosure
            role={{
              schema_version: 1,
              mode: document.mode,
              seller: document.snapshot.seller,
              issuer: document.snapshot.issuer,
              collector: document.snapshot.collector,
              on_behalf: document.snapshot.on_behalf,
            }}
          />
          <p>
            صادرکننده و دریافت‌کننده وجه: دیدار
            {document.snapshot.on_behalf ? "، به نیابت از فروشنده فوق" : ""}
          </p>
          {document.snapshot.lines.map((line) => (
            <div
              className="order-line"
              key={
                line.sale_event_id ||
                line.line_id + ":" + (line.uids || []).join(":")
              }
            >
              <h3>{line.title}</h3>
              <p>
                {number(line.quantity)} قطعه · وزن هر قطعه{" "}
                {weight(line.weight_mg)} ·{" "}
                {line.payment_method === "CREDIT"
                  ? "قیمت اعتباری"
                  : "قیمت نقدی"}
              </p>
              <p>
                شناسه‌های دائمی:{" "}
                {(line.uids || []).map((uid) => (
                  <code key={uid}>{uid} </code>
                ))}
              </p>
              <details className="price-breakdown">
                <summary>اجزای قیمت ردیف به ریال</summary>
                <dl>
                  {(
                    [
                      ["metal_irr", "اصل طلا"],
                      ["labor_irr", "اجرت"],
                      ["distribution_irr", "توزیع"],
                      ["retail_irr", "خرده‌فروشی"],
                      ["credit_irr", "عملیات اعتباری"],
                      ["tax_irr", "مالیات"],
                      ["fee_irr", "هزینه"],
                      ["rounding_irr", "گردکردن"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{money(line.price[key] || 0)}</dd>
                    </div>
                  ))}
                </dl>
                <p>جمع این ردیف: {money(line.price.total_irr)}</p>
              </details>
            </div>
          ))}
          <strong>جمع سند: {money(document.snapshot.total_irr)}</strong>
          <p>
            این سند از اطلاعات تثبیت‌شده سفارش خوانده می‌شود؛ ویرایش مجوزهای
            جاری، سند پرداخت‌شده را تغییر نمی‌دهد.
          </p>
        </article>
      ))}
    </section>
  );
}
