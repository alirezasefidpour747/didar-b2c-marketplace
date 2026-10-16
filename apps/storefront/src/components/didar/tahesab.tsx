'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { RequireUser, useDidar } from './store'
import { FinanceField, formValues } from './finance'
import { date } from './locale'
const states: Record<string, string> = {
  pending: 'در انتظار',
  acknowledged: 'تأییدشده در شبیه‌ساز',
  rejected: 'ردشده در شبیه‌ساز',
  transient_error: 'خطای موقت؛ قابل تلاش مجدد',
  missing: 'سند شبیه‌ساز حذف شده؛ نیازمند تطبیق',
  changed: 'سند شبیه‌ساز تغییر کرده؛ نیازمند تطبیق',
}
export function Tahesab() {
  return (
    <RequireUser roles={['admin', 'supplier']}>
      <Content />
    </RequireUser>
  )
}
function Content() {
  const { api, user, run, busy, setMessage } = useDidar(),
    [data, setData] = useState<any>(null)
  const load = async () => setData(await api('tahesab'))
  useEffect(() => {
    let active = true
    void api('tahesab')
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
  const send = async (b: any) => {
    await api('tahesab', b)
    await load()
  }
  if (!data) return <p>در حال دریافت اسناد تجمیعی…</p>
  const supplierOptions = data.suppliers.map((s: any) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ))
  return (
    <main dir="rtl" className="container">
      <h1>ته‌حساب؛ خروجی تجمیعی آزمایشی</h1>
      <p role="note">
        نگاشت واقعی API مسدود تا دریافت مشخصات مالک است (BLOCKED_BY_SPEC). این
        شبیه‌ساز مستقل از قرارداد ته‌حساب است؛ هیچ تماس یا ثبت آنلاین انجام
        نمی‌شود.
      </p>
      <nav>
        <Link href="/manage/ledger">دفتر دوطرفه</Link> ·{' '}
        <Link href="/manage/finance">حساب‌ها</Link>
      </nav>
      {user?.role === 'admin' && (
        <section>
          <h2>نگاشت حساب آزمایشی تأمین‌کننده</h2>
          <form
            onSubmit={(e) => {
              const f = formValues(e)
              void run(() => send({ ...f, operation: 'mapping' }))
            }}
          >
            <label>
              تأمین‌کننده<select name="supplier_id">{supplierOptions}</select>
            </label>
            <FinanceField
              name="merchant_code"
              label="کد حساب تأمین‌کننده در شبیه‌ساز"
            />
            <FinanceField name="gold_code" label="کد حساب طلا در شبیه‌ساز" />
            <FinanceField name="rial_code" label="کد حساب ریال در شبیه‌ساز" />
            <FinanceField
              name="invoice_reference"
              label="مرجع فاکتور تجمیعی تأمین‌کننده"
            />
            <FinanceField
              name="db_alias"
              label="نام مستعار دیتابیس شبیه‌ساز؛ با QA_ شروع شود"
              value="QA_DIDAR"
            />
            <FinanceField name="reason" label="شرح نگاشت آزمایشی" />
            <button disabled={busy}>ثبت نسخه نگاشت آزمایشی</button>
          </form>
        </section>
      )}
      <section>
        <h2>نسخه‌های نگاشت</h2>
        {data.mappings.map((m: any) => (
          <article key={m.id}>
            <p>
              {m.supplier_id} · حساب {m.merchant_code} · مرجع فاکتور{' '}
              {m.invoice_reference} · نسخه {m.version}
            </p>
          </article>
        ))}
      </section>
      {user?.role === 'admin' && (
        <section>
          <h2>بستن دوره و تهیه خروجی بدون ارسال</h2>
          <form
            onSubmit={(e) => {
              const f = formValues(e)
              void run(() =>
                send({
                  ...f,
                  operation: 'close',
                  start_at: new Date(String(f.start_at)).toISOString(),
                  end_at: new Date(String(f.end_at)).toISOString(),
                }),
              )
            }}
          >
            <label>
              تأمین‌کننده دوره
              <select name="supplier_id">{supplierOptions}</select>
            </label>
            <FinanceField
              name="start_at"
              label="ابتدای دوره؛ شامل"
              type="datetime-local"
            />
            <FinanceField
              name="end_at"
              label="انتهای دوره؛ غیرشامل"
              type="datetime-local"
            />
            <button disabled={busy}>تهیه خروجی تجمیعی آزمایشی</button>
          </form>
        </section>
      )}
      <section>
        <h2>بسته‌های خروجی و تطبیق</h2>
        {data.closes.map((c: any) => (
          <article key={c.id}>
            <h3>{c.factor_code}</h3>
            <p>
              {date(c.start_at)} تا {date(c.end_at)} · {states[c.state]} · شماره
              سند شبیه‌ساز {c.document_number || 'هنوز صادر نشده'}
            </p>
            <p>
              اطلاعات خریدار، نشانی، UID و EPC در این بسته وجود ندارد. سرفصل
              دریافت کالا، تعهد، خرید، انتقال، تسویه و برگشت جدا نگه داشته
              می‌شوند.
            </p>
            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                      new Blob([JSON.stringify(c.payload, null, 2)], {
                        type: 'application/json',
                      }),
                    ),
                    a = document.createElement('a')
                  a.href = url
                  a.download = c.factor_code + '.json'
                  a.click()
                  setTimeout(() => URL.revokeObjectURL(url), 1000)
                }}
              >
                دریافت فایل تجمیعی آزمایشی
              </button>
            )}
            {user?.role === 'admin' && (
              <>
                <form
                  onSubmit={(e) => {
                    const f = formValues(e)
                    void run(() =>
                      send({ ...f, operation: 'dispatch', close_id: c.id }),
                    )
                  }}
                >
                  <label>
                    پاسخ شبیه‌ساز
                    <select name="outcome">
                      <option value="success">موفق</option>
                      <option value="transient">خطای موقت</option>
                      <option value="reject">رد قطعی آزمایشی</option>
                    </select>
                  </label>
                  <button disabled={busy}>ثبت در شبیه‌ساز محلی</button>
                </form>
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      send({ operation: 'reconcile', close_id: c.id }),
                    )
                  }
                >
                  تطبیق سند شبیه‌ساز
                </button>
              </>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
