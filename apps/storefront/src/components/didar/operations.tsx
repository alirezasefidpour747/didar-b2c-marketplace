'use client'
import { UIDLabels } from './uid-labels'
import Link from 'next/link'
import { useEffect, useState, useRef, type FormEvent } from 'react'
import { RequireUser, useDidar } from './store'
import { weight, date } from './locale'
import { mockRFIDReader, keyboardWedgeReader } from './rfid-reader'
const permissionLabels: Record<string, string> = {
  REQUEST_PRODUCT_CREATION: 'درخواست محصول',
  CREATE_OWN_OFFER: 'ایجاد عرضه',
  EDIT_OWN_OFFER: 'ویرایش عرضه',
  EDIT_OWN_INVENTORY: 'ویرایش موجودی',
  EDIT_OWN_MAKING_CHARGE: 'ویرایش اجرت',
  CREATE_OWN_INTAKE: 'پذیرش و توزین پیش‌نویس',
  PAIR_OWN_RFID: 'اتصال RFID',
  UPDATE_OWN_FULFILLMENT: 'به‌روزرسانی ارسال',
  SUGGEST_OWN_CLASSIFICATION: 'پیشنهاد طبقه‌بندی محصول',
}
const status: Record<string, string> = {
  draft: 'پیش‌نویس',
  verified: 'تأیید شده',
  posted: 'ورود به موجودی',
  available: 'آماده فروش',
  reserved: 'رزرو شده',
  sold: 'فروخته شده',
  returned: 'مرجوعی در قرنطینه',
  withdrawn: 'خارج از فروش',
  void: 'باطل؛ UID محفوظ',
  requested: 'درخواست',
  received: 'دریافت فیزیکی',
  restocked: 'بازگشت به فروش',
  rejected: 'رد شده',
  expected: 'مورد انتظار',
  unknown: 'ناشناخته',
  absent: 'غایب / غیرقابل فروش',
  out_of_scope: 'خارج از محدوده',
  unexpected: 'خارج از تصویر اولیه',
}
function Field({
  name,
  label,
  value,
  type = 'text',
  required = true,
  min = 0,
  max,
}: {
  name: string
  label: string
  value?: any
  type?: string
  required?: boolean
  min?: number
  max?: number
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={type === 'number' ? min : undefined}
        max={max}
        maxLength={type === 'text' ? 1000 : undefined}
      />
    </label>
  )
}
const num = (f: FormData, k: string) => Number(f.get(k) || 0)
function Making({ line }: { line?: any }) {
  return (
    <>
      <label>
        روش اجرت
        <select
          name="making_mode"
          defaultValue={line?.making_mode || 'percent'}
        >
          <option value="percent">درصد وزن پایه</option>
          <option value="fixed_gold">وزن معادل طلای ثابت برای هر قطعه</option>
        </select>
      </label>
      <Field
        name="making_bps"
        label="اجرت bps (۱۲۰۰ = ۱۲٪)"
        type="number"
        max={10000}
        value={line?.making_bps ?? 1200}
      />
      <Field
        name="making_weight_mg"
        label="اجرت ثابت معادل ۷۵۰؛ میلی‌گرم هر قطعه"
        type="number"
        max={1000000}
        value={line?.making_weight_mg ?? 0}
      />
    </>
  )
}
export function Operations() {
  return (
    <RequireUser roles={['admin', 'supplier']}>
      <OperationalJourney />
    </RequireUser>
  )
}
function OperationalJourney() {
  const { user, api, run, busy, setMessage, refresh } = useDidar()
  const admin = user?.role === 'admin'
  const [view, setView] = useState('intake'),
    [batchId, setBatchId] = useState(''),
    [sessionId, setSessionId] = useState(''),
    [data, setData] = useState<any>(),
    [search, setSearch] = useState('')
  const [simulated, setSimulated] = useState(true)
  const scanQueue = useRef<Promise<void>>(Promise.resolve())
  const [scanPending, setScanPending] = useState(0)
  function enqueueScan(raw: string) {
    let value = ''
    ;(simulated ? mockRFIDReader : keyboardWedgeReader).read(raw, (v) => {
      value = v
    })
    const session = sessionId
    setScanPending((p) => p + 1)
    scanQueue.current = scanQueue.current.then(async () => {
      try {
        const report = await api('rfid', {
          operation: 'scan',
          session_id: session,
          value,
        })
        setData((current: any) => ({
          ...current,
          rfid: { ...current.rfid, ...report },
        }))
      } catch (error: any) {
        setMessage(error.message)
      } finally {
        setScanPending((p) => p - 1)
      }
    })
  }

  async function load(batch = batchId, session = sessionId, query = search) {
    const [managed, intake, inventory, rfid, returns, rights] =
      await Promise.all([
        api('manage'),
        api('intake' + (batch ? '?id=' + encodeURIComponent(batch) : '')),
        api(
          'inventory' + (query ? '?search=' + encodeURIComponent(query) : ''),
        ),
        api('rfid' + (session ? '?id=' + encodeURIComponent(session) : '')),
        api('returns'),
        api('permissions'),
      ])
    setData({ managed, intake, inventory, rfid, returns, rights })
  }
  useEffect(() => {
    run(() => load())
  }, [])
  const can = (p: string) =>
    admin ||
    data?.rights.permissions.some(
      (r: any) =>
        r.permission === p && r.granted && r.supplier_id === user?.supplier_id,
    )
  async function mutate(action: string, body: any, message = 'عملیات ثبت شد.') {
    const result = await api(action, body)
    await load()
    await refresh()
    setMessage(message)
    return result
  }
  const submit =
    (fn: (f: FormData) => Promise<any>) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const f = new FormData(e.currentTarget)
      run(async () => {
        await fn(f)
      })
    }
  if (!data)
    return (
      <section>
        <h1>پذیرش و موجودی قطعه‌ای</h1>
        <p role="status">در حال دریافت…</p>
        <button onClick={() => run(() => load())}>تلاش دوباره</button>
      </section>
    )
  const { managed, intake, inventory, rfid, returns, rights } = data
  const batch = intake.batch
  const supplierSelect = (empty = false) => (
    <label>
      تأمین‌کننده
      <select name="supplier_id">
        {empty && <option value="">تمام موجودی منطقی</option>}
        {managed.suppliers.map((s: any) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
  const productSelect = (line?: any) => (
    <label>
      محصول مشترک
      <select name="product_id" defaultValue={line?.product_id || ''}>
        <option value="">پیش‌نویس بدون اتصال</option>
        {managed.products.map((p: any) => (
          <option key={p.id} value={p.id}>
            {p.title} · {p.purity}
          </option>
        ))}
      </select>
    </label>
  )
  const saveLine = (line?: any) => async (f: FormData) =>
    mutate('intake', {
      operation: 'line',
      batch_id: batch.id,
      id: line?.id,
      version: batch.version,
      product_id: f.get('product_id') || null,
      description: f.get('description'),
      quantity: num(f, 'quantity'),
      total_weight_mg: num(f, 'total_weight_mg'),
      purity: num(f, 'purity'),
      making_mode: f.get('making_mode'),
      making_bps: num(f, 'making_bps'),
      making_weight_mg: num(f, 'making_weight_mg'),
      details: JSON.parse(String(f.get('details') || '{}')),
    })
  return (
    <section className="operations">
      <h1>پذیرش و موجودی قطعه‌ای</h1>
      <nav className="manage-tabs">
        <Link href="/manage">کاتالوگ و عرضه‌ها</Link>
        <Link href="/orders">فروش و ارسال</Link>
        {[
          ['intake', 'پذیرش فاکتور'],
          ['stock', 'قطعات و UID'],
          ['rfid', 'شمارش RFID'],
          ['returns', 'مرجوعی'],
          ...(admin ? [['permissions', 'مجوز تأمین‌کننده']] : []),
        ].map(([k, label]) => (
          <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>
            {label}
          </button>
        ))}
        <button disabled={busy} onClick={() => run(() => load())}>
          تازه‌سازی عملیات
        </button>
      </nav>
      {!admin && (
        <p className="notice">
          دسترسی عملیاتی به‌صورت پیش‌فرض فقط خواندنی است. نوشتن فقط با مجوز مدیر
          امکان دارد.
        </p>
      )}
      {view === 'intake' && (
        <>
          {can('CREATE_OWN_INTAKE') && (
            <form
              className="card form-grid"
              data-testid="intake-header"
              onSubmit={submit(async (f) => {
                const created = await api('intake', {
                  operation: 'create',
                  supplier_id: f.get('supplier_id'),
                  invoice_number: f.get('invoice_number'),
                  tahesab_reference: f.get('tahesab_reference'),
                  reference_purity: num(f, 'reference_purity'),
                  received_at: f.get('received_at') || undefined,
                  notes: f.get('notes'),
                })
                setBatchId(created.id)
                await load(created.id)
                setMessage('پیش‌نویس پذیرش ایجاد شد.')
              })}
            >
              <h2>فاکتور جدید تأمین‌کننده</h2>
              {admin && supplierSelect()}
              <Field name="invoice_number" label="شماره فاکتور تأمین‌کننده" />
              <Field
                name="tahesab_reference"
                label="مرجع اختیاری طحساب"
                required={false}
              />
              <Field
                name="received_at"
                label="زمان دریافت"
                type="datetime-local"
                required={false}
              />
              <Field
                name="reference_purity"
                label="عیار مرجع"
                type="number"
                min={1}
                max={1000}
                value={750}
              />
              <Field name="notes" label="یادداشت" required={false} />
              <button disabled={busy} className="primary">
                ایجاد پذیرش
              </button>
            </form>
          )}
          <label>
            انتخاب پذیرش
            <select
              value={batchId}
              onChange={(e) => {
                const value = e.target.value
                setBatchId(value)
                run(() => load(value))
              }}
            >
              <option value="">انتخاب کنید</option>
              {intake.batches.map((b: any) => (
                <option value={b.id} key={b.id}>
                  {b.invoice_number} · {b.supplier} · {status[b.status]}
                </option>
              ))}
            </select>
          </label>
          {batch && (
            <article className="order" data-testid="batch-detail">
              <h2>فاکتور {batch.invoice_number}</h2>
              {admin && (
                <UIDLabels
                  key={batch.id}
                  batchId={batch.id}
                  items={intake.items}
                />
              )}
              <p>
                {batch.supplier} · {status[batch.status]} ·{' '}
                {date(batch.received_at)} · عیار {batch.reference_purity}
              </p>
              <p>
                مرجع: {batch.tahesab_reference || '—'} · {batch.notes}
              </p>
              <p>
                اپراتور: <code>{batch.operator_id}</code>
              </p>
              {batch.status === 'draft' && can('CREATE_OWN_INTAKE') && (
                <form
                  className="form-grid"
                  onSubmit={submit((f) =>
                    mutate('intake', {
                      operation: 'header',
                      batch_id: batch.id,
                      version: batch.version,
                      invoice_number: f.get('invoice_number'),
                      tahesab_reference: f.get('tahesab_reference'),
                      notes: f.get('notes'),
                    }),
                  )}
                >
                  <Field
                    name="invoice_number"
                    label="ویرایش شماره فاکتور"
                    value={batch.invoice_number}
                  />
                  <Field
                    name="tahesab_reference"
                    label="ویرایش مرجع طحساب"
                    value={batch.tahesab_reference}
                    required={false}
                  />
                  <Field
                    name="notes"
                    label="ویرایش یادداشت"
                    value={batch.notes}
                    required={false}
                  />
                  <button disabled={busy}>ذخیره سربرگ</button>
                </form>
              )}
              {intake.lines.map((l: any) => (
                <article className="card" key={l.id} data-line-id={l.id}>
                  <h3>{l.description}</h3>
                  <p data-testid="reconciliation">
                    تعداد: {l.measured_quantity} / {l.quantity}؛ اختلاف{' '}
                    {l.quantity_delta} · وزن: {weight(l.measured_weight_mg)} /{' '}
                    {weight(l.total_weight_mg)}؛ اختلاف {l.weight_delta_mg}{' '}
                    میلی‌گرم
                  </p>
                  {batch.status === 'draft' && can('CREATE_OWN_INTAKE') && (
                    <>
                      <details>
                        <summary>ویرایش ردیف گروهی</summary>
                        <form
                          className="form-grid"
                          onSubmit={submit(saveLine(l))}
                        >
                          {productSelect(l)}
                          <Field
                            name="description"
                            label="شرح ردیف"
                            value={l.description}
                          />
                          <Field
                            name="quantity"
                            label="تعداد فاکتور"
                            type="number"
                            min={1}
                            value={l.quantity}
                          />
                          <Field
                            name="total_weight_mg"
                            label="وزن کل فاکتور میلی‌گرم"
                            type="number"
                            min={1}
                            value={l.total_weight_mg}
                          />
                          <Field
                            name="purity"
                            label="عیار ردیف"
                            type="number"
                            min={1}
                            max={1000}
                            value={l.purity}
                          />
                          <Making line={l} />
                          <label>
                            جزئیات و مرجع تصویر JSON
                            <textarea
                              name="details"
                              defaultValue={JSON.stringify(l.details)}
                            />
                          </label>
                          <button disabled={busy}>ذخیره ردیف</button>
                        </form>
                      </details>
                      <form
                        className="form-grid"
                        data-testid="weigh-item"
                        onSubmit={submit((f) =>
                          mutate('intake', {
                            operation: 'item',
                            batch_id: batch.id,
                            line_id: l.id,
                            weight_mg: num(f, 'weight_mg'),
                            uid: f.get('uid') || undefined,
                            owner_descriptor: f.get('owner_descriptor'),
                          }),
                        )}
                      >
                        <h4>توزین جداگانه هر قطعه</h4>
                        <Field
                          name="weight_mg"
                          label="وزن دقیق قطعه میلی‌گرم"
                          type="number"
                          min={1}
                          max={1000000}
                        />
                        <Field
                          name="uid"
                          label="UID اختیاری؛ خالی = تولید امن"
                          required={false}
                        />
                        <Field
                          name="owner_descriptor"
                          label="مالک / منبع"
                          required={false}
                        />
                        <button disabled={busy}>ثبت قطعه با UID یکتا</button>
                      </form>
                    </>
                  )}
                  <div className="unit-list">
                    {intake.items
                      .filter((i: any) => i.line_id === l.id)
                      .map((i: any) => (
                        <div className="card" key={i.id} data-uid={i.uid}>
                          <strong dir="ltr">{i.uid}</strong> ·{' '}
                          {weight(i.weight_mg)} · {status[i.status]} ·{' '}
                          <code>{i.epc || 'بدون EPC'}</code>
                          {i.status === 'draft' && can('CREATE_OWN_INTAKE') && (
                            <form
                              className="form-grid"
                              onSubmit={submit((f) =>
                                mutate('intake', {
                                  operation: 'item',
                                  batch_id: batch.id,
                                  line_id: l.id,
                                  item_id: i.id,
                                  weight_mg: num(f, 'weight_mg'),
                                }),
                              )}
                            >
                              <Field
                                name="weight_mg"
                                label="اصلاح وزن قطعه"
                                type="number"
                                min={1}
                                value={i.weight_mg}
                              />
                              <button disabled={busy}>اصلاح وزن</button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  run(() =>
                                    mutate('intake', {
                                      operation: 'void_item',
                                      batch_id: batch.id,
                                      line_id: l.id,
                                      item_id: i.id,
                                    }),
                                  )
                                }
                              >
                                ابطال قطعه؛ حفظ UID
                              </button>
                            </form>
                          )}
                          {can('PAIR_OWN_RFID') &&
                            !['sold', 'reserved'].includes(i.status) &&
                            (i.status !== 'void' || i.epc) && (
                              <Pair
                                item={i}
                                busy={busy}
                                submit={submit}
                                mutate={mutate}
                              />
                            )}
                        </div>
                      ))}
                  </div>
                </article>
              ))}
              {batch.status === 'draft' && can('CREATE_OWN_INTAKE') && (
                <form
                  className="card form-grid"
                  data-testid="intake-line"
                  onSubmit={submit(saveLine())}
                >
                  <h3>ردیف گروهی جدید</h3>
                  {productSelect()}
                  <Field name="description" label="شرح ردیف" />
                  <Field
                    name="quantity"
                    label="تعداد فاکتور"
                    type="number"
                    min={1}
                  />
                  <Field
                    name="total_weight_mg"
                    label="وزن کل فاکتور میلی‌گرم"
                    type="number"
                    min={1}
                  />
                  <Field
                    name="purity"
                    label="عیار ردیف"
                    type="number"
                    min={1}
                    max={1000}
                    value={batch.reference_purity}
                  />
                  <Making />
                  <label>
                    جزئیات و مرجع تصویر JSON
                    <textarea name="details" defaultValue="{}" />
                  </label>
                  <button disabled={busy}>افزودن ردیف</button>
                </form>
              )}
              {admin && batch.status !== 'posted' && (
                <form
                  className="card form-grid"
                  data-testid="verify-post"
                  onSubmit={submit((f) =>
                    mutate('intake', {
                      operation: batch.status === 'draft' ? 'verify' : 'post',
                      batch_id: batch.id,
                      reason: f.get('reason'),
                    }),
                  )}
                >
                  <p>
                    تطبیق تعداد الزامی است. تلورانس وزن مصوب:{' '}
                    {intake.policy.tolerance_mg} میلی‌گرم. هر استثنای وزن
                    نیازمند دلیل مدیر است.
                  </p>
                  <Field
                    name="reason"
                    label="دلیل استثنای وزن"
                    required={false}
                  />
                  <button disabled={busy} className="primary">
                    {batch.status === 'draft'
                      ? 'تأیید تطبیق پذیرش'
                      : 'ثبت قطعی موجودی تأییدشده'}
                  </button>
                </form>
              )}
              {batch.verification && (
                <details>
                  <summary>تطبیق و سیاست ثبت‌شده</summary>
                  <pre dir="ltr">
                    {JSON.stringify(batch.verification, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          )}
          {admin && (
            <details>
              <summary>سیاست تلورانس وزن</summary>
              <form
                className="form-grid"
                onSubmit={submit((f) =>
                  mutate('intake', {
                    operation: 'tolerance_policy',
                    tolerance_mg: num(f, 'tolerance_mg'),
                    reason: f.get('reason'),
                  }),
                )}
              >
                <Field
                  name="tolerance_mg"
                  label="تلورانس مجاز هر ردیف میلی‌گرم"
                  type="number"
                  max={1000}
                  value={intake.policy.tolerance_mg}
                />
                <Field name="reason" label="دلیل سیاست" />
                <button disabled={busy}>ثبت نسخه سیاست</button>
              </form>
            </details>
          )}
        </>
      )}
      {view === 'stock' && (
        <>
          <form
            className="form-grid"
            onSubmit={submit(async (f) => {
              const q = String(f.get('search') || '')
              setSearch(q)
              await load(batchId, sessionId, q)
            })}
          >
            <Field
              name="search"
              label="جستجوی UID یا EPC؛ اسکن + Enter"
              required={false}
              value={search}
            />
            <button disabled={busy}>جستجوی قطعه</button>
          </form>
          <p>
            یک محل منطقی. وزن‌ها اندازه‌گیری واقعی‌اند. عرضه‌های قدیمی تجمیعی در
            بخش عرضه‌ها مشخص شده‌اند و UID ساختگی ندارند.
          </p>
          {inventory.items.map((i: any) => (
            <article className="card" key={i.id} data-uid={i.uid}>
              <h2 dir="ltr">{i.uid}</h2>
              <p>
                {i.title || i.description} · {i.supplier} ·{' '}
                {weight(i.weight_mg)} · عیار {i.purity} · {status[i.status]}
              </p>
              <p>
                فاکتور {i.invoice_number} · مالک: {i.owner_descriptor} ·
                نگهدارنده: {i.custodian_descriptor}
              </p>
              <p>
                EPC: <code>{i.epc || '—'}</code>
              </p>
              {(i.sales || []).map((s: any) => (
                <p key={s.id}>
                  <Link href={'/orders/' + s.order_id}>
                    سفارش {s.order_id.slice(0, 8)}
                  </Link>{' '}
                  · {status[s.status]} · {s.fulfillment_status} ·{' '}
                  {s.return_status && status[s.return_status]}
                </p>
              ))}
              {can('PAIR_OWN_RFID') &&
                !['sold', 'reserved'].includes(i.status) &&
                (i.status !== 'void' || i.epc) && (
                  <Pair item={i} busy={busy} submit={submit} mutate={mutate} />
                )}
              {can('EDIT_OWN_INVENTORY') &&
                ['available', 'withdrawn'].includes(i.status) && (
                  <form
                    className="form-grid"
                    onSubmit={submit((f) =>
                      mutate('inventory', {
                        item_id: i.id,
                        status:
                          i.status === 'available' ? 'withdrawn' : 'available',
                        reason: f.get('reason'),
                      }),
                    )}
                  >
                    <Field name="reason" label="دلیل اصلاح مستقل موجودی" />
                    <button disabled={busy}>
                      {i.status === 'available'
                        ? 'خروج از فروش'
                        : 'بازگشت به فروش'}
                    </button>
                  </form>
                )}
            </article>
          ))}
        </>
      )}
      {view === 'rfid' && (
        <>
          <h2>شمارش موجودی با RFID / UID</h2>
          <p className="notice">
            اسکنر HID باید در ورودی متمرکز متن و Enter بفرستد. حالت شبیه‌سازی
            فقط ورودی آزمایشی است؛ اتصال سخت‌افزار فیزیکی تأیید نشده است. اسکن
            هرگز موجودی را تغییر نمی‌دهد.
          </p>
          {admin && (
            <form
              className="form-grid"
              onSubmit={submit(async (f) => {
                const s = await api('rfid', {
                  operation: 'create_count',
                  supplier_id: f.get('supplier_id') || undefined,
                })
                setSessionId(s.id)
                await load(batchId, s.id)
              })}
            >
              {supplierSelect(true)}
              <button disabled={busy}>شروع شمارش با تصویر موجودی</button>
            </form>
          )}
          <label>
            جلسه شمارش
            <select
              value={sessionId}
              onChange={(e) => {
                setSessionId(e.target.value)
                run(() => load(batchId, e.target.value))
              }}
            >
              <option value="">انتخاب کنید</option>
              {rfid.sessions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} · {s.status} · {date(s.created_at)}
                </option>
              ))}
            </select>
          </label>
          {rfid.session && (
            <>
              <p data-testid="count-summary">
                قطعات متمایز دیده‌شده: {rfid.distinct_count} · تکرار خواندن:{' '}
                {rfid.duplicate_reads} · دیده‌نشده: {rfid.missing.length}
              </p>
              {admin && rfid.session.status === 'open' && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={simulated}
                      onChange={(e) => setSimulated(e.target.checked)}
                    />
                    خوانش شبیه‌سازی‌شده (Mock)
                  </label>
                  <form
                    className="form-grid"
                    data-testid="scan-form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const form = e.currentTarget
                      enqueueScan(String(new FormData(form).get('scan') || ''))
                      form.reset()
                      form.querySelector('input')?.focus()
                    }}
                  >
                    <Field
                      name="scan"
                      label="EPC یا UID؛ ورودی اسکنر با Enter"
                    />
                    <button>
                      {simulated
                        ? 'ثبت اسکن شبیه‌سازی'
                        : 'ثبت ورودی HID / دستی'}
                    </button>
                  </form>
                  <p role="status">خوانش در صف: {scanPending}</p>
                  <button
                    disabled={busy || scanPending > 0}
                    onClick={() =>
                      run(() =>
                        mutate('rfid', {
                          operation: 'close_count',
                          session_id: sessionId,
                        }),
                      )
                    }
                  >
                    پایان شمارش
                  </button>
                </>
              )}
              <h3>مشاهدات</h3>
              {rfid.observations.map((o: any) => (
                <p key={o.id}>
                  <code>{o.token}</code> · {o.uid || '—'} ·{' '}
                  {status[o.classification] || o.classification} · خواندن{' '}
                  {o.read_count}
                </p>
              ))}
              <h3>انتظاررفته ولی دیده‌نشده</h3>
              {rfid.missing.map((i: any) => (
                <p key={i.item_id}>
                  <code>{i.uid}</code> ·{' '}
                  <code>{i.epc || 'بدون تگ؛ UID را بخوانید'}</code> ·{' '}
                  {weight(i.weight_mg)}
                </p>
              ))}
            </>
          )}
        </>
      )}
      {view === 'returns' && (
        <>
          <h2>مرجوعی فیزیکی؛ بدون عملیات تسویه یا استرداد مالی</h2>
          {returns.returns.map((r: any) => (
            <article className="card" key={r.id}>
              <h3>
                {r.uid} · {status[r.status]}
              </h3>
              <p>
                {r.reason} · {weight(r.weight_mg)}
              </p>
              <Link href={'/orders/' + r.order_id}>سفارش</Link>
              {admin && ['requested', 'received'].includes(r.status) && (
                <form
                  className="form-grid"
                  onSubmit={submit((f) =>
                    mutate('returns', {
                      operation:
                        r.status === 'requested' ? 'receive' : 'restock',
                      reservation_id: r.reservation_id,
                      reason: f.get('reason'),
                    }),
                  )}
                >
                  <Field name="reason" label="دلیل دریافت / بازگشت فیزیکی" />
                  <button disabled={busy}>
                    {r.status === 'requested'
                      ? 'دریافت قطعه در قرنطینه'
                      : 'بازگشت قطعه واقعی به فروش'}
                  </button>
                  {r.status === 'requested' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          mutate('returns', {
                            operation: 'reject',
                            reservation_id: r.reservation_id,
                            reason: 'درخواست توسط مدیر رد شد',
                          }),
                        )
                      }
                    >
                      رد درخواست
                    </button>
                  )}
                </form>
              )}
            </article>
          ))}
        </>
      )}
      {view === 'permissions' && admin && (
        <>
          <h2>مجوزهای مستقل؛ لغو فوری در سرور</h2>
          {managed.suppliers.map((s: any) => (
            <article className="card" key={s.id}>
              <h3>{s.name}</h3>
              {rights.available.map((p: string) => {
                const granted = rights.permissions.some(
                  (r: any) =>
                    r.supplier_id === s.id && r.permission === p && r.granted,
                )
                return (
                  <label className="permission-row" key={p}>
                    <input
                      type="checkbox"
                      aria-label={s.name + ' ' + p}
                      checked={granted}
                      disabled={busy}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setData((current: any) => ({
                          ...current,
                          rights: {
                            ...current.rights,
                            permissions: [
                              ...current.rights.permissions.filter(
                                (r: any) =>
                                  !(
                                    r.supplier_id === s.id && r.permission === p
                                  ),
                              ),
                              {
                                supplier_id: s.id,
                                permission: p,
                                granted: checked,
                              },
                            ],
                          },
                        }))
                        run(async () => {
                          try {
                            await mutate('permissions', {
                              supplier_id: s.id,
                              permission: p,
                              granted: checked,
                            })
                          } catch (error) {
                            await load()
                            throw error
                          }
                        })
                      }}
                    />
                    {permissionLabels[p]} <code>{p}</code>
                  </label>
                )
              })}
            </article>
          ))}
        </>
      )}
    </section>
  )
}
function Pair({
  item,
  busy,
  submit,
  mutate,
}: {
  item: any
  busy: boolean
  submit: any
  mutate: any
}) {
  const { run } = useDidar()
  return (
    <form
      className="form-grid"
      data-testid="epc-pair"
      onSubmit={submit((f: FormData) =>
        mutate('rfid', {
          operation: item.status === 'void' ? 'unpair' : 'pair',
          item_id: item.id,
          epc: f.get('epc'),
          reason: f.get('reason'),
        }),
      )}
    >
      {item.status !== 'void' && (
        <Field
          name="epc"
          label="EPC خام؛ تایپ، چسباندن یا HID"
          value={item.epc || ''}
        />
      )}
      <Field name="reason" label="دلیل اتصال / تعویض RFID" />
      <button disabled={busy}>
        {item.status === 'void'
          ? 'حذف اتصال تگ قطعه باطل'
          : 'اتصال / تعویض EPC'}
      </button>
      {item.epc && item.status !== 'void' && (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(() =>
              mutate('rfid', {
                operation: 'unpair',
                item_id: item.id,
                reason: 'حذف اتصال تگ توسط اپراتور',
              }),
            )
          }
        >
          حذف اتصال؛ حفظ UID
        </button>
      )}
    </form>
  )
}
