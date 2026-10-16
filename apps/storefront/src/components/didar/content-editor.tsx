'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RequireUser, useDidar } from './store'
import { ImageAsset } from './catalog'
import { contentBlockLabels as labels, ContentPreview } from './content-page'
const kinds: Record<string, string> = {
  DIDAR_HOME: 'خانه دیدار',
  MERCHANT_HOME: 'خانه فروشگاه',
  CATEGORY_LANDING: 'صفحه دسته',
  COLLECTION_LANDING: 'صفحه مجموعه',
  MERCHANT_CURATED: 'صفحه منتخب موجود',
}
const uuid = () => crypto.randomUUID()
const blankMedia = () => ({
  asset_id: '',
  mobile_asset_id: '',
  alt: '',
  caption: '',
  focal_x: 50,
  focal_y: 50,
  fit: 'CONTAIN',
})
function newBlock(type: string): any {
  return {
    id: uuid(),
    type,
    theme: 'WHITE',
    title: '',
    body: '',
    ...(['HERO_VIDEO', 'SPLIT_STORY', 'FULL_BLEED_MEDIA'].includes(type)
      ? { media: blankMedia() }
      : {}),
    ...(type === 'HERO_MEDIA_SLIDER'
      ? {
          slides: [blankMedia(), blankMedia()],
          autoplay: false,
          interval_ms: 7000,
        }
      : {}),
    ...(type === 'EDITORIAL_MOSAIC'
      ? {
          tiles: [blankMedia(), blankMedia(), blankMedia()],
          layout: 'LARGE_TWO',
        }
      : {}),
    ...(['FEATURED_PRODUCT_GRID', 'PRODUCT_CAROUSEL'].includes(type)
      ? { product_ids: [] }
      : {}),
    ...(type === 'SPACER_DIVIDER' ? { height: 40 } : {}),
  }
}
export function PageBuilder() {
  return (
    <RequireUser>
      <Editor />
    </RequireUser>
  )
}
export function PagePreview({ version }: { version: string }) {
  return (
    <RequireUser>
      <ContentPreview version={version} />
    </RequireUser>
  )
}
function Editor() {
  const { api, run, busy, user } = useDidar(),
    [index, setIndex] = useState<any>(null),
    [sid, setSid] = useState('DIDAR'),
    [detail, setDetail] = useState<any>(null),
    [blocks, setBlocks] = useState<any[]>([]),
    [assets, setAssets] = useState<any[]>([]),
    [options, setOptions] = useState<any>(null),
    [title, setTitle] = useState(''),
    [kind, setKind] = useState('DIDAR_HOME'),
    [routeKey, setRouteKey] = useState(''),
    [blockType, setBlockType] = useState('BRAND_STORY'),
    [selectedVersion, setVersion] = useState(''),
    [reason, setReason] = useState('ویرایش و انتشار محتوای تأییدشده'),
    [at, setAt] = useState(''),
    [preview, setPreview] = useState(''),
    [preset, setPreset] = useState(''),
    generation = useRef(0),
    drag = useRef<number | null>(null),
    currentSid = useRef(sid)
  currentSid.current = sid
  const loadIndex = useCallback(async () => {
    const d = await api('pages')
    setIndex(d)
    return d
  }, [api])
  useEffect(() => {
    run(async () => {
      const d = await loadIndex()
      setSid(d.scopes.global ? 'DIDAR' : d.scopes.suppliers[0]?.id || '')
      setKind(d.scopes.global ? 'DIDAR_HOME' : 'MERCHANT_HOME')
    })
  }, [loadIndex])
  const loadMedia = useCallback(async () => {
    if (!sid) return
    const marker = sid
    const d = await api('content-media?supplier_id=' + encodeURIComponent(sid))
    if (currentSid.current === marker) setAssets(d.assets)
  }, [api, sid])
  useEffect(() => {
    const gen = ++generation.current
    setDetail(null)
    setBlocks([])
    setTitle('')
    setRouteKey('')
    setVersion('')
    setPreview('')
    setAssets([])
    setOptions(null)
    setKind(sid === 'DIDAR' ? 'DIDAR_HOME' : 'MERCHANT_HOME')
    if (!sid) return
    run(async () => {
      const [m, o] = await Promise.all([
        api('content-media?supplier_id=' + encodeURIComponent(sid)),
        api('pages?options=1&supplier_id=' + encodeURIComponent(sid)),
      ])
      if (gen !== generation.current) return
      setAssets(m.assets)
      setOptions(o)
    })
    return () => {
      generation.current++
    }
  }, [api, sid])
  const open = async (id: string) => {
    const gen = generation.current
    const d = await api('pages?page_id=' + encodeURIComponent(id))
    if (gen !== generation.current) return
    setDetail(d)
    setTitle(d.page.title)
    setKind(d.page.kind)
    setRouteKey(d.page.route_key)
    setBlocks(structuredClone(d.versions[0]?.blocks || []))
    setVersion(d.versions[0]?.id || '')
    setPreview('')
  }
  const replace = (i: number, b: any) =>
    setBlocks((bs) => bs.map((x, j) => (j === i ? b : x)))
  const move = (from: number, to: number) =>
    setBlocks((bs) => {
      if (to < 0 || to >= bs.length) return bs
      const xs = [...bs]
      xs.splice(to, 0, xs.splice(from, 1)[0])
      return xs
    })
  const save = () =>
    run(async () => {
      const gen = generation.current
      const d = await api('pages', {
        operation: 'draft',
        supplier_id: sid,
        page_id: detail?.page.id,
        revision: detail?.page.revision,
        title,
        kind,
        route_key: routeKey,
        blocks,
      })
      if (gen !== generation.current) return
      await loadIndex()
      await open(d.page_id)
    })
  const action = (operation: string, extra: any = {}) =>
    run(async () => {
      const gen = generation.current
      await api('pages', {
        operation,
        page_id: detail?.page.id,
        version_id: selectedVersion,
        reason,
        idempotency_key: uuid(),
        ...(at && ['publish', 'rollback'].includes(operation)
          ? { at: new Date(at).toISOString() }
          : {}),
        ...extra,
      })
      if (gen === generation.current) {
        await open(detail.page.id)
        await loadIndex()
      }
    })
  const version = detail?.versions.find((v: any) => v.id === selectedVersion)
  return (
    <section>
      <p className="eyebrow">دیدار · مدیریت محتوای دیداری</p>
      <h1>صفحه‌ساز دیدار</h1>
      <p>
        یک صفحه، نسخه‌های ثابت و قیمت زنده از عرضه اصلی. برای انتشار، رسانه و
        محصولات باید تأیید شده باشند.
      </p>
      <label>
        دامنه صفحه
        <select
          aria-label="دامنه صفحه"
          value={sid}
          onChange={(e) => setSid(e.target.value)}
        >
          {index?.scopes.global && <option value="DIDAR">دیدار مرکزی</option>}
          {index?.scopes.suppliers.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="cms-editor-list">
        {index?.pages
          .filter((p: any) => (p.supplier_id || 'DIDAR') === sid)
          .map((p: any) => (
            <button
              key={p.id}
              disabled={busy}
              onClick={() => run(() => open(p.id))}
            >
              {p.title} · {kinds[p.kind]}
            </button>
          ))}
        <button
          disabled={busy}
          onClick={() => {
            setDetail(null)
            setTitle('')
            setRouteKey('')
            setBlocks([])
            setVersion('')
            setPreview('')
          }}
        >
          صفحه جدید
        </button>
      </div>
      <fieldset className="cms-builder-fields" disabled={busy}>
        <legend>ویرایش و رسانه صفحه</legend>
        <div className="cms-builder-layout">
          <div>
            <label>
              عنوان صفحه
              <input
                aria-label="عنوان صفحه"
                value={title}
                maxLength={160}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              نوع صفحه
              <select
                aria-label="نوع صفحه"
                value={kind}
                disabled={!!detail}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(kinds)
                  .filter(([k]) =>
                    sid === 'DIDAR'
                      ? !k.startsWith('MERCHANT')
                      : k !== 'DIDAR_HOME',
                  )
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            {!['DIDAR_HOME', 'MERCHANT_HOME'].includes(kind) && (
              <label>
                مسیر ثابت دسته، مجموعه یا منتخب
                <input
                  aria-label="مسیر ثابت صفحه"
                  value={routeKey}
                  disabled={!!detail}
                  onChange={(e) => setRouteKey(e.target.value)}
                />
              </label>
            )}
            <div className="cms-editor-actions">
              <label>
                قالب تأییدشده
                <select
                  aria-label="قالب تأییدشده"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  <option value="">انتخاب قالب</option>
                  {index?.presets.map((p: any) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                onClick={() => {
                  const p = index.presets.find((x: any) => x.code === preset)
                  if (p)
                    setBlocks(
                      p.blocks.map((b: any) => ({
                        ...structuredClone(b),
                        id: uuid(),
                      })),
                    )
                }}
                disabled={!preset}
              >
                استفاده از قالب
              </button>
            </div>
            <div className="cms-editor-actions">
              <label>
                بلوک جدید
                <select
                  aria-label="بلوک جدید"
                  value={blockType}
                  onChange={(e) => setBlockType(e.target.value)}
                >
                  {Object.entries(labels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={blocks.length >= 24}
                onClick={() => setBlocks((bs) => [...bs, newBlock(blockType)])}
              >
                افزودن بلوک
              </button>
            </div>
            {blocks.map((b, i) => (
              <article
                key={b.id}
                className="cms-block-editor"
                data-editor-block={b.type}
                draggable
                onDragStart={(e) => {
                  drag.current = i
                  e.dataTransfer.setData('text/plain', String(i))
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  if (drag.current !== null) move(drag.current, i)
                  drag.current = null
                }}
              >
                <header>
                  <h2>
                    {i + 1}. {labels[b.type]}
                  </h2>
                  <button
                    disabled={!i}
                    aria-label={'بالا بردن بلوک ' + (i + 1)}
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    disabled={i === blocks.length - 1}
                    aria-label={'پایین بردن بلوک ' + (i + 1)}
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                  <button
                    disabled={blocks.length >= 24}
                    onClick={() =>
                      setBlocks((bs) => [
                        ...bs.slice(0, i + 1),
                        { ...structuredClone(b), id: uuid() },
                        ...bs.slice(i + 1),
                      ])
                    }
                  >
                    تکثیر
                  </button>
                  <button
                    onClick={() =>
                      setBlocks((bs) => bs.filter((_, j) => j !== i))
                    }
                  >
                    حذف بلوک
                  </button>
                </header>
                <label>
                  عنوان بلوک
                  <input
                    value={b.title || ''}
                    onChange={(e) =>
                      replace(i, { ...b, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  متن
                  <textarea
                    value={b.body || ''}
                    onChange={(e) => replace(i, { ...b, body: e.target.value })}
                  />
                </label>
                <label>
                  سطح رنگ
                  <select
                    value={b.theme}
                    onChange={(e) =>
                      replace(i, { ...b, theme: e.target.value })
                    }
                  >
                    <option value="WHITE">سفید</option>
                    <option value="NAVY">سرمه‌ای</option>
                    <option value="CHAMPAGNE">شامپاینی</option>
                  </select>
                </label>
                <CTAFields
                  value={b.cta}
                  onChange={(cta) => replace(i, { ...b, cta })}
                />
                {b.media && (
                  <MediaFields
                    m={b.media}
                    assets={assets}
                    onChange={(media) => replace(i, { ...b, media })}
                  />
                )}
                {b.slides && (
                  <>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={!!b.autoplay}
                        onChange={(e) =>
                          replace(i, { ...b, autoplay: e.target.checked })
                        }
                      />
                      گردش خودکار بی‌صدا
                    </label>
                    <label>
                      فاصله گردش (میلی‌ثانیه)
                      <input
                        type="number"
                        min={5000}
                        max={30000}
                        value={b.interval_ms}
                        onChange={(e) =>
                          replace(i, {
                            ...b,
                            interval_ms: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <button
                      disabled={b.slides.length >= 8}
                      onClick={() =>
                        replace(i, {
                          ...b,
                          slides: [...b.slides, blankMedia()],
                        })
                      }
                    >
                      افزودن اسلاید
                    </button>
                  </>
                )}
                {b.tiles && (
                  <label>
                    چیدمان موزاییک
                    <select
                      value={b.layout}
                      onChange={(e) =>
                        replace(i, { ...b, layout: e.target.value })
                      }
                    >
                      <option value="LARGE_TWO">یک بزرگ و دو کوچک</option>
                      <option value="STAGGERED">پرتره پلکانی</option>
                      <option value="UNEQUAL">ستون‌های نابرابر</option>
                    </select>
                  </label>
                )}
                {['slides', 'tiles']
                  .filter((k) => b[k])
                  .map((k) => (
                    <div key={k}>
                      {b[k].map((m: any, j: number) => (
                        <fieldset key={j}>
                          <legend>
                            {k === 'slides' ? 'اسلاید' : 'تصویر'} {j + 1}
                          </legend>
                          <MediaFields
                            m={m}
                            assets={assets}
                            onChange={(m) =>
                              replace(i, {
                                ...b,
                                [k]: b[k].map((x: any, n: number) =>
                                  n === j ? m : x,
                                ),
                              })
                            }
                          />
                          <button
                            disabled={!j}
                            onClick={() => {
                              const xs = [...b[k]]
                              ;[xs[j - 1], xs[j]] = [xs[j], xs[j - 1]]
                              replace(i, { ...b, [k]: xs })
                            }}
                          >
                            بالا بردن رسانه
                          </button>
                          <button
                            disabled={b[k].length <= (k === 'tiles' ? 2 : 1)}
                            onClick={() =>
                              replace(i, {
                                ...b,
                                [k]: b[k].filter(
                                  (_: any, n: number) => n !== j,
                                ),
                              })
                            }
                          >
                            حذف رسانه
                          </button>
                        </fieldset>
                      ))}
                      {k === 'tiles' && (
                        <button
                          disabled={b.tiles.length >= 4}
                          onClick={() =>
                            replace(i, {
                              ...b,
                              tiles: [...b.tiles, blankMedia()],
                            })
                          }
                        >
                          افزودن تصویر
                        </button>
                      )}
                    </div>
                  ))}
                {b.type === 'SPLIT_STORY' && (
                  <label>
                    جای رسانه
                    <select
                      value={b.side || 'START'}
                      onChange={(e) =>
                        replace(i, { ...b, side: e.target.value })
                      }
                    >
                      <option value="START">آغاز</option>
                      <option value="END">پایان</option>
                    </select>
                  </label>
                )}
                {b.product_ids && (
                  <fieldset>
                    <legend>محصولات مجاز فعلی</legend>
                    {options?.products.map((p: any) => (
                      <label key={p.id} className="check">
                        <input
                          type="checkbox"
                          checked={b.product_ids.includes(p.id)}
                          onChange={(e) =>
                            replace(i, {
                              ...b,
                              product_ids: e.target.checked
                                ? [...b.product_ids, p.id]
                                : b.product_ids.filter(
                                    (x: string) => x !== p.id,
                                  ),
                            })
                          }
                        />
                        {p.title}
                      </label>
                    ))}
                  </fieldset>
                )}
                {b.type === 'COLLECTION_SPOTLIGHT' && (
                  <label>
                    مجموعه زنده
                    <select
                      aria-label="مجموعه زنده"
                      value={b.collection_id || ''}
                      onChange={(e) =>
                        replace(i, { ...b, collection_id: e.target.value })
                      }
                    >
                      <option value="">انتخاب مجموعه</option>
                      {options?.collections.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {b.type === 'CATEGORY_FACET_DISCOVERY' && (
                  <>
                    <label>
                      دسته
                      <select
                        value={b.category_id || ''}
                        onChange={(e) =>
                          replace(i, { ...b, category_id: e.target.value })
                        }
                      >
                        <option value="">همه خانواده‌ها</option>
                        {options?.categories.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      ویژگی کنترل‌شده
                      <select
                        value={b.facet || ''}
                        onChange={(e) =>
                          replace(i, { ...b, facet: e.target.value, value: '' })
                        }
                      >
                        <option value="">بدون ویژگی</option>
                        {options?.facets?.map((f: any) => (
                          <option key={f.code} value={f.code}>
                            {f.label || f.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      مقدار تأییدشده
                      <select
                        value={b.value || ''}
                        onChange={(e) =>
                          replace(i, { ...b, value: e.target.value })
                        }
                      >
                        <option value="">انتخاب مقدار</option>
                        {options?.facets
                          ?.find((f: any) => f.code === b.facet)
                          ?.values?.map((v: any) => (
                            <option key={v.code} value={v.code}>
                              {v.name_fa || v.label || v.code}
                            </option>
                          ))}
                      </select>
                    </label>
                  </>
                )}
                {b.type === 'SPACER_DIVIDER' && (
                  <label>
                    فاصله محدود
                    <input
                      type="number"
                      min={8}
                      max={96}
                      value={b.height}
                      onChange={(e) =>
                        replace(i, { ...b, height: Number(e.target.value) })
                      }
                    />
                  </label>
                )}
              </article>
            ))}
            <button
              className="primary"
              disabled={busy || !title || !blocks.length}
              onClick={save}
            >
              ذخیره نسخه پیش‌نویس
            </button>
            {detail && (
              <section className="card">
                <h2>بررسی و انتشار نسخه</h2>
                <label>
                  نسخه
                  <select
                    aria-label="نسخه صفحه"
                    value={selectedVersion}
                    onChange={(e) => {
                      const v = detail.versions.find(
                        (v: any) => v.id === e.target.value,
                      )
                      setVersion(v.id)
                      setBlocks(structuredClone(v.blocks))
                      setPreview('')
                    }}
                  >
                    {detail.versions.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        نسخه {v.number} · {v.status}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  دلیل اقدام
                  <input
                    aria-label="دلیل اقدام محتوا"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label>
                  زمان انتشار اختیاری
                  <input
                    aria-label="زمان انتشار"
                    type="datetime-local"
                    value={at}
                    onChange={(e) => setAt(e.target.value)}
                  />
                </label>
                <div className="cms-editor-actions">
                  <button
                    disabled={busy || !version}
                    onClick={() => setPreview(selectedVersion)}
                  >
                    پیش‌نمایش همین نسخه
                  </button>
                  <Link
                    href={'/manage/pages/preview/' + selectedVersion}
                    target="_blank"
                  >
                    باز کردن پیش‌نمایش خصوصی
                  </Link>
                  <button
                    disabled={busy || version?.status !== 'draft'}
                    onClick={() => action('review', { approved: true })}
                  >
                    تأیید نسخه
                  </button>
                  <button
                    disabled={busy || version?.status !== 'draft'}
                    onClick={() => action('review', { approved: false })}
                  >
                    رد نسخه
                  </button>
                  <button
                    className="primary"
                    disabled={busy || version?.status !== 'approved'}
                    onClick={() => action('publish')}
                  >
                    {at ? 'زمان‌بندی انتشار' : 'انتشار صفحه'}
                  </button>
                  <button
                    disabled={busy || version?.status !== 'approved'}
                    onClick={() => action('rollback')}
                  >
                    بازگشت به این نسخه
                  </button>
                  <button disabled={busy} onClick={() => action('pause')}>
                    توقف انتشار صفحه
                  </button>
                </div>
                <h3>انتشارهای ثبت‌شده</h3>
                <ul>
                  {detail.publications.map((p: any) => (
                    <li key={p.id}>
                      {p.effective_from} → {p.effective_to || 'بدون پایان'}{' '}
                      {p.cancelled ? 'لغوشده' : ''} · {p.reason}
                    </li>
                  ))}
                </ul>
                <details>
                  <summary>تاریخچه اقدامات</summary>
                  <ul>
                    {detail.events.map((e: any) => (
                      <li key={e.id}>
                        {e.created_at} · {e.action} · {e.actor_id}
                      </li>
                    ))}
                  </ul>
                </details>
              </section>
            )}
          </div>
          <aside>
            <h2>رسانه‌های همین دامنه</h2>
            <p>
              تصویر تا ۸ مگابایت؛ ویدیو MP4/WebM تا ۲۰ مگابایت و ۴۵ ثانیه. ویدیو
              پس از پردازش بی‌صداست.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget),
                  file = f.get('file') as File,
                  marker = sid
                run(async () => {
                  const data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () =>
                      resolve(String(reader.result).split(',')[1])
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                  })
                  await api('content-media', {
                    operation: 'upload',
                    supplier_id: marker,
                    idempotency_key: uuid(),
                    mime_type: file.type,
                    data,
                    alt: f.get('alt'),
                    allow_shared: f.has('allow_shared'),
                  })
                  if (currentSid.current === marker) await loadMedia()
                })
              }}
            >
              <label>
                فایل رسانه
                <input
                  aria-label="فایل رسانه صفحه"
                  type="file"
                  name="file"
                  required
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                />
              </label>
              <label>
                متن جایگزین رسانه
                <input
                  aria-label="متن جایگزین رسانه"
                  name="alt"
                  maxLength={300}
                  required
                />
              </label>
              <label className="check">
                <input type="checkbox" name="allow_shared" />
                اجازه اشتراک پس از تأیید دیدار
              </label>
              <button disabled={busy}>بارگذاری و پردازش رسانه</button>
            </form>
            {assets.map((a) => (
              <article key={a.id} className="card" data-editor-asset={a.id}>
                <ImageAsset
                  src={'/api/didar/image?id=' + a.id}
                  alt={a.alt}
                  privateImage
                />
                <p>
                  {a.alt} · {a.status} · {a.source_mime}
                </p>
                <small dir="ltr">{a.id}</small>
                <div className="cms-editor-actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api('content-media', {
                          operation: 'review',
                          asset_id: a.id,
                          approved: true,
                          visibility:
                            sid === 'DIDAR' ? 'SHARED_MASTER' : 'MERCHANT_ONLY',
                          reason,
                        })
                        await loadMedia()
                      })
                    }
                  >
                    تأیید رسانه
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api('content-media', {
                          operation: 'review',
                          asset_id: a.id,
                          approved: false,
                          reason,
                        })
                        await loadMedia()
                      })
                    }
                  >
                    برداشتن تأیید رسانه
                  </button>
                </div>
                <details>
                  <summary>رسید پردازش واقعی</summary>
                  <pre dir="ltr">{JSON.stringify(a.receipt, null, 2)}</pre>
                </details>
              </article>
            ))}
            {index?.scopes.global && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  run(async () => {
                    await api('pages', {
                      operation: 'preset',
                      code: f.get('code'),
                      name: f.get('name'),
                      blocks,
                      approved: f.has('approved'),
                    })
                    await loadIndex()
                  })
                }}
              >
                <h3>ذخیره ساختار به عنوان قالب</h3>
                <p>شناسه محصول، رسانه و پیوند خصوصی از قالب حذف می‌شود.</p>
                <label>
                  کد قالب
                  <input name="code" pattern="[a-z][a-z0-9_]{1,79}" required />
                </label>
                <label>
                  نام قالب
                  <input name="name" required />
                </label>
                <label className="check">
                  <input type="checkbox" name="approved" />
                  تأیید ساختار قالب
                </label>
                <button disabled={busy || !blocks.length}>ثبت قالب</button>
              </form>
            )}
            {user?.role === 'admin' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  run(async () => {
                    await api('pages', {
                      operation: 'operator',
                      email: f.get('email'),
                      active: f.has('active'),
                    })
                  })
                }}
              >
                <h3>مجوز عملیات محتوای مرکزی</h3>
                <label>
                  ایمیل کاربر
                  <input name="email" type="email" required />
                </label>
                <label className="check">
                  <input type="checkbox" name="active" defaultChecked />
                  فعال
                </label>
                <button disabled={busy}>ثبت مجوز محتوا</button>
              </form>
            )}
          </aside>
        </div>
      </fieldset>
      {preview && <ContentPreview key={preview} version={preview} />}
    </section>
  )
}
function CTAFields({
  value,
  onChange,
}: {
  value: any
  onChange: (x: any) => void
}) {
  const open = !!value
  return (
    <fieldset>
      <legend>پیوند داخلی اختیاری</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={open}
          onChange={(e) => {
            onChange(
              e.target.checked
                ? { label: 'مشاهده', path: '/products' }
                : undefined,
            )
          }}
        />
        نمایش پیوند
      </label>
      {open && (
        <>
          <label>
            متن پیوند
            <input
              value={value?.label || ''}
              onChange={(e) => onChange({ ...value, label: e.target.value })}
            />
          </label>
          <label>
            مسیر مجاز داخلی
            <input
              dir="ltr"
              value={value?.path || ''}
              onChange={(e) => onChange({ ...value, path: e.target.value })}
            />
          </label>
        </>
      )}
    </fieldset>
  )
}
function MediaFields({
  m,
  assets,
  onChange,
}: {
  m: any
  assets: any[]
  onChange: (x: any) => void
}) {
  return (
    <fieldset>
      <legend>رسانه و نمایش</legend>
      {['asset_id', 'mobile_asset_id'].map((k) => (
        <label key={k}>
          {k === 'asset_id' ? 'رسانه اصلی' : 'رسانه موبایل اختیاری'}
          <select
            aria-label={
              k === 'asset_id' ? 'رسانه اصلی' : 'رسانه موبایل اختیاری'
            }
            value={m[k] || ''}
            onChange={(e) => onChange({ ...m, [k]: e.target.value })}
          >
            <option value="">انتخاب رسانه</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.alt} · {a.status} · {a.source_mime}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        توضیح جایگزین
        <input
          value={m.alt || ''}
          maxLength={300}
          onChange={(e) => onChange({ ...m, alt: e.target.value })}
        />
      </label>
      <label>
        شرح رسانه
        <input
          value={m.caption || ''}
          maxLength={500}
          onChange={(e) => onChange({ ...m, caption: e.target.value })}
        />
      </label>
      <label>
        تناسب تصویر
        <select
          value={m.fit || 'CONTAIN'}
          onChange={(e) => onChange({ ...m, fit: e.target.value })}
        >
          <option value="CONTAIN">کامل بدون برش</option>
          <option value="COVER">برش هنری با حفظ تناسب</option>
        </select>
      </label>
      {['focal_x', 'focal_y'].map((k) => (
        <label key={k}>
          {k === 'focal_x' ? 'کانون افقی' : 'کانون عمودی'}
          <input
            type="range"
            min={0}
            max={100}
            value={m[k] ?? 50}
            onChange={(e) => onChange({ ...m, [k]: Number(e.target.value) })}
          />
        </label>
      ))}
      <CTAFields value={m.cta} onChange={(cta) => onChange({ ...m, cta })} />
    </fieldset>
  )
}
