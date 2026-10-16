'use client'
import { useCallback, useEffect, useState, useRef } from 'react'
import { RequireUser, useDidar, ScopedLink as Link } from './store'
import { ProductFields, productData } from './manage'
import { ProductClassification } from './classification'
import { ImageAsset } from './catalog'
import { number, date } from './locale'
export function Onboarding() {
  return (
    <RequireUser>
      <Wizard />
    </RequireUser>
  )
}
function Wizard() {
  const { api, run, busy, user, setMessage } = useDidar(),
    [data, setData] = useState<any>(null),
    [media, setMedia] = useState<any>(null),
    [sid, setSid] = useState(''),
    [mode, setMode] = useState('new'),
    [requestKey, setRequestKey] = useState(() => crypto.randomUUID()),
    [upload, setUpload] = useState<any>(null),
    [receipt, setReceipt] = useState<any>(null)
  const currentScope = useRef(sid)
  currentScope.current = sid
  const generation = useRef(0)
  const validData = !sid || data?.supplier?.id === sid
  const load = useCallback(async () => {
    const target = sid,
      version = ++generation.current
    const d = await api(
      'onboarding' + (sid ? '?supplier_id=' + encodeURIComponent(sid) : ''),
    )
    if (target !== currentScope.current || version !== generation.current)
      return
    setData(d)
    if (!sid && d.supplier) setSid(d.supplier.id)
    if (d.supplier && !d.pending_approval) {
      const m = await api(
        'media?supplier_id=' + encodeURIComponent(d.supplier.id),
      )
      if (target === currentScope.current && version === generation.current)
        setMedia(m)
    } else setMedia(null)
  }, [api, sid])
  useEffect(() => {
    run(load)
  }, [load])
  async function submit(body: any) {
    await api('onboarding', {
      operation: 'request',
      supplier_id: sid,
      idempotency_key: requestKey,
      ...body,
    })
    setRequestKey(crypto.randomUUID())
    setMessage('درخواست با هویت ثبت‌کننده واقعی برای تأیید دیدار ذخیره شد.')
    await load()
  }
  return (
    <section>
      <p className="eyebrow">همراه ثبت و آماده‌سازی محصول</p>
      <h1>شروع فروش در دیدار</h1>
      <p>
        محصول مشترک، تصویر بررسی‌شده و قطعه با وزن واقعی؛ همه مراحل به سابقه
        اصلی شما متصل می‌شوند.
      </p>
      <label>
        فروشنده برای همراهی
        <select
          aria-label="فروشنده برای همراهی"
          value={sid}
          onChange={(e) => {
            setSid(e.target.value)
            setUpload(null)
            setReceipt(null)
          }}
        >
          {data?.suppliers?.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!data?.suppliers?.length && (
        <p>
          حساب همکار شما هنوز مجوز همراهی فروشنده ندارد. مدیر دیدار دسترسی محدود
          را در مدیریت ویترین تعیین می‌کند.
        </p>
      )}
      {validData && data?.supplier && (
        <>
          <ol className="onboarding-stages">
            <li>
              عضویت:{' '}
              {data.supplier.status === 'approved'
                ? 'تأییدشده'
                : 'در انتظار بررسی دیدار'}
            </li>
            <li>
              نوع تجاری: <bdi>{data.supplier.commercial_type}</bdi> · پروفایل{' '}
              {data.profile?.name || 'نیازمند تنظیم دیدار'}
            </li>
            <li>
              ویترین:{' '}
              {data.store?.approved && data.store?.published
                ? 'منتشر شده'
                : 'نیازمند تنظیم و تأیید'}
            </li>
            <li>
              درخواست محصول: {number(data.requests?.length || 0)} · تصویر
              پردازش‌شده: {number(media?.assets?.length || 0)}
            </li>
            <li>
              قطعه پذیرفته‌شده آماده فروش:{' '}
              {number(
                data.products?.reduce(
                  (n: number, p: any) => n + p.accepted_uids,
                  0,
                ) || 0,
              )}
            </li>
          </ol>
          <div className="browse-links">
            <Link href="/manage/storefront">جزئیات کسب‌وکار و ویترین</Link>
            <Link href="/manage/pricing">نوع تجاری و پروفایل مصوب</Link>
            <Link href="/manage/operations">پذیرش قطعه و UID</Link>
            <Link href="/manage/sharing">ساخت پیوند اشتراک</Link>
            {data.store && (
              <a href={'/m/' + data.store.handle}>مشاهده ویترین</a>
            )}
          </div>
        </>
      )}
      {validData && data?.pending_approval && (
        <p className="card">
          درخواست عضویت شما ثبت شده است. بارگذاری و عرضه پس از تأیید دیدار و
          صدور مجوز آغاز می‌شود.
        </p>
      )}
      {validData && data?.supplier && !data.pending_approval && (
        <>
          <section className="card">
            <h2>۱. انتخاب محصول مشترک یا پیشنهاد محصول جدید</h2>
            <label>
              روش ثبت
              <select
                aria-label="روش ثبت محصول"
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value)
                  setRequestKey(crypto.randomUUID())
                }}
              >
                <option value="new">پیشنهاد محصول جدید</option>
                <option value="join">
                  پیوستن به محصول موجود؛ بدون ساخت نسخه تکراری
                </option>
              </select>
            </label>
            <form
              className="form-grid"
              key={mode + sid}
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                run(() =>
                  submit({
                    ...(mode === 'new'
                      ? { ...productData(f), active: true }
                      : { existing_product_id: f.get('existing_product_id') }),
                    sku: f.get('sku'),
                    making_mode: f.get('making_mode'),
                    making_bps: Number(f.get('making_bps') || 0),
                    making_weight_mg: Number(f.get('making_weight_mg') || 0),
                  }),
                )
              }}
            >
              {mode === 'new' ? (
                <ProductFields request categories={data.categories || []} />
              ) : (
                <label>
                  محصول مشترک موجود
                  <select name="existing_product_id" required>
                    {data.masters?.map((p: any) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                SKU فروشنده
                <input name="sku" maxLength={80} required dir="ltr" />
              </label>
              <label>
                نوع اجرت پیشنهادی
                <select name="making_mode">
                  <option value="percent">درصد طلایی</option>
                  <option value="fixed_gold">وزن طلای ثابت</option>
                </select>
              </label>
              <label>
                اجرت پیشنهادی bps
                <input
                  name="making_bps"
                  type="number"
                  min={0}
                  max={10000}
                  defaultValue={1200}
                />
              </label>
              <label>
                طلای ثابت اجرت میلی‌گرم
                <input
                  name="making_weight_mg"
                  type="number"
                  min={0}
                  max={1000000}
                  defaultValue={0}
                />
              </label>
              <button className="primary" disabled={busy}>
                ارسال برای بررسی دیدار
              </button>
            </form>
          </section>
          <section className="card">
            <h2>۲. درخواست‌های ثبت‌شده و بررسی دیدار</h2>
            {data.requests.map((r: any) => (
              <article className="onboarding-row" key={r.id}>
                <h3>{r.payload.title}</h3>
                <p>
                  {r.status === 'approved'
                    ? 'تأییدشده'
                    : r.status === 'rejected'
                      ? 'رد شده'
                      : 'در انتظار بررسی'}{' '}
                  · SKU{' '}
                  <bdi>{r.payload.proposed_offer?.sku || 'ثبت قدیمی'}</bdi> ·{' '}
                  {date(r.created_at)}
                </p>
                <small>
                  ثبت‌کننده{' '}
                  <bdi>{r.created_by || 'در سابقه قدیمی ثبت نشده'}</bdi>
                  {r.assisted_by_agent && (
                    <>
                      {' '}
                      · همکار <bdi>{r.assisted_by_agent}</bdi>
                    </>
                  )}
                </small>
                {r.reason && <p>{r.reason}</p>}
                {user?.role === 'admin' && r.status === 'pending' && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const f = new FormData(e.currentTarget)
                      run(async () => {
                        await api('manage', {
                          kind: 'review_request',
                          id: r.id,
                          decision: f.get('decision'),
                          reason: f.get('reason'),
                          ...(f.get('category_id')
                            ? { category_id: f.get('category_id') }
                            : {}),
                        })
                        await load()
                      })
                    }}
                  >
                    <label>
                      نتیجه بررسی محصول
                      <select name="decision">
                        <option value="approved">تأیید در کاتالوگ مشترک</option>
                        <option value="rejected">رد</option>
                      </select>
                    </label>
                    {!r.payload.join_product_id && (
                      <label>
                        زیردسته بررسی‌شده
                        <select
                          name="category_id"
                          aria-label="زیردسته بررسی‌شده"
                          defaultValue={r.payload.category_id || ''}
                        >
                          <option value="">بدون اصلاح دسته پیشنهادی</option>
                          {data.categories
                            .filter((c: any) => c.kind === 'subcategory')
                            .map((c: any) => {
                              const parent = data.categories.find(
                                  (x: any) => x.id === c.parent_id,
                                ),
                                family = data.categories.find(
                                  (x: any) => x.id === parent?.parent_id,
                                )
                              return (
                                <option key={c.id} value={c.id}>
                                  {[family?.name, parent?.name, c.name]
                                    .filter(Boolean)
                                    .join(' / ')}
                                </option>
                              )
                            })}
                        </select>
                      </label>
                    )}
                    <label>
                      دلیل بررسی محصول
                      <input name="reason" required />
                    </label>
                    <button disabled={busy}>ثبت بررسی محصول</button>
                  </form>
                )}
              </article>
            ))}
          </section>
          <section className="card">
            <h2>۳. تصویر محصول؛ بهینه‌سازی خودکار</h2>
            <p>
              JPEG، PNG یا WebP تا ۸ مگابایت و ۳۲ مگاپیکسل؛ بدون تغییر شکل زیور.
              اطلاعات EXIF و GPS حذف می‌شوند. تصویر تا تأیید دیدار خصوصی
              می‌ماند.
            </p>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                run(async () => {
                  if (!upload) throw new Error('ابتدا تصویر را انتخاب کنید.')
                  const target = String(f.get('target') || '').split(':')
                  const d = await api('media', {
                    operation: 'upload',
                    supplier_id: sid,
                    ...(target[0] === 'r'
                      ? { request_id: target[1] }
                      : { product_id: target[1] }),
                    alt: f.get('alt'),
                    allow_shared: f.has('allow_shared'),
                    mime_type: upload.mime,
                    data: upload.data,
                    idempotency_key: upload.key,
                  })
                  setReceipt({ ...d.receipt, id: d.id })
                  await load()
                })
              }}
            >
              <label>
                محصول یا درخواست تصویر
                <select
                  aria-label="محصول یا درخواست تصویر"
                  name="target"
                  required
                >
                  <option value="">انتخاب کنید</option>
                  {data.requests
                    .filter((r: any) => r.status !== 'rejected')
                    .map((r: any) => (
                      <option key={r.id} value={'r:' + r.id}>
                        درخواست · {r.payload.title}
                      </option>
                    ))}
                  {data.products.map((p: any) => (
                    <option key={p.id} value={'p:' + p.id}>
                      محصول · {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                فایل تصویر
                <input
                  aria-label="فایل تصویر"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    setUpload(null)
                    setReceipt(null)
                    if (!file) return
                    run(async () => {
                      if (file.size > 8 * 1024 * 1024)
                        throw new Error('حجم تصویر باید حداکثر ۸ مگابایت باشد.')
                      const bytes = new Uint8Array(await file.arrayBuffer())
                      let binary = ''
                      for (let i = 0; i < bytes.length; i += 8192)
                        binary += String.fromCharCode(
                          ...bytes.subarray(i, i + 8192),
                        )
                      setUpload({
                        data: btoa(binary),
                        mime: file.type,
                        key: crypto.randomUUID(),
                      })
                    })
                  }}
                />
              </label>
              <label>
                شرح دسترس‌پذیر تصویر
                <input name="alt" required maxLength={300} />
              </label>
              <label className="check">
                <input type="checkbox" name="allow_shared" />
                اجازه استفاده تصویر در محصول مشترک پس از بررسی دیدار؛ اختیاری
              </label>
              <button disabled={busy || !upload} className="primary">
                پردازش و ذخیره تصویر
              </button>
            </form>
            {receipt && (
              <div role="status" data-testid="media-receipt">
                <h3>تصویر دریافت و بهینه شد</h3>
                <p>
                  جهت تصویر اصلاح شد؛ اطلاعات خصوصی حذف شد. حجم ورودی{' '}
                  {number(receipt.source.bytes)} بایت؛ WebP آماده است.
                </p>
                <ul>
                  {receipt.variants.map((v: any) => (
                    <li key={v.kind}>
                      <bdi>
                        {v.kind} · {v.width}×{v.height}
                      </bdi>{' '}
                      · {number(v.bytes)} بایت
                    </li>
                  ))}
                </ul>
                <ImageAsset
                  src={'/api/didar/image?id=' + receipt.id + '&variant=medium'}
                  alt="پیش‌نمایش تصویر پردازش‌شده"
                  privateImage
                  className="media-preview"
                />
              </div>
            )}
          </section>
          <section className="card">
            <h2>۴. تصاویر و تأیید محتوا</h2>
            <div className="media-assets">
              {media?.assets.map((a: any) => (
                <article key={a.id} className="onboarding-row">
                  <ImageAsset
                    src={'/api/didar/image?id=' + a.id + '&variant=card'}
                    alt={a.alt}
                    privateImage
                    className="media-preview"
                  />
                  <h3>{a.alt}</h3>
                  <p>
                    {a.status === 'approved'
                      ? 'تصویر تأییدشده'
                      : a.status === 'rejected'
                        ? 'رد یا از انتشار خارج شده'
                        : 'منتظر بررسی دیدار'}{' '}
                    ·{' '}
                    {a.visibility === 'SHARED_MASTER'
                      ? 'مشترک کاتالوگ'
                      : 'فقط عرضه مجاز فروشنده'}
                  </p>
                  <small>
                    بارگذار <bdi>{a.uploaded_by}</bdi> · تأییدکننده{' '}
                    <bdi>{a.approved_by || 'هنوز تأیید نشده'}</bdi>
                  </small>
                  {user?.role === 'admin' && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const f = new FormData(e.currentTarget)
                        run(async () => {
                          await api('media', {
                            operation: 'review',
                            asset_id: a.id,
                            approved: f.get('decision') === 'approved',
                            visibility: f.get('visibility'),
                            reason: f.get('reason'),
                          })
                          await load()
                        })
                      }}
                    >
                      <label>
                        بررسی تصویر
                        <select name="decision">
                          <option value="approved">تأیید</option>
                          <option value="rejected">رد / توقف انتشار</option>
                        </select>
                      </label>
                      <label>
                        گستره تصویر
                        <select name="visibility" defaultValue={a.visibility}>
                          <option value="MERCHANT_ONLY">فقط فروشنده</option>
                          {a.allow_shared && (
                            <option value="SHARED_MASTER">
                              محصول مشترک؛ با اجازه بارگذار
                            </option>
                          )}
                        </select>
                      </label>
                      <label>
                        دلیل بررسی تصویر
                        <input name="reason" required />
                      </label>
                      <button disabled={busy || !a.product_id}>
                        ثبت بررسی تصویر
                      </button>
                      {!a.product_id && (
                        <small>ابتدا درخواست محصول را بررسی کنید.</small>
                      )}
                    </form>
                  )}
                </article>
              ))}
            </div>
          </section>
          {user?.role === 'admin' && media?.policy && (
            <form
              className="card form-grid"
              key={'policy-' + media.policy.version}
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                run(async () => {
                  await api('media', {
                    operation: 'policy',
                    version: media.policy.version,
                    card_width: Number(f.get('card_width')),
                    medium_width: Number(f.get('medium_width')),
                    zoom_width: Number(f.get('zoom_width')),
                    quality: Number(f.get('quality')),
                    max_variant_bytes: Number(f.get('max_variant_bytes')),
                  })
                  await load()
                })
              }}
            >
              <h2>اندازه و کیفیت مرکزی تصاویر</h2>
              {[
                ['card_width', 'کارت', 160, 800],
                ['medium_width', 'صفحه محصول', 400, 1600],
                ['zoom_width', 'بزرگ‌نمایی', 800, 2400],
                ['quality', 'کیفیت WebP', 60, 90],
                [
                  'max_variant_bytes',
                  'حداکثر حجم هر خروجی بایت',
                  16384,
                  786432,
                ],
              ].map(([k, label, min, max]) => (
                <label key={k}>
                  {' '}
                  {label}
                  <input
                    name={String(k)}
                    type="number"
                    min={min}
                    max={max}
                    defaultValue={media.policy[k]}
                    required
                  />
                </label>
              ))}
              <button disabled={busy}>ذخیره سیاست تصویر</button>
            </form>
          )}
          <section className="card">
            <h2>۵. عرضه، طبقه‌بندی تکمیلی و پذیرش واقعی</h2>
            <p>
              اجرت و SKU پیشنهادی برای بررسی ثبت شده‌اند. ساخت موجودی قابل فروش
              فقط از پذیرش وزن واقعی و تأیید قطعات انجام می‌شود؛ این صفحه UID یا
              موجودی فرضی ایجاد نمی‌کند. برچسب و RFID اختیاری از همان ابزارهای
              موجود استفاده می‌کنند.
            </p>
            {data.products.map((p: any) => (
              <article className="onboarding-row" key={p.id}>
                <h3>{p.title}</h3>
                <p>
                  قطعات پذیرفته‌شده آماده فروش: {number(p.accepted_uids)} ·
                  عرضه‌ها: {number(p.offers.length)}
                </p>
                {(user?.role === 'admin' || user?.role === 'supplier') && (
                  <ProductClassification productId={p.id} />
                )}
                <Link href="/manage/operations">پذیرش وزن دقیق و SKU</Link>
              </article>
            ))}
          </section>
          <section className="card">
            <h2>رویدادهای همراهی واقعی</h2>
            <ul>
              {data.events.map((e: any, i: number) => (
                <li key={i}>
                  <bdi>
                    {e.action} · {e.actor_id}
                  </bdi>{' '}
                  · {date(e.created_at)}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  )
}
