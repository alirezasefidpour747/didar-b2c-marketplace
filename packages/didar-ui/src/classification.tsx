'use client'
import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { useDidar } from './store'
const statuses: Record<string, string> = {
  pending: 'در انتظار تأیید دیدار',
  approved: 'تأیید شده',
  rejected: 'رد شده',
  retired: 'بازنشسته',
  draft: 'پیش‌نویس',
}
function useClassification(productId?: string) {
  const { api, run, setMessage, refresh } = useDidar()
  const [data, setData] = useState<any>(null)
  const load = useCallback(
    async () =>
      setData(
        await api(
          'classification' +
            (productId ? '?product_id=' + encodeURIComponent(productId) : ''),
        ),
      ),
    [api, productId],
  )
  useEffect(() => {
    let live = true
    setData(null)
    api(
      'classification' +
        (productId ? '?product_id=' + encodeURIComponent(productId) : ''),
    )
      .then((d) => {
        if (live) setData(d)
      })
      .catch((e) => {
        if (live) setMessage(e.message)
      })
    return () => {
      live = false
    }
  }, [api, productId, setMessage])
  async function save(body: any) {
    await api('manage', body)
    await Promise.all([load(), refresh()])
    setMessage('طبقه‌بندی ذخیره شد.')
  }
  return { data, save, run, load }
}
const label = (d: any, type: string, id: string, locale = 'fa') =>
  d.translations.find(
    (t: any) =>
      t.entity_type === type &&
      t.entity_id === id &&
      t.locale === locale &&
      t.status === 'approved',
  )?.label
function submit(run: any, fn: (f: FormData) => Promise<any>) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    run(() => fn(f))
  }
}
export function ProductClassification({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        طبقه‌بندی و پیشنهادها · F01–F12
      </button>
      {open ? <AssignmentEditor productId={productId} /> : null}
    </div>
  )
}
function AssignmentEditor({ productId }: { productId: string }) {
  const { user, busy } = useDidar(),
    admin = user?.role === 'admin'
  const { data, save, run } = useClassification(productId)
  const [search, setSearch] = useState(''),
    [group, setGroup] = useState('usage'),
    [selected, setSelected] = useState('')
  if (!data) return <p role="status">در حال دریافت طبقه‌بندی…</p>
  const f = data.facets.find((v: any) => v.code === group),
    values = data.values.filter(
      (v: any) =>
        v.facet_code === group &&
        v.active &&
        label(data, 'value', v.id)?.includes(search),
    )
  const current = data.assignments.filter((a: any) => a.facet_code === group)
  return (
    <div data-testid="classification-editor">
      {!admin && !data.can_suggest ? (
        <p className="notice">
          مجوز «پیشنهاد طبقه‌بندی محصول» فعال نیست؛ مدیر باید آن را در بخش
          مجوزها تأیید کند.
        </p>
      ) : null}
      <p>
        پیشنهاد تأمین‌کننده تا بررسی دیدار عمومی نمی‌شود. جایگاه تجاری یک مقدار
        دارد؛ برای تغییر، مقدار قبلی را بازنشسته کنید. کالکشن‌ها در بخش
        مجموعه‌ها مدیریت می‌شوند.
      </p>
      <label>
        گروه طبقه‌بندی
        <select
          aria-label="گروه طبقه‌بندی"
          value={group}
          onChange={(e) => {
            setGroup(e.target.value)
            setSelected('')
          }}
        >
          {data.facets
            .filter(
              (f: any) =>
                f.target === 'product' ||
                (admin && f.target === 'merchandising'),
            )
            .map((f: any) => (
              <option key={f.code} value={f.code}>
                F{String(f.number).padStart(2, '0')} ·{' '}
                {label(data, 'facet', f.code) || 'برچسب در انتظار تأیید'}
              </option>
            ))}
        </select>
      </label>
      {group === 'merchandising' ? (
        <p className="notice">
          فقط دیدار · پرفروش نیازمند شواهد و حداقل ۵ واحد فروش پرداخت‌شده است؛
          انتخاب تحریریه با برچسب «منتخب دیدار» ثبت می‌شود.
        </p>
      ) : null}
      <label>
        جستجوی مقادیر
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      <form
        className="form-grid"
        onSubmit={submit(run, async (form) => {
          const old = data.assignments.find(
            (a: any) => a.value_id === form.get('value_id'),
          )
          await save({
            kind: 'classification',
            operation: admin ? 'assign' : 'suggest',
            product_id: productId,
            value_id: form.get('value_id'),
            version: old?.version,
            reason: form.get('reason'),
            evidence: form.get('evidence'),
            ...(admin
              ? {
                  starts_at: form.get('starts_at')
                    ? new Date(String(form.get('starts_at'))).toISOString()
                    : null,
                  ends_at: form.get('ends_at')
                    ? new Date(String(form.get('ends_at'))).toISOString()
                    : null,
                }
              : {}),
          })
        })}
      >
        <label>
          {f?.mode === 'single_select'
            ? 'یک مقدار مجاز'
            : 'مقدار پیشنهادی / تأیید جدید'}
          <select
            required
            name="value_id"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">انتخاب کنید</option>
            {values.map((v: any) => (
              <option key={v.id} value={v.id}>
                {label(data, 'value', v.id)}
                {v.evidence_required ? ' · نیازمند شاهد' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          دلیل تغییر
          <textarea name="reason" minLength={5} maxLength={2000} required />
        </label>
        <label>
          شاهد و منبع (برای برچسب‌های حساس الزامی)
          <textarea name="evidence" maxLength={5000} />
        </label>
        {admin ? (
          <>
            <label>
              شروع نمایش
              <input name="starts_at" type="datetime-local" />
            </label>
            <label>
              پایان نمایش
              <input name="ends_at" type="datetime-local" />
            </label>
          </>
        ) : null}
        <button
          disabled={
            busy || !selected || !f?.active || (!admin && !data.can_suggest)
          }
        >
          {admin ? 'تأیید و ثبت مقدار' : 'ارسال پیشنهاد به دیدار'}
        </button>
      </form>
      {current.map((a: any) => (
        <article className="card" key={a.id}>
          <strong>
            {label(data, 'value', a.value_id) || 'مقدار در انتظار ترجمه'}
          </strong>{' '}
          · {statuses[a.status]}
          <p>{a.reason}</p>
          <p>{a.evidence}</p>
          {a.starts_at || a.ends_at ? (
            <p>
              بازه: {a.starts_at || 'آزاد'} — {a.ends_at || 'آزاد'}
            </p>
          ) : null}
          {admin ? (
            <form
              onSubmit={submit(run, (form) =>
                save({
                  kind: 'classification',
                  operation:
                    form.get('decision') === 'retired' ? 'retire' : 'review',
                  decision: form.get('decision'),
                  product_id: productId,
                  value_id: a.value_id,
                  version: a.version,
                  reason: form.get('reason'),
                  evidence: a.evidence,
                }),
              )}
            >
              <label>
                نتیجه
                <select name="decision">
                  <option value="approved">تأیید</option>
                  <option value="rejected">رد</option>
                  <option value="retired">بازنشسته</option>
                </select>
              </label>
              <label>
                دلیل بررسی
                <input name="reason" required minLength={5} />
              </label>
              <button disabled={busy}>ثبت بررسی</button>
            </form>
          ) : null}
        </article>
      ))}
    </div>
  )
}
export function ClassificationHub({ collections }: { collections: any[] }) {
  const { user } = useDidar(),
    admin = user?.role === 'admin'
  const { data, save, run, load } = useClassification()
  const [product, setProduct] = useState('')
  if (!data) return <p role="status">در حال دریافت واژگان…</p>
  return (
    <div>
      <h2>طبقه‌بندی محصولات و حاکمیت دیدار</h2>
      <label>
        انتخاب محصول
        <select
          aria-label="انتخاب محصول"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
        >
          <option value="">انتخاب کنید</option>
          {data.products.map((p: any) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      {product ? <AssignmentEditor key={product} productId={product} /> : null}
      {admin ? (
        <>
          <Vocabulary
            data={data}
            save={save}
            run={run}
            collections={collections}
          />
          <DiscoveryPages data={data} save={save} run={run} />
          <button onClick={() => run(load)}>تازه‌سازی واژگان</button>
        </>
      ) : null}
    </div>
  )
}
function Vocabulary({
  data,
  save,
  run,
  collections,
}: {
  data: any
  save: any
  run: any
  collections: any[]
}) {
  const [group, setGroup] = useState('usage'),
    [search, setSearch] = useState(''),
    [entity, setEntity] = useState('facet:usage')
  const f = data.facets.find((f: any) => f.code === group),
    values = data.values.filter(
      (v: any) =>
        v.facet_code === group &&
        `${v.code} ${label(data, 'value', v.id) || ''}`.includes(search),
    )
  const entities = [
    ...data.facets.map((f: any) => ({
      type: 'facet',
      id: f.code,
      name: label(data, 'facet', f.code) || f.code,
    })),
    ...data.values
      .filter((v: any) => v.facet_code === group)
      .map((v: any) => ({
        type: 'value',
        id: v.id,
        name: label(data, 'value', v.id) || v.code,
      })),
    ...collections.map((c: any) => ({
      type: 'collection',
      id: c.id,
      name: c.name,
    })),
    ...data.pages.map((p: any) => ({ type: 'page', id: p.id, name: p.name })),
  ]
  const separator = entity.indexOf(':')
  const type = entity.slice(0, separator),
    id = entity.slice(separator + 1)
  const metadataForm = (v: any, kind: string) => (
    <form
      className="inline-form"
      key={(v.id || v.code) + ':' + v.version}
      onSubmit={submit(run, (form) =>
        save({
          kind: 'vocabulary',
          operation: kind,
          id: v.id || v.code,
          version: v.version,
          active: form.get('active') === 'on',
          visible: form.get('visible') === 'on',
          sort_order: Number(form.get('sort_order')),
          reason: form.get('reason'),
        }),
      )}
    >
      <strong>
        {label(
          data,
          kind === 'facet_update' ? 'facet' : 'value',
          v.id || v.code,
        ) || v.code}
      </strong>
      <code dir="ltr">{v.code}</code>
      <label>
        <input type="checkbox" name="active" defaultChecked={v.active} />
        فعال
      </label>
      <label>
        <input type="checkbox" name="visible" defaultChecked={v.visible} />
        نمایش عمومی
      </label>
      <label>
        ترتیب
        <input
          type="number"
          min={0}
          max={10000}
          name="sort_order"
          defaultValue={v.sort_order}
        />
      </label>
      <label>
        دلیل تغییر
        <input name="reason" required minLength={5} />
      </label>
      <button>ذخیره وضعیت</button>
    </form>
  )
  return (
    <details className="card">
      <summary>واژگان کنترل‌شده، ترجمه و بازبینی</summary>
      <p>
        ویترین فعال فقط فارسی است. عربی و فرانسوی در انتظار بازبینی مالک
        می‌مانند؛ ثبت ترجمه، زبان ویترین را فعال نمی‌کند. کدها دائمی‌اند و حذف
        نمی‌شوند.
      </p>
      <label>
        گروه واژگان
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value)
            setEntity('facet:' + e.target.value)
          }}
        >
          {data.facets.map((f: any) => (
            <option key={f.code} value={f.code}>
              {label(data, 'facet', f.code) || f.code}
            </option>
          ))}
        </select>
      </label>
      {metadataForm(f, 'facet_update')}
      <label>
        جستجوی واژه
        <input value={search} onChange={(e) => setSearch(e.target.value)} />
      </label>
      {values.map((v: any) => (
        <details key={v.id}>
          <summary>{label(data, 'value', v.id) || v.code}</summary>
          {metadataForm(v, 'value_update')}
          <ul>
            {['fa', 'en', 'ar', 'fr'].map((locale) => (
              <li key={locale}>
                {locale}:{' '}
                {label(data, 'value', v.id, locale) ||
                  'در انتظار ترجمه و بررسی'}
              </li>
            ))}
          </ul>
        </details>
      ))}
      <form
        className="form-grid"
        onSubmit={submit(run, (form) =>
          save({
            kind: 'vocabulary',
            operation: 'value_create',
            facet_code: group,
            code: form.get('code'),
            sort_order: 0,
            evidence_required:
              group === 'heritage' || form.get('evidence') === 'on',
          }),
        )}
      >
        <h3>افزودن مقدار کنترل‌شده</h3>
        <label>
          کد دائمی انگلیسی
          <input name="code" pattern="[a-z][a-z0-9_]+" required />
        </label>
        <label>
          <input
            name="evidence"
            type="checkbox"
            defaultChecked={group === 'heritage'}
          />
          نیازمند شاهد
        </label>
        <button>ایجاد مقدار؛ سپس ثبت ترجمه</button>
      </form>
      <form
        className="form-grid"
        onSubmit={submit(run, (form) =>
          save({
            kind: 'vocabulary',
            operation: 'translation_draft',
            entity_type: type,
            entity_id: id,
            locale: form.get('locale'),
            label: form.get('label'),
            source_ref: form.get('source_ref'),
          }),
        )}
      >
        <h3>پیش‌نویس ترجمه</h3>
        <label>
          موضوع ترجمه
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            {entities.map((e) => (
              <option key={e.type + e.id} value={e.type + ':' + e.id}>
                {e.type} · {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          زبان
          <select name="locale">
            {['fa', 'en', 'ar', 'fr'].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          برچسب
          <input name="label" required minLength={2} maxLength={200} />
        </label>
        <label>
          منبع
          <input name="source_ref" maxLength={500} />
        </label>
        <button>ثبت پیش‌نویس</button>
      </form>
      <h3>بازبینی پیش‌نویس‌ها</h3>
      {data.translations
        .filter((t: any) => t.status === 'draft')
        .map((t: any) => (
          <form
            key={t.id}
            className="card"
            onSubmit={submit(run, (form) =>
              save({
                kind: 'vocabulary',
                operation: 'translation_review',
                id: t.id,
                decision: form.get('decision'),
                reason: form.get('reason'),
              }),
            )}
          >
            <p>
              {t.entity_id} · {t.locale} · {t.label}
            </p>
            <label>
              نتیجه
              <select name="decision">
                <option value="approved">تأیید مالک</option>
                <option value="rejected">رد</option>
              </select>
            </label>
            <label>
              دلیل بررسی
              <input name="reason" required minLength={5} />
            </label>
            <button>ثبت بررسی ترجمه</button>
          </form>
        ))}
    </details>
  )
}
function DiscoveryPages({
  data,
  save,
  run,
}: {
  data: any
  save: any
  run: any
}) {
  const form = (p: any) => (
    <form
      className="card form-grid"
      key={(p?.id || 'new') + ':' + (p?.version || 0)}
      onSubmit={submit(run, (f) =>
        save({
          kind: 'curated_page',
          id: p?.id,
          version: p?.version,
          name: f.get('name'),
          slug: f.get('slug'),
          page_kind: f.get('page_kind'),
          query: JSON.parse(String(f.get('query'))),
          active: f.get('active') === 'on',
          sort_order: Number(f.get('sort_order')),
          starts_at: f.get('starts_at')
            ? new Date(String(f.get('starts_at'))).toISOString()
            : null,
          ends_at: f.get('ends_at')
            ? new Date(String(f.get('ends_at'))).toISOString()
            : null,
          reason: f.get('reason'),
        }),
      )}
    >
      <label>
        عنوان فارسی
        <input name="name" defaultValue={p?.name} required />
      </label>
      <label>
        نشانی
        <input
          name="slug"
          defaultValue={p?.slug}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
        />
      </label>
      <label>
        نوع صفحه
        <select name="page_kind" defaultValue={p?.kind || 'curated'}>
          <option value="lifestyle">سبک زندگی</option>
          <option value="occasion">مناسبت</option>
          <option value="heritage">میراث</option>
          <option value="curated">منتخب دیدار</option>
        </select>
      </label>
      <label>
        فیلترهای کنترل‌شده JSON
        <textarea
          name="query"
          defaultValue={JSON.stringify(
            p?.query || { usage: ['everyday'] },
            null,
            2,
          )}
          required
          dir="ltr"
        />
      </label>
      <label>
        <input
          type="checkbox"
          name="active"
          defaultChecked={p?.active ?? true}
        />
        فعال
      </label>
      <label>
        ترتیب
        <input
          type="number"
          name="sort_order"
          min={0}
          max={10000}
          defaultValue={p?.sort_order || 0}
        />
      </label>
      <label>
        شروع
        <input
          name="starts_at"
          type="datetime-local"
          defaultValue={
            p?.starts_at
              ? new Date(
                  Date.parse(p.starts_at) -
                    new Date(p.starts_at).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : ''
          }
        />
      </label>
      <label>
        پایان
        <input
          name="ends_at"
          type="datetime-local"
          defaultValue={
            p?.ends_at
              ? new Date(
                  Date.parse(p.ends_at) -
                    new Date(p.ends_at).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : ''
          }
        />
      </label>
      <label>
        دلیل تغییر
        <input name="reason" required minLength={5} />
      </label>
      <button>ذخیره صفحه منتخب</button>
    </form>
  )
  return (
    <details className="card">
      <summary>صفحات سبک زندگی، مناسبت، میراث و منتخب</summary>
      <p>
        فیلترهای صفحه با انتخاب مشتری ترکیب می‌شوند. صفحه خالی با پیام صادقانه
        نمایش داده می‌شود.
      </p>
      {form(null)}
      {data.pages.map(form)}
    </details>
  )
}
export function CollectionGovernance({
  collection: c,
  managed,
}: {
  collection?: any
  managed: any
}) {
  const data = managed.classification_metadata
  const types =
    data?.values.filter(
      (v: any) => v.facet_code === 'collection_type' && v.active,
    ) || []
  return (
    <>
      <input type="hidden" name="version" value={c?.version || ''} />
      <label>
        نوع کالکشن F11
        <select
          key={types.length ? 'loaded' : 'loading'}
          name="type_code"
          defaultValue={c?.type_code || 'editorial'}
        >
          <option value="">بدون نوع (پیش‌نویس)</option>
          {types.map((v: any) => (
            <option key={v.code} value={v.code}>
              {label(data, 'value', v.id) || v.code}
            </option>
          ))}
        </select>
      </label>
      <label>
        مالک
        <select
          name="owner_supplier_id"
          defaultValue={c?.owner_supplier_id || ''}
        >
          <option value="">دیدار</option>
          {managed.suppliers?.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        توضیح مجموعه
        <textarea
          name="collection_description"
          defaultValue={c?.description || ''}
          maxLength={2000}
        />
      </label>
      <label>
        تصویر مجموعه
        <select name="image_id" defaultValue={c?.image_id || ''}>
          <option value="">بدون تصویر</option>
          {managed.products.flatMap((p: any) =>
            (p.images || []).map((i: any) => (
              <option key={i.id} value={i.id}>
                {p.title} · {i.alt || i.id}
              </option>
            )),
          )}
        </select>
      </label>
      <label>
        شاهد مجموعه (برای نسخه محدود الزامی)
        <textarea
          name="collection_evidence"
          defaultValue={c?.evidence || ''}
          maxLength={5000}
        />
      </label>
      <label>
        ترتیب مجموعه
        <input
          name="collection_sort"
          type="number"
          min={0}
          max={10000}
          defaultValue={c?.sort_order || 0}
        />
      </label>
      {[
        ['collection_active', 'فعال', c?.active ?? true],
        ['collection_published', 'انتشار عمومی', c?.published ?? true],
        ['collection_approved', 'تأیید دیدار', c?.approved ?? true],
      ].map(([name, title, on]) => (
        <label key={String(name)}>
          <input
            type="checkbox"
            name={String(name)}
            defaultChecked={Boolean(on)}
          />
          {title}
        </label>
      ))}
    </>
  )
}
export const collectionFields = (f: FormData) => ({
  evidence: f.get('collection_evidence') || '',
  version: f.get('version') ? Number(f.get('version')) : undefined,
  type_code: f.get('type_code'),
  owner_supplier_id: f.get('owner_supplier_id') || null,
  description: f.get('collection_description'),
  image_id: f.get('image_id') || null,
  sort_order: Number(f.get('collection_sort') || 0),
  active: f.get('collection_active') === 'on',
  published: f.get('collection_published') === 'on',
  approved: f.get('collection_approved') === 'on',
})
