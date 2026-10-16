'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { RequireUser, useDidar } from './store'
import { FinanceField, formValues } from './finance'
import { date, number } from './locale'
const checks: Record<string, string> = {
  stock_cache_mismatches: 'اختلاف تعداد قطعات با موجودی قابل فروش',
  unbalanced_instruments: 'اسناد نامتوازن در هر واحد',
  negative_wallet_balances: 'مانده منفی غیرمجاز کیف پول',
  purchase_overallocations: 'تخصیص بیش از خرید',
  missing_sale_journals: 'فروش فاقد سند مالی',
  duplicate_close_sources: 'منبع تکراری خروجی حسابداری',
}
export function Acceptance() {
  return (
    <RequireUser roles={['admin', 'supplier']}>
      <Content />
    </RequireUser>
  )
}
function Content() {
  const { api, user, run, busy, setMessage } = useDidar(),
    [data, setData] = useState<any>(null)
  const load = async () => setData(await api('acceptance'))
  useEffect(() => {
    let active = true
    void api('acceptance')
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
  if (!data) return <p>در حال تطبیق داده‌های واقعی برنامه…</p>
  return (
    <main dir="rtl" className="container">
      <h1>پذیرش یکپارچه مالی دیدار</h1>
      <p>
        آزمون انسانی مک و RFID واقعی هنوز انجام نشده‌اند. نگاشت واقعی ته‌حساب تا
        دریافت مشخصات مسدود است؛ عملیات واقعی غیرفعال است.
      </p>
      <nav>
        <Link href="/manage/finance">قراردادها</Link> ·{' '}
        <Link href="/manage/treasury">خزانه</Link> ·{' '}
        <Link href="/manage/ledger">دفتر</Link> ·{' '}
        <Link href="/account/wallet">کیف پول</Link> ·{' '}
        <Link href="/manage/tahesab">شبیه‌ساز ته‌حساب</Link>
      </nav>
      <h2>
        {data.technical_pass
          ? 'کنترل‌های تطبیق نرم‌افزاری پاس شدند'
          : 'اختلاف نیازمند بررسی است'}
      </h2>
      <p>زمان مشاهده {date(data.observed_at)}</p>
      <ul>
        {Object.entries(data.checks).map(([key, value]) => (
          <li key={key}>
            {checks[key]}: {number(value as number)}
          </li>
        ))}
      </ul>
      <p>
        قطعات محفوظ: {number(data.totals.physical_units)} · رویدادهای مالی:{' '}
        {number(data.totals.financial_events)} · اسناد:{' '}
        {number(data.totals.journals)}
      </p>
      <p>
        فروش موجودی متعلق به دیدار بدون سند بهای تاریخی:{' '}
        {number(data.totals.unvalued_owned_sales)}؛ نیازمند بررسی حرفه‌ای و
        مستندات، بدون جعل بهای گذشته.
      </p>
      <button disabled={busy} onClick={() => void run(load)}>
        تازه‌سازی تطبیق
      </button>
      {user?.role === 'admin' && (
        <section>
          <h2>ثبت گزارش تغییرناپذیر کنترل‌ها</h2>
          <p>
            شناسه نسخه را از خروجی git rev-parse HEAD وارد کنید؛ این فقط مرجع
            اعلام‌شده مدیر است و تأیید خودکار کد یا پذیرش انسانی نیست.
          </p>
          <form
            onSubmit={(e) => {
              const f = formValues(e)
              void run(async () => {
                await api('acceptance', { ...f, operation: 'checkpoint' })
                await load()
              })
            }}
          >
            <FinanceField
              name="reviewed_revision"
              label="شناسه کامل نسخه بررسی‌شده؛ ۴۰ نویسه هگز"
            />
            <button disabled={busy}>ثبت گزارش کنترل‌های نرم‌افزاری</button>
          </form>
          {data.checkpoints.map((c: any) => (
            <article key={c.id}>
              <p>
                {date(c.created_at)} · {c.reviewed_revision}
              </p>
            </article>
          ))}
        </section>
      )}
    </main>
  )
}
