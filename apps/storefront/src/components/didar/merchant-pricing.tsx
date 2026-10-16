'use client'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useDidar } from './store'
import { PricingBreakdown } from './catalog'
import { date, weight } from './locale'
const labels: any = {
  distribution: 'توزیع و عملیات دیدار',
  retail: 'خرده‌فروشی دیدار',
  credit: 'عملیات فروش اعتباری دیدار',
}
const stateLabels: any = {
  draft: 'پیش‌نویس',
  approved: 'تأیید شده',
  rejected: 'رد شده',
}
const atomic = () => ({ mode: 'PERCENT', basis: 'GOLD_BASE_750_IRR', value: 0 })
const defaultRules = () =>
  Object.keys(labels).map((code) => ({
    code,
    label: labels[code],
    component: code,
    ...atomic(),
    scope: 'ITEM',
    payer: 'CUSTOMER',
    recipient: 'DIDAR',
    application_mode: 'ALWAYS',
  }))
function Field({
  name,
  label,
  value = '',
  type = 'text',
  required = true,
  ...rest
}: any) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        maxLength={type === 'text' ? 200 : undefined}
        {...rest}
      />
    </label>
  )
}
function Reason() {
  return <Field name="reason" label="دلیل و مستند تغییر" minLength={5} />
}
function AtomicRule({
  r,
  onChange,
  prefix,
}: {
  r: any
  onChange: (r: any) => void
  prefix: string
}) {
  return (
    <>
      <label>
        روش محاسبه {prefix}
        <select
          aria-label={'روش محاسبه ' + prefix}
          value={r.mode}
          onChange={(e) =>
            onChange({
              ...r,
              mode: e.target.value,
              basis:
                e.target.value === 'FIXED_IRR'
                  ? 'FIXED_IRR'
                  : 'GOLD_BASE_750_IRR',
            })
          }
        >
          <option value="PERCENT">درصد؛ صدم درصد</option>
          <option value="FIXED_IRR">مبلغ ثابت ریال</option>
        </select>
      </label>
      <label>
        مبنای {prefix}
        <select
          aria-label={'مبنای ' + prefix}
          value={r.basis}
          onChange={(e) => onChange({ ...r, basis: e.target.value })}
        >
          {r.mode === 'FIXED_IRR' ? (
            <option value="FIXED_IRR">ریال ثابت</option>
          ) : (
            <>
              <option value="GOLD_BASE_750_IRR">
                اصل طلای ۷۵۰؛ مستقل از اجرت
              </option>
              <option value="MAKING_IRR">اجرت عرضه تأمین‌کننده</option>
              <option value="GOLD_PLUS_MAKING_IRR">اصل طلا + اجرت عرضه</option>
            </>
          )}
        </select>
      </label>
      <label>
        مقدار {prefix}
        <input
          aria-label={'مقدار ' + prefix}
          type="number"
          required
          min={0}
          max={r.mode === 'PERCENT' ? 10000 : 1000000000000}
          value={r.value}
          onChange={(e) => onChange({ ...r, value: Number(e.target.value) })}
        />
      </label>
    </>
  )
}
function RuleEditor({
  rule: r,
  change,
}: {
  rule: any
  change: (r: any) => void
}) {
  const core = ['distribution', 'retail', 'credit'].includes(r.code)
  return (
    <fieldset className="card">
      <legend>
        {r.label} · {r.code}
      </legend>
      {!core ? (
        <>
          <label>
            کد جزء
            <input
              value={r.code}
              onChange={(e) => change({ ...r, code: e.target.value })}
              pattern="[a-z][a-z0-9_]+"
              required
            />
          </label>
          <label>
            عنوان
            <input
              value={r.label}
              onChange={(e) => change({ ...r, label: e.target.value })}
              required
            />
          </label>
          <label>
            جزء اصلی
            <select
              value={r.component}
              onChange={(e) => change({ ...r, component: e.target.value })}
            >
              {Object.keys(labels).map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
      <label>
        شرط اعمال {r.code}
        <select
          aria-label={'شرط اعمال ' + r.code}
          value={r.application_mode}
          onChange={(e) =>
            change({
              ...r,
              application_mode: e.target.value,
              cash_rule: r.cash_rule || atomic(),
              credit_rule: r.credit_rule || atomic(),
            })
          }
        >
          <option value="ALWAYS">همیشه؛ نقدی و اعتباری</option>
          <option value="CREDIT_ONLY">فقط اعتباری</option>
          <option value="CASH_ONLY">فقط نقدی</option>
          <option value="BY_PAYMENT_METHOD">قاعده مستقل برای هر روش</option>
          <option value="DISABLED">غیرفعال</option>
        </select>
      </label>
      {r.application_mode === 'BY_PAYMENT_METHOD' ? (
        <>
          <AtomicRule
            prefix={r.code + ' نقدی'}
            r={r.cash_rule || atomic()}
            onChange={(a) => change({ ...r, cash_rule: a })}
          />
          <AtomicRule
            prefix={r.code + ' اعتباری'}
            r={r.credit_rule || atomic()}
            onChange={(a) => change({ ...r, credit_rule: a })}
          />
        </>
      ) : (
        <AtomicRule prefix={r.code} r={r} onChange={change} />
      )}
      <label>
        پرداخت‌کننده {r.code}
        <select
          aria-label={'پرداخت‌کننده ' + r.code}
          value={r.payer}
          onChange={(e) =>
            change({
              ...r,
              payer: e.target.value,
              ...(e.target.value === 'DIDAR'
                ? { recipient: 'THIRD_PARTY' }
                : {}),
            })
          }
        >
          <option value="CUSTOMER">مشتری؛ افزوده به قیمت</option>
          <option value="MERCHANT">تأمین‌کننده؛ مطالبه مستقل</option>
          <option value="DIDAR">دیدار؛ هزینه داخلی</option>
        </select>
      </label>
      <label>
        دریافت‌کننده {r.code}
        <select
          aria-label={'دریافت‌کننده ' + r.code}
          value={r.recipient}
          onChange={(e) => change({ ...r, recipient: e.target.value })}
        >
          {r.payer !== 'DIDAR' ? <option value="DIDAR">دیدار</option> : null}
          <option value="THIRD_PARTY">طرف خدمت؛ حساب مستقل</option>
        </select>
      </label>
      {!core ? (
        <>
          <label>
            دامنه محاسبه
            <select
              value={r.scope}
              onChange={(e) =>
                change({
                  ...r,
                  scope: e.target.value,
                  ...(e.target.value === 'ORDER'
                    ? {
                        mode: 'FIXED_IRR',
                        basis: 'FIXED_IRR',
                        cash_rule: {
                          mode: 'FIXED_IRR',
                          basis: 'FIXED_IRR',
                          value: 0,
                        },
                        credit_rule: {
                          mode: 'FIXED_IRR',
                          basis: 'FIXED_IRR',
                          value: 0,
                        },
                      }
                    : {}),
                })
              }
            >
              <option value="ITEM">هر قطعه</option>
              <option value="ORDER">یک‌بار در سفارش؛ مبلغ ثابت</option>
            </select>
          </label>
          {r.scope === 'ORDER' ? (
            <label>
              کد مشترک خدمت
              <input
                value={r.service_key || ''}
                onChange={(e) => change({ ...r, service_key: e.target.value })}
                required
                pattern="[a-z][a-z0-9_]+"
              />
            </label>
          ) : null}
        </>
      ) : null}
    </fieldset>
  )
}
export function MerchantPricing() {
  const { user, api, run, busy, refresh, setMessage } = useDidar(),
    admin = user?.role === 'admin'
  const [data, setData] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [rules, setRules] = useState<any[]>(defaultRules),
    [profile, setProfile] = useState(''),
    [tax, setTax] = useState('')
  const load = useCallback(
    async () => setData(await api('merchant-pricing')),
    [api],
  )
  useEffect(() => {
    let live = true
    api('merchant-pricing')
      .then((d) => {
        if (live) setData(d)
      })
      .catch((e) => {
        if (live) setMessage(e.message)
      })
    return () => {
      live = false
    }
  }, [api, setMessage])
  async function save(body: any) {
    await api('merchant-pricing', body)
    await Promise.all([load(), refresh()])
    setMessage('اطلاعات قیمت‌گذاری ذخیره شد.')
  }
  const submit =
    (fn: (f: FormData) => Promise<any>) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      run(() => fn(f))
    }
  if (!data) return <p role="status">در حال دریافت پروفایل‌های قیمت…</p>
  const reason = (f: FormData) => String(f.get('reason') || '')
  const versionName = (v: any) =>
    data.profiles.find((p: any) => p.id === v.profile_id)?.name +
    ' · نسخه ' +
    v.number
  return (
    <section className="merchant-pricing">
      <h2>پروفایل قیمت‌گذاری تأمین‌کننده</h2>
      <p>
        اصل طلا و اجرت عرضه، منبع محاسبه‌اند. D/R/C مستقل‌اند. هزینه عملیات
        اعتباری فقط طبق پروفایل اعمال می‌شود و ممکن است در خرید نقدی نیز وجود
        داشته باشد. تغییر نسخه، سفارش پذیرفته‌شده را تغییر نمی‌دهد. این بخش
        اعتبار یا انتقال واقعی ایجاد نمی‌کند.
      </p>
      <button disabled={busy} onClick={() => run(load)}>
        تازه‌سازی پروفایل‌ها
      </button>
      <h3>نوع و تخصیص هر تأمین‌کننده</h3>
      {data.suppliers.map((s: any) => (
        <details className="card" key={s.id}>
          <summary>
            {s.name} ·{' '}
            {data.types.find((t: any) => t.code === s.commercial_type)?.name}
          </summary>
          {s.commercial_type === 'LEGACY_UNCLASSIFIED' ? (
            <p>نرخ‌گذاری قدیمی تا تعیین صریح نوع حفظ می‌شود.</p>
          ) : (
            <p>عرضه این نوع بدون تخصیص معتبر، قیمت قابل خرید ندارد.</p>
          )}
          {admin ? (
            <>
              <form
                className="form-grid"
                key={'type' + s.pricing_revision}
                data-testid={'merchant-type-' + s.id}
                onSubmit={submit((f) =>
                  save({
                    operation: 'classify',
                    supplier_id: s.id,
                    commercial_type: f.get('commercial_type'),
                    revision: s.pricing_revision,
                    reason: reason(f),
                  }),
                )}
              >
                <label>
                  نوع تجاری
                  <select
                    name="commercial_type"
                    defaultValue={s.commercial_type}
                  >
                    {data.types
                      .filter((t: any) => t.active)
                      .map((t: any) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <Reason />
                <button disabled={busy}>ثبت نوع تأمین‌کننده</button>
              </form>
              <form
                className="form-grid"
                data-testid={'merchant-assignment-' + s.id}
                onSubmit={submit((f) =>
                  save({
                    operation: f.get('operation'),
                    supplier_id: s.id,
                    profile_version_id: f.get('profile_version_id'),
                    effective_from: f.get('effective_from')
                      ? new Date(String(f.get('effective_from'))).toISOString()
                      : undefined,
                    effective_to: f.get('effective_to')
                      ? new Date(String(f.get('effective_to'))).toISOString()
                      : undefined,
                    reason: reason(f),
                  }),
                )}
              >
                <label>
                  پروفایل و نسخه مصوب
                  <select name="profile_version_id" required>
                    <option value="">انتخاب کنید</option>
                    {data.versions
                      .filter(
                        (v: any) =>
                          v.status === 'approved' &&
                          v.merchant_types.includes(s.commercial_type) &&
                          data.profiles.find((p: any) => p.id === v.profile_id)
                            ?.active,
                      )
                      .map((v: any) => (
                        <option key={v.id} value={v.id}>
                          {versionName(v)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  روش تخصیص
                  <select name="operation">
                    <option value="assign">تخصیص جدید؛ بدون هم‌پوشانی</option>
                    <option value="switch">تعویض و پایان تخصیص فعلی</option>
                  </select>
                </label>
                <Field
                  name="effective_from"
                  label="شروع اثر؛ خالی یعنی اکنون"
                  type="datetime-local"
                  required={false}
                />
                <Field
                  name="effective_to"
                  label="پایان اختیاری"
                  type="datetime-local"
                  required={false}
                />
                <Reason />
                <button disabled={busy}>ثبت تخصیص پروفایل</button>
              </form>
            </>
          ) : null}
          {data.assignments
            .filter((a: any) => a.supplier_id === s.id)
            .map((a: any) => (
              <article className="card" key={a.id}>
                <strong>
                  {versionName(
                    data.versions.find(
                      (v: any) => v.id === a.profile_version_id,
                    ),
                  )}
                </strong>
                <p>
                  از {date(a.effective_from)} تا{' '}
                  {a.effective_to ? date(a.effective_to) : 'بدون پایان'} ·{' '}
                  {a.cancelled ? 'لغو آینده' : 'ثبت شده'}
                </p>
                {admin && !a.cancelled ? (
                  <form
                    onSubmit={submit((f) =>
                      save({
                        operation: f.get('operation'),
                        id: a.id,
                        reason: reason(f),
                      }),
                    )}
                  >
                    <label>
                      عملیات تاریخچه
                      <select name="operation">
                        <option value="assignment_end">پایان از اکنون</option>
                        <option value="assignment_cancel">
                          لغو تخصیص آینده
                        </option>
                      </select>
                    </label>
                    <Reason />
                    <button disabled={busy}>ثبت پایان / لغو</button>
                  </form>
                ) : null}
              </article>
            ))}
        </details>
      ))}
      {admin ? (
        <>
          <details className="card">
            <summary>انواع تجاری و پیشنهاد پروفایل</summary>
            {[null, ...data.types].map((t: any) => (
              <form
                key={t?.code || 'new'}
                className="form-grid"
                onSubmit={submit((f) =>
                  save({
                    operation: 'type_save',
                    code: f.get('code'),
                    name: f.get('name'),
                    version: t?.version,
                    active: f.get('active') === 'on',
                    recommended_profile_id:
                      f.get('recommended_profile_id') || null,
                    reason: reason(f),
                  }),
                )}
              >
                <Field
                  name="code"
                  label="کد دائمی نوع"
                  value={t?.code}
                  readOnly={!!t}
                />
                <Field name="name" label="نام نوع" value={t?.name} />
                <label>
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={t?.active ?? true}
                  />
                  فعال
                </label>
                <label>
                  پروفایل پیشنهادی؛ بدون تخصیص خودکار
                  <select
                    name="recommended_profile_id"
                    defaultValue={t?.recommended_profile_id || ''}
                  >
                    <option value="">بدون پیشنهاد</option>
                    {data.profiles
                      .filter((p: any) => p.merchant_types.includes(t?.code))
                      .map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
                <Reason />
                <button>ذخیره نوع تجاری</button>
              </form>
            ))}
          </details>
          <details className="card">
            <summary>سیاست مالیات و نسخه‌های مصوب</summary>
            {[null, ...data.tax_policies].map((t: any) => (
              <form
                key={(t?.id || 'new') + t?.revision}
                className="form-grid"
                data-testid={t ? 'tax-policy-edit' : 'tax-policy-create'}
                onSubmit={submit((f) =>
                  save({
                    operation: 'tax_policy_save',
                    id: t?.id,
                    revision: t?.revision,
                    code: f.get('code'),
                    name: f.get('name'),
                    active: f.get('active') === 'on',
                    reason: reason(f),
                  }),
                )}
              >
                <Field
                  name="code"
                  label="کد سیاست مالیات"
                  value={t?.code}
                  readOnly={!!t}
                />
                <Field name="name" label="نام سیاست مالیات" value={t?.name} />
                <label>
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={t?.active ?? true}
                  />
                  فعال
                </label>
                <Reason />
                <button>ذخیره سیاست مالیات</button>
              </form>
            ))}
            <form
              className="card form-grid"
              data-testid="tax-version-create"
              onSubmit={submit((f) =>
                save({
                  operation: 'tax_draft',
                  policy_id: f.get('policy_id'),
                  bps: Number(f.get('bps')),
                  taxable_components: f.getAll('taxable_components'),
                  reason: reason(f),
                }),
              )}
            >
              <h4>نسخه جدید مالیات؛ نیازمند بررسی مستقل</h4>
              <label>
                سیاست مالیات
                <select name="policy_id" required>
                  <option value="">انتخاب کنید</option>
                  {data.tax_policies.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="bps"
                label="نرخ مالیات؛ صدم درصد"
                type="number"
                min={0}
                max={10000}
              />
              {['gold', 'making', ...Object.keys(labels)].map((k: any) => (
                <label key={k}>
                  <input type="checkbox" name="taxable_components" value={k} />
                  {
                    (
                      {
                        gold: 'اصل طلا؛ فقط با تأیید صریح',
                        making: 'اجرت عرضه',
                        ...labels,
                      } as any
                    )[k]
                  }
                </label>
              ))}
              <Reason />
              <button>ثبت پیش‌نویس مالیات</button>
            </form>
            {data.tax_versions.map((v: any) => (
              <article className="card" key={v.id}>
                <p>
                  {
                    data.tax_policies.find((t: any) => t.id === v.policy_id)
                      ?.name
                  }{' '}
                  · نسخه {v.number} · نرخ {v.bps} صدم درصد ·{' '}
                  {stateLabels[v.status]}
                </p>
                <p>
                  اجزای مشمول:{' '}
                  {v.taxable_components
                    .map(
                      (k: string) =>
                        (
                          ({
                            gold: 'اصل طلا',
                            making: 'اجرت عرضه',
                            ...labels,
                          }) as any
                        )[k],
                    )
                    .join('، ') || 'هیچ'}
                </p>
                {v.status === 'draft' ? (
                  <form
                    data-testid={'tax-review-' + v.id}
                    onSubmit={submit((f) =>
                      save({
                        operation: 'tax_review',
                        id: v.id,
                        approved: f.get('decision') === 'approved',
                        reason: reason(f),
                      }),
                    )}
                  >
                    <label>
                      نتیجه
                      <select name="decision">
                        <option value="approved">تأیید</option>
                        <option value="rejected">رد</option>
                      </select>
                    </label>
                    <Reason />
                    <button>بررسی نسخه مالیات</button>
                  </form>
                ) : null}
              </article>
            ))}
          </details>
          <details className="card">
            <summary>ثبت و ویرایش پروفایل‌ها</summary>
            {[null, ...data.profiles].map((p: any) => (
              <form
                className="form-grid card"
                key={(p?.id || 'new') + p?.revision}
                data-testid={p ? 'profile-edit' : 'profile-create'}
                onSubmit={submit((f) =>
                  save({
                    operation: 'profile_save',
                    id: p?.id,
                    revision: p?.revision,
                    code: f.get('code'),
                    name: f.get('name'),
                    description: f.get('description'),
                    merchant_types: f.getAll('merchant_types'),
                    active: f.get('active') === 'on',
                    reason: reason(f),
                  }),
                )}
              >
                <Field
                  name="code"
                  label="کد دائمی پروفایل"
                  value={p?.code}
                  readOnly={!!p}
                />
                <Field name="name" label="نام پروفایل" value={p?.name} />
                <label>
                  توضیح
                  <textarea
                    name="description"
                    defaultValue={p?.description || ''}
                  />
                </label>
                <label>
                  انواع تجاری مجاز
                  <select
                    name="merchant_types"
                    multiple
                    required
                    defaultValue={p?.merchant_types || []}
                    size={3}
                  >
                    {data.types
                      .filter((t: any) => t.code !== 'LEGACY_UNCLASSIFIED')
                      .map((t: any) => (
                        <option key={t.code} value={t.code}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <input
                    name="active"
                    type="checkbox"
                    defaultChecked={p?.active ?? true}
                  />
                  فعال
                </label>
                <Reason />
                <button>ذخیره پروفایل</button>
              </form>
            ))}
          </details>
          <details className="card">
            <summary>ساخت نسخه و قواعد مستقل D / R / C</summary>
            <p>
              اجرت M از عرضه می‌آید. مقادیر درصدی، صدم درصد هستند: ۳۰۰ یعنی ۳٪.
              نمونه‌ها فقط فرم را پر می‌کنند و بدون ثبت و بررسی فعال نمی‌شوند.
              مالیات تنها از نسخه مستقل مصوب انتخاب می‌شود.
            </p>
            <button
              type="button"
              onClick={() =>
                setRules(
                  defaultRules().map((r) => ({
                    ...r,
                    value:
                      r.code === 'distribution'
                        ? 300
                        : r.code === 'retail'
                          ? 700
                          : 0,
                  })),
                )
              }
            >
              نمونه تولیدکننده ۳٪ + ۷٪
            </button>
            <button
              type="button"
              onClick={() =>
                setRules(
                  defaultRules().map((r) => ({
                    ...r,
                    value:
                      r.code === 'distribution'
                        ? 300
                        : r.code === 'credit'
                          ? 250
                          : 0,
                  })),
                )
              }
            >
              نمونه خرده‌فروش ۳٪ + ۲٫۵٪؛ همیشه
            </button>
            <label>
              ساخت از نسخه قبلی
              <select
                defaultValue=""
                onChange={(e) => {
                  const v = data.versions.find(
                    (v: any) => v.id === e.target.value,
                  )
                  if (v) {
                    setProfile(v.profile_id)
                    setTax(v.tax_version_id)
                    setRules(
                      data.rules
                        .filter((r: any) => r.version_id === v.id)
                        .map((r: any) => ({
                          ...r.rule,
                          code: r.code,
                          component: r.component,
                        })),
                    )
                  }
                }}
              >
                <option value="">بدون نسخه مرجع</option>
                {data.versions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {versionName(v)}
                  </option>
                ))}
              </select>
            </label>
            <form
              data-testid="profile-version-create"
              onSubmit={submit((f) =>
                save({
                  operation: 'version_draft',
                  profile_id: profile,
                  tax_version_id: tax,
                  rounding_step: Number(f.get('rounding_step')),
                  rules,
                  reason: reason(f),
                }),
              )}
            >
              <label>
                پروفایل
                <select
                  aria-label="پروفایل نسخه جدید"
                  value={profile}
                  onChange={(e) => setProfile(e.target.value)}
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {data.profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                نسخه مصوب مالیات
                <select
                  aria-label="نسخه مصوب مالیات"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {data.tax_versions
                    .filter((v: any) => v.status === 'approved')
                    .map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {
                          data.tax_policies.find(
                            (t: any) => t.id === v.policy_id,
                          )?.name
                        }{' '}
                        · {v.number}
                      </option>
                    ))}
                </select>
              </label>
              {rules.map((r, i) => (
                <RuleEditor
                  key={i}
                  rule={r}
                  change={(v) =>
                    setRules((rs) => rs.map((old, j) => (i === j ? v : old)))
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  setRules((rs) => [
                    ...rs,
                    {
                      ...atomic(),
                      code: 'service_' + rs.length,
                      label: 'خدمت اختیاری؛ نیازمند تصویب',
                      component: 'distribution',
                      scope: 'ITEM',
                      payer: 'DIDAR',
                      recipient: 'THIRD_PARTY',
                      application_mode: 'DISABLED',
                    },
                  ])
                }
              >
                افزودن بسته‌بندی / ارسال / خدمت
              </button>
              <Field
                name="rounding_step"
                label="گام گرد کردن ریال"
                type="number"
                value={1}
                min={1}
                max={1000000}
              />
              <Reason />
              <button disabled={busy}>ثبت پیش‌نویس نسخه پروفایل</button>
            </form>
          </details>
        </>
      ) : null}
      <details className="card">
        <summary>تاریخچه نسخه‌ها و بررسی</summary>
        {data.versions.map((v: any) => (
          <article className="card" key={v.id}>
            <strong>
              {versionName(v)} · {stateLabels[v.status]}
            </strong>
            <p>منبع اجرت: عرضه تأمین‌کننده · ثبت: {date(v.created_at)}</p>
            <dl>
              {data.rules
                .filter((r: any) => r.version_id === v.id)
                .map((r: any) => (
                  <div key={r.code}>
                    <dt>{r.rule.label}</dt>
                    <dd dir="ltr">
                      {r.rule.application_mode} ·{' '}
                      {r.rule.mode || 'cash / credit'} · {r.rule.basis || ''} ·{' '}
                      {r.rule.value ?? ''} · {r.rule.payer}
                    </dd>
                  </div>
                ))}
            </dl>
            {admin && v.status === 'draft' ? (
              <form
                data-testid={'profile-review-' + v.id}
                onSubmit={submit((f) =>
                  save({
                    operation: 'version_review',
                    id: v.id,
                    approved: f.get('decision') === 'approved',
                    reason: reason(f),
                  }),
                )}
              >
                <label>
                  نتیجه
                  <select name="decision">
                    <option value="approved">تأیید</option>
                    <option value="rejected">رد</option>
                  </select>
                </label>
                <Reason />
                <button>بررسی نسخه پروفایل</button>
              </form>
            ) : null}
          </article>
        ))}
      </details>
      <form
        className="card form-grid"
        data-testid="merchant-price-preview"
        onSubmit={submit(async (f) =>
          setPreview(
            (
              await api('merchant-pricing', {
                operation: 'preview',
                offer_id: f.get('offer_id'),
                payment_method: f.get('payment_method'),
                at: f.get('at')
                  ? new Date(String(f.get('at'))).toISOString()
                  : undefined,
              })
            ).price,
          ),
        )}
      >
        <h3>شبیه‌ساز قیمت عرضه واقعی</h3>
        <label>
          عرضه تأمین‌کننده
          <select name="offer_id" required>
            <option value="">انتخاب کنید</option>
            {data.offers.map((o: any) => (
              <option key={o.id} value={o.id}>
                {data.suppliers.find((s: any) => s.id === o.supplier_id)?.name}{' '}
                · {o.title} · {weight(o.weight_mg)}
              </option>
            ))}
          </select>
        </label>
        <label>
          روش پرداخت
          <select name="payment_method">
            <option value="CASH">نقدی</option>
            <option value="CREDIT">اعتباری؛ محاسبه آزمایشی</option>
          </select>
        </label>
        <Field
          type="datetime-local"
          name="at"
          label="زمان پیش‌نمایش اختیاری"
          required={false}
        />
        <button disabled={busy}>محاسبه قیمت عرضه</button>
        {preview ? (
          <div data-testid="price-preview-result">
            <PricingBreakdown value={preview} />
            <p>قیمت واحد؛ خدمات یک‌بار در سفارش در سبد محاسبه می‌شوند.</p>
          </div>
        ) : null}
      </form>
    </section>
  )
}
