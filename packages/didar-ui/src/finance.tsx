'use client'
import { Link } from './store'
import { useEffect, useState, type FormEvent } from 'react'
import { RequireUser, useDidar } from './store'
import { date, number } from './locale'
const labels: Record<string, string> = {
  GOLD_ONLY: 'فقط طلا',
  RIAL_ONLY: 'فقط ریال',
  MIXED: 'ترکیبی',
  CONSIGNMENT: 'امانی تأمین‌کننده',
  BUY_TO_RESELL: 'خرید برای فروش مجدد',
  DIDAR_OWNED: 'موجودی متعلق به دیدار',
  SALE_EXPOSURE: 'تعهد ناشی از پرداخت تأییدشده',
  REFUND: 'برگشت تعهد؛ استرداد آزمایشی',
  INTAKE_MEMO: 'ثبت امانی پذیرش',
  INTAKE_RECEIPT: 'ثبت پذیرش مالکیتی',
  JEWELRY_VALUATION: 'بهای مستند زیورآلات',
  PHYSICAL_RETURN_MEMO: 'بازگشت فیزیکی امانی',
  REQUEST_APPROVED: 'تأیید درخواست خرید',
  PURCHASE: 'خرید دستی آزمایشی',
  PURCHASE_APPROVED: 'تأیید خرید',
  ALLOCATION: 'تخصیص خرید به تعهد',
  TITLE_TRANSFER: 'انتقال مالکیت',
  PHYSICAL_HANDOVER: 'تأیید وضعیت فیزیکی',
  GOLD_SETTLEMENT: 'تسویه طلای آزمایشی',
  RIAL_SETTLEMENT: 'تسویه ریالی آزمایشی',
  FACT_REVERSED: 'برگشت ثبت',
  SETTLEMENT_REVERSED: 'برگشت تسویه',
  PROCUREMENT_ASSIGNED: 'سهم خرید ثبت‌شده برای تأمین‌کننده',
  PROCUREMENT_ASSIGNMENT_REVERSED: 'برگشت سهم خرید',
  WALLET_FUND: 'واریز آزمایشی کیف پول',
  WALLET_RELEASE: 'آزادسازی واریز',
  WALLET_RESERVE: 'رزرو کیف پول',
  WALLET_UNRESERVE: 'آزادسازی رزرو',
  WALLET_PLEDGE: 'وثیقه کیف پول',
  WALLET_UNPLEDGE: 'آزادسازی وثیقه',
  WALLET_TRANSFER: 'انتقال داخلی کیف پول',
  PAYABLE_TO_WALLET: 'انتقال تعهد به کیف پول',
}
export function FinanceField({
  name,
  label,
  type = 'text',
  value,
  required = true,
}: {
  name: string
  label: string
  type?: string
  value?: string | number
  required?: boolean
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' || type === 'datetime-local' ? 1 : undefined}
        maxLength={1000}
      />
    </label>
  )
}
export const formValues = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault()
  return Object.fromEntries(new FormData(e.currentTarget))
}
export function Fine({ value }: { value: string }) {
  const n = BigInt(value || '0'),
    abs = n < BigInt(0) ? -n : n
  const decimal = (scaled: bigint, places: number) =>
    `${n < BigInt(0) ? '-' : ''}${number((scaled / BigInt(10) ** BigInt(places)).toString())}.${(scaled % BigInt(10) ** BigInt(places)).toString().padStart(places, '0')}`
  return (
    <span dir="ltr">
      {decimal(abs, 6)} g fine / {decimal((abs * BigInt(4)) / BigInt(3), 6)} g
      750
    </span>
  )
}
export function Finance() {
  return (
    <RequireUser roles={['admin', 'supplier']}>
      <FinanceContent />
    </RequireUser>
  )
}
function FinanceContent() {
  const { api, user, run, busy, setMessage } = useDidar(),
    [data, setData] = useState<any>(null)
  const load = async () => setData(await api('finance'))
  useEffect(() => {
    let active = true
    void api('finance')
      .then((d) => {
        if (active) setData(d)
      })
      .catch((e) => {
        if (active) setMessage(e.message)
      })
    return () => {
      active = false
    }
  }, [api, setMessage])
  const send = async (body: Record<string, unknown>) => {
    await api('finance', body)
    await load()
  }
  if (!data) return <p>در حال دریافت صورت‌حساب…</p>
  return (
    <main dir="rtl" className="container">
      <h1>هسته مالی دیدار</h1>
      <p role="note">
        محیط آزمایشی؛ ثبت دستی شبیه‌سازی‌شده. هیچ معامله، برداشت یا پرداخت بانکی
        واقعی انجام نمی‌شود.
      </p>
      <nav>
        <Link href="/manage/acceptance">کنترل پذیرش یکپارچه</Link> ·{' '}
        <Link href="/manage/ledger">دفتر دوطرفه</Link> ·{' '}
        <Link href="/account/wallet">کیف پول</Link> ·{' '}
        <Link href="/manage/treasury">خزانه و تسویه</Link> ·{' '}
        <Link href="/manage">مدیریت</Link> ·{' '}
        <Link href="/manage/operations">پذیرش و RFID</Link>
      </nav>
      <section>
        <h2>حساب طلا و ریال تأمین‌کنندگان</h2>
        <p>
          طلا به میکروگرم خالص نگهداری می‌شود؛ معادل ۷۵۰ صرفاً نمایش است. ورود
          امانی به‌تنهایی بدهی خرید ایجاد نمی‌کند.
        </p>
        <table>
          <thead>
            <tr>
              <th>تأمین‌کننده</th>
              <th>مانده تعهد طلا</th>
              <th>مانده تعهد ریال</th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a: any) => (
              <tr key={a.supplier_id}>
                <td>
                  {data.suppliers.find((s: any) => s.id === a.supplier_id)
                    ?.name || a.supplier_id}
                </td>
                <td>
                  <Fine value={a.gold_ug} />
                </td>
                <td>{number(a.irr)} ریال</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2>درخواست نسخه جدید قرارداد</h2>
        <form
          onSubmit={(e) => {
            const f = formValues(e)
            void run(() =>
              send({
                ...f,
                operation: 'contract_request',
                gold_bps: Number(f.gold_bps),
                due_days: Number(f.due_days),
                effective_at: new Date(String(f.effective_at)).toISOString(),
              }),
            )
          }}
        >
          <label>
            تأمین‌کننده
            <select name="supplier_id">
              {data.suppliers.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            روش تسویه
            <select name="mode">
              <option value="GOLD_ONLY">فقط طلا</option>
              <option value="RIAL_ONLY">فقط ریال</option>
              <option value="MIXED">ترکیبی</option>
            </select>
          </label>
          <FinanceField
            name="gold_bps"
            label="سهم طلا در حالت ترکیبی؛ مبنای ۱۰۰۰۰"
            type="number"
            value={5000}
          />
          <label>
            نوع مالکیت
            <select name="ownership">
              <option value="CONSIGNMENT">امانی تأمین‌کننده</option>
              <option value="BUY_TO_RESELL">خرید دیدار برای فروش مجدد</option>
              <option value="DIDAR_OWNED">
                موجودی متعلق به دیدار؛ بدون بدهی تأمین‌کننده
              </option>
            </select>
          </label>
          <FinanceField
            name="effective_at"
            label="زمان شروع اثر قرارداد"
            type="datetime-local"
          />
          <FinanceField
            name="due_days"
            label="سررسید؛ روز پس از پرداخت مشتری"
            type="number"
            value={0}
          />
          <FinanceField name="reason" label="شرح و دلیل درخواست" />
          <button disabled={busy}>ثبت درخواست قرارداد</button>
        </form>
      </section>
      <section>
        <h2>نسخه‌های قرارداد و تأیید</h2>
        {data.contracts.map((c: any) => (
          <article key={c.id}>
            <h3>
              نسخه {number(c.version)} ·{' '}
              {data.suppliers.find((s: any) => s.id === c.supplier_id)?.name}
            </h3>
            <p>
              {labels[c.mode]} · {labels[c.ownership]} · سهم طلا{' '}
              {number(c.gold_bps / 100)}٪ · سررسید {number(c.due_days)} روز ·
              مؤثر از {date(c.effective_at)}
            </p>
            <p>
              {c.reason} ·{' '}
              {c.approved === null
                ? 'در انتظار بررسی'
                : c.approved
                  ? 'تأییدشده'
                  : 'ردشده'}
            </p>
            {user?.role === 'admin' && c.approved === null && (
              <form
                onSubmit={(e) => {
                  const f = formValues(e)
                  void run(() =>
                    send({
                      operation: 'contract_review',
                      contract_id: c.id,
                      approved: f.decision === 'approve',
                      reason: f.reason,
                    }),
                  )
                }}
              >
                <label>
                  تصمیم
                  <select name="decision">
                    <option value="approve">تأیید</option>
                    <option value="reject">رد</option>
                  </select>
                </label>
                <FinanceField name="reason" label="دلیل بررسی مدیر" />
                <button disabled={busy}>ثبت بررسی</button>
              </form>
            )}
          </article>
        ))}
      </section>
      <section>
        <h2>گردش تعهدات و سوابق تغییرناپذیر</h2>
        {data.events.map((e: any) => (
          <article key={e.id}>
            <h3>{labels[e.kind] || 'رویداد مالی آزمایشی'}</h3>
            <p>
              {date(e.created_at)} · {e.snapshot.uid || e.order_line_id} ·{' '}
              <Fine value={e.gold_ug} /> · {number(e.irr)} ریال
            </p>
            <p>
              سررسید: {e.snapshot.due_at ? date(e.snapshot.due_at) : '—'} · نسخه
              قرارداد {number(e.snapshot.contract?.version || 0)}
            </p>
            {user?.role === 'admin' &&
              e.kind === 'SALE_EXPOSURE' &&
              !data.events.some(
                (r: any) => r.source_event_id === e.id && r.kind === 'REFUND',
              ) && (
                <form
                  onSubmit={(ev) => {
                    const f = formValues(ev)
                    void run(() =>
                      send({
                        operation: 'refund',
                        event_id: e.id,
                        reason: f.reason,
                      }),
                    )
                  }}
                >
                  <FinanceField
                    name="reason"
                    label="دلیل استرداد کامل آزمایشی؛ پس از دریافت مرجوعی"
                  />
                  <button disabled={busy}>ثبت استرداد آزمایشی</button>
                </form>
              )}
          </article>
        ))}
      </section>
    </main>
  )
}
