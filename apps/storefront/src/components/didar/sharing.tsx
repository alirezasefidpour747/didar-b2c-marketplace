'use client'
import { useCallback, useEffect, useState } from 'react'
import { useDidar, RequireUser } from './store'
import { ProductCard } from './catalog'
import { number, money } from './locale'
export function ShareActions({ path, title }: { path: string; title: string }) {
  const [url, setURL] = useState(''),
    [status, setStatus] = useState(''),
    [native, setNative] = useState(false)
  useEffect(() => {
    setURL(new URL(path, window.location.origin).toString())
    setNative(typeof navigator.share === 'function')
  }, [path])
  const text = title + '\n' + url
  return (
    <div>
      <div className="share-actions" aria-label="اشتراک‌گذاری">
        <button
          disabled={!url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url)
              setStatus('پیوند کپی شد.')
            } catch {
              setStatus('پیوند را از کادر زیر کپی کنید.')
            }
          }}
        >
          کپی پیوند
        </button>
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={'https://wa.me/?text=' + encodeURIComponent(text)}
        >
          WhatsApp
        </a>
        <a
          target="_blank"
          rel="noopener noreferrer"
          href={
            'https://t.me/share/url?url=' +
            encodeURIComponent(url) +
            '&text=' +
            encodeURIComponent(title)
          }
        >
          Telegram
        </a>
        <a href={'sms:?body=' + encodeURIComponent(text)}>نوشتن پیامک</a>
        {native && (
          <button
            onClick={async () => {
              try {
                await navigator.share({ title, url })
              } catch {
                setStatus('اشتراک‌گذاری لغو شد.')
              }
            }}
          >
            اشتراک با تلفن
          </button>
        )}
      </div>
      <input
        aria-label="پیوند اشتراک"
        dir="ltr"
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <small role="status">{status}</small>
    </div>
  )
}
export function CuratedPage({ slug }: { slug: string }) {
  const { api, run, products, store } = useDidar(),
    [page, setPage] = useState<any>(null)
  useEffect(() => {
    let active = true
    run(async () => {
      const d = await api('sharing?slug=' + encodeURIComponent(slug))
      if (active) {
        setPage(d.page)
        await api('sharing', { kind: 'visit', slug })
      }
    })
    return () => {
      active = false
    }
  }, [api, slug])
  if (!page) return <p role="status">در حال دریافت صفحه منتخب…</p>
  return (
    <section>
      <div className="editorial-intro">
        <div>
          <p className="eyebrow">انتخاب ویژه · {store?.name}</p>
          <h1>{page.title}</h1>
        </div>
        <p>{page.intro}</p>
      </div>
      <ShareActions
        path={'/m/' + store.handle + '/c/' + page.slug}
        title={page.title}
      />
      <p className="muted">
        برای سنجش این پیوند، یک شناسه ناشناس هفت‌روزه ثبت می‌شود؛ اطلاعات تماس
        به فروشنده داده نمی‌شود. قیمت و موجودی در ثبت سفارش دوباره بررسی می‌شود.
      </p>
      <div className="products">
        {page.product_ids
          .map((id: string) => products.find((p) => p.id === id))
          .filter(Boolean)
          .map((p: any) => (
            <ProductCard key={p.id} product={p} />
          ))}
      </div>
      {!page.product_ids.length && (
        <p>عرضه موجود این صفحه موقتاً در دسترس نیست.</p>
      )}
    </section>
  )
}
export function SharingAdmin() {
  return (
    <RequireUser>
      <SharingEditor />
    </RequireUser>
  )
}
function SharingEditor() {
  const { api, run, busy } = useDidar(),
    [stores, setStores] = useState<any[]>([]),
    [sid, setSid] = useState(''),
    [data, setData] = useState<any>(null),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<any>(null)
  useEffect(() => {
    run(async () => {
      const d = await api('storefront')
      setStores(d.suppliers)
      setSid(d.suppliers[0]?.id || '')
    })
  }, [api])
  const load = useCallback(async () => {
    if (sid)
      setData(await api('sharing?supplier_id=' + encodeURIComponent(sid)))
  }, [api, sid])
  useEffect(() => {
    run(load)
    setEditing(null)
    setSelected([])
  }, [load])
  const move = (index: number, delta: number) =>
    setSelected((xs) => {
      const a = [...xs],
        next = index + delta
      if (next < 0 || next >= a.length) return a
      ;[a[index], a[next]] = [a[next], a[index]]
      return a
    })
  return (
    <section>
      <p className="eyebrow">پیوندهای منتخب فروشگاه</p>
      <h1>اشتراک محصولات من</h1>
      <p>
        ۱۰ تا ۲۰ محصول تأییدشده خود را انتخاب کنید. قیمت و موجودی از عرضه اصلی
        خوانده می‌شود.
      </p>
      <label>
        فروشگاه
        <select
          aria-label="فروشگاه اشتراک"
          value={sid}
          onChange={(e) => setSid(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <form
        className="card"
        key={editing?.id || 'new'}
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          run(async () => {
            await api('sharing', {
              kind: 'save',
              supplier_id: sid,
              id: editing?.id,
              version: editing?.version,
              title: f.get('title'),
              intro: f.get('intro'),
              published: f.has('published'),
              page_kind: f.get('page_kind'),
              product_ids: selected,
            })
            setEditing(null)
            setSelected([])
            await load()
          })
        }}
      >
        <label>
          نوع صفحه اشتراک
          <select
            name="page_kind"
            defaultValue={editing?.kind || 'CURATED'}
            disabled={!!editing}
          >
            <option value="CURATED">منتخب ۱۰ تا ۲۰ محصول</option>
            <option value="PRODUCT">اشتراک یک محصول</option>
          </select>
        </label>
        <label>
          نام صفحه منتخب
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={editing?.title}
          />
        </label>
        <label>
          معرفی صفحه
          <textarea
            name="intro"
            maxLength={2000}
            defaultValue={editing?.intro}
          />
        </label>
        <fieldset>
          <legend>محصولات مجاز · انتخاب‌شده {number(selected.length)}</legend>
          <div className="classification-grid">
            {data?.products.map((p: any) => (
              <label className="check" key={p.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  disabled={!selected.includes(p.id) && selected.length >= 20}
                  onChange={(e) =>
                    setSelected((a) =>
                      e.target.checked
                        ? [...a, p.id]
                        : a.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.title}
              </label>
            ))}
          </div>
        </fieldset>
        <ol className="share-selection">
          {selected.map((id, i) => (
            <li key={id}>
              <span>
                {number(i + 1)} ·{' '}
                {data?.products.find((p: any) => p.id === id)?.title || id}
              </span>
              <button
                type="button"
                disabled={!i}
                aria-label={'بالا بردن محصول ' + number(i + 1)}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === selected.length - 1}
                aria-label={'پایین بردن محصول ' + number(i + 1)}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setSelected((a) => a.filter((p) => p !== id))}
              >
                حذف از انتخاب
              </button>
            </li>
          ))}
        </ol>
        <label className="check">
          <input
            name="published"
            type="checkbox"
            defaultChecked={editing?.published}
          />
          انتشار صفحه منتخب
        </label>
        <button className="primary" disabled={busy || !sid}>
          ذخیره صفحه منتخب
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(null)
            setSelected([])
          }}
        >
          صفحه جدید
        </button>
      </form>
      {data?.pages.map((p: any) => (
        <article className="card" key={p.id}>
          <h2>{p.title}</h2>
          <p>
            {p.published ? 'منتشر شده' : 'پیش‌نویس'} ·{' '}
            {number(p.product_ids.length)} محصول · بازدید ثبت‌شده{' '}
            {number(p.visits)} · سفارش پرداخت‌شده {number(p.paid_orders)} · مبلغ
            ناخالص {money(p.gross_paid_irr)}
          </p>
          <button
            onClick={() => {
              setEditing(p)
              setSelected(p.product_ids)
            }}
          >
            ویرایش و ترتیب
          </button>
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api('sharing', {
                  kind: 'save',
                  supplier_id: sid,
                  id: p.id,
                  version: p.version,
                  title: p.title,
                  intro: p.intro,
                  product_ids: p.product_ids,
                  published: !p.published,
                })
                await load()
              })
            }
          >
            {p.published ? 'توقف انتشار' : 'انتشار'}
          </button>
          {p.published && data.handle && (
            <ShareActions
              path={'/m/' + data.handle + '/c/' + p.slug}
              title={p.title}
            />
          )}
        </article>
      ))}
    </section>
  )
}
