'use client'
import { ShareActions } from './sharing'
import { ScopedLink as Link } from './store'
import { useEffect, useState } from 'react'
import {
  useDidar,
  PaymentMethodPicker,
  type Product,
  type Offer,
} from './store'
import { money, weight, number, date } from './locale'
export function ImageAsset({
  src,
  alt,
  privateImage = false,
  className,
}: {
  src: string
  alt: string
  privateImage?: boolean
  className?: string
}) {
  const [blob, setBlob] = useState('')
  useEffect(() => {
    if (!privateImage) return
    const controller = new AbortController()
    let owned = ''
    fetch(src, {
      headers: {
        authorization:
          'Bearer ' + (sessionStorage.getItem('didar-session') || ''),
      },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('image')
        owned = URL.createObjectURL(await r.blob())
        setBlob(owned)
      })
      .catch(() => {})
    return () => {
      controller.abort()
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [src, privateImage])
  const url = privateImage ? blob : src
  return url ? (
    <img className={className} src={url} alt={alt} loading="lazy" />
  ) : (
    <div className="photo-placeholder" role="img" aria-label={alt}>
      در حال دریافت تصویر…
    </div>
  )
}
export function ProductImage({
  product,
  index = 0,
}: {
  product: Product
  index?: number
}) {
  const image = product.images?.[index]
  return image ? (
    <ImageAsset
      className="product-photo"
      src={image.url}
      alt={image.alt || product.title}
      privateImage={
        product.active === false ||
        product.published === false ||
        product.approved === false
      }
    />
  ) : (
    <div className="photo-placeholder">
      <span aria-hidden="true">◇</span>
      <p>تصویر محصول هنوز بارگذاری نشده</p>
      <small>برای مشاهده مشخصات و وزن دقیق وارد شوید</small>
    </div>
  )
}
export function OfferCard({ offer }: { offer: Offer }) {
  const { add, busy, paymentMethod } = useDidar()
  const o = { ...offer, price: offer.prices?.[paymentMethod] ?? offer.price }
  return (
    <div className="offer" data-offer-id={o.id}>
      <div>
        <strong>{o.supplier}</strong>
        <small>
          {o.stock_mode === 'itemized'
            ? 'موجودی قطعات تأییدشده'
            : 'موجودی تجمیعی قدیمی'}
        </small>
        <span>
          {weight(o.weight_mg)} · موجودی {number(o.quantity)}
        </span>
      </div>
      {o.price ? (
        <b>{money(o.price.total_irr)}</b>
      ) : (
        <p>قیمت معتبر در دسترس نیست.</p>
      )}
      <details>
        <summary>جزئیات قیمت</summary>
        <PricingBreakdown value={o.price} />
        {o.terms && <p>شرایط تأمین: {o.terms}</p>}
      </details>
      <button disabled={!o.quantity || !o.price || busy} onClick={() => add(o)}>
        {o.quantity ? 'افزودن به سبد +' : 'ناموجود'}
      </button>
    </div>
  )
}
export function ProductCard({ product: p }: { product: Product }) {
  return (
    <article className="product">
      <Link
        href={p.canonical_path || '/products/' + p.id}
        aria-label={'مشاهده ' + p.title}
      >
        <ProductImage product={p} />
      </Link>
      <div className="product-body">
        <small>
          {p.category} · عیار {number(p.purity)}
        </small>
        <h3>
          <Link href={p.canonical_path || '/products/' + p.id}>{p.title}</Link>
        </h3>
        <p>{p.description}</p>
        <div className="offer-list">
          {p.offers.map((o) => (
            <OfferCard key={o.id} offer={o} />
          ))}
          {!p.offers.length && (
            <p className="muted">در حال حاضر عرضه فعال ندارد.</p>
          )}
        </div>
      </div>
    </article>
  )
}
export function RateBar() {
  const { rate, refresh, run } = useDidar()
  return (
    <section className="rate">
      <span>نرخ مبنای هر گرم طلای ۱۸ عیار</span>
      <strong>{rate ? money(rate.rate_irr) : 'دریافت نرخ…'}</strong>
      <small>
        نرخ دستی سندباکس · {rate && date(rate.updated_at)}
        {rate?.rate_stale
          ? ' · نرخ منقضی؛ تأیید قیمت نیازمند به‌روزرسانی مدیر است'
          : rate?.quote_expires_at
            ? ' · اعتبار قیمت تا ' + date(rate.quote_expires_at)
            : ''}
      </small>
      <button onClick={() => run(refresh)}>دریافت قیمت تازه</button>
    </section>
  )
}
export function Catalog({
  categorySlug,
  collectionSlug,
  discoverySlug,
  home = false,
}: {
  categorySlug?: string
  collectionSlug?: string
  discoverySlug?: string
  home?: boolean
}) {
  const { categories, collections, paymentMethod, store } = useDidar()
  const [query, setQuery] = useState<Record<string, string>>({}),
    [page, setPage] = useState(1),
    [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    const picked: Record<string, string> = {}
    for (const [key, value] of new URLSearchParams(window.location.search))
      if (
        ![
          'page',
          'limit',
          'category_slug',
          'collection_slug',
          'discovery_slug',
          'locale',
        ].includes(key)
      )
        picked[key] = value
    setQuery(picked)
  }, [])
  const params = new URLSearchParams({
    ...query,
    payment_method: paymentMethod,
    page: String(page),
    limit: '12',
    ...(categorySlug ? { category_slug: categorySlug } : {}),
    ...(collectionSlug ? { collection_slug: collectionSlug } : {}),
    ...(discoverySlug ? { discovery_slug: discoverySlug } : {}),
  }).toString()
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      fetch('/api/didar/catalog?' + params, {
        cache: 'no-store',
        headers: {
          'x-didar-store': store?.handle || 'global',
          ...(sessionStorage.getItem('didar-session')
            ? {
                authorization:
                  'Bearer ' + sessionStorage.getItem('didar-session'),
              }
            : {}),
        },
        signal: controller.signal,
      })
        .then(async (r) => {
          const d = await r.json()
          if (!r.ok) throw new Error(d.message)
          return d
        })
        .then((d) => {
          if (!controller.signal.aborted) setData(d)
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e.message === 'NOT_FOUND'
                ? 'این صفحه در دسترس نیست.'
                : 'فیلترها معتبر نیستند یا دریافت محصولات ممکن نشد.',
            )
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [params, retry, store?.handle])
  const change = (key: string, value: string) => {
    setPage(1)
    setQuery((q) => {
      const n = { ...q }
      if (value) n[key] = value
      else delete n[key]
      return n
    })
  }
  const toggle = (key: string, value: string) => {
    const selected = (query[key] || '').split(',').filter(Boolean)
    change(
      key,
      selected.includes(value)
        ? selected.filter((v) => v !== value).join(',')
        : [...selected, value].join(','),
    )
  }
  const selectedCategory = categories.find((c) => c.slug === categorySlug),
    selectedCollection = collections.find((c) => c.slug === collectionSlug)
  const input = (key: string, label: string, type = 'number', scale = 1) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={scale === 1000 ? '0.001' : undefined}
        value={query[key] ? String(Number(query[key]) / scale) : ''}
        onChange={(e) =>
          change(
            key,
            e.target.value
              ? String(Math.round(Number(e.target.value) * scale))
              : '',
          )
        }
      />
    </label>
  )
  return (
    <section id="catalog" aria-busy={loading}>
      <div className="section-title">
        <div>
          <p className="eyebrow">کاتالوگ مشترک دیدار</p>
          <h1>
            {data?.landing?.name ||
              selectedCategory?.name ||
              selectedCollection?.name ||
              (home ? 'برای هر روزِ درخشان شما' : 'ویترین طلا')}
          </h1>
        </div>
        <p className="muted" role="status">
          {loading
            ? 'در حال دریافت محصولات…'
            : `${number(data?.total || 0)} محصول · فروشنده شما دیدار است`}
        </p>
      </div>
      <div className="browse-links">
        {categories
          .filter((c) => !c.parent_id || c.parent_id === selectedCategory?.id)
          .map((c) => (
            <Link key={c.id} href={'/categories/' + c.slug}>
              {c.name}
            </Link>
          ))}
        {collections.map((c) => (
          <Link key={c.id} href={'/collections/' + c.slug}>
            مجموعه {c.name}
          </Link>
        ))}
      </div>
      <nav className="browse-links" aria-label="کشف طلا">
        {data?.pages?.map((p: any) => (
          <Link key={p.slug} href={'/discover/' + p.slug}>
            {p.name}
          </Link>
        ))}
      </nav>
      <PaymentMethodPicker />
      <form
        className="filters"
        role="search"
        onSubmit={(e) => e.preventDefault()}
      >
        <label>
          جستجوی محصول
          <input
            aria-label="جستجوی محصول"
            placeholder="نام، مدل یا نوع زیور…"
            value={query.q || ''}
            onChange={(e) => change('q', e.target.value)}
          />
        </label>
        <label>
          دسته‌بندی
          <select
            value={query.category || ''}
            onChange={(e) => change('category', e.target.value)}
          >
            <option value="">همه</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {input('weight_exact', 'وزن دقیق (گرم)', 'number', 1000)}
        {input('weight_min', 'حداقل وزن (گرم)', 'number', 1000)}
        {input('weight_max', 'حداکثر وزن (گرم)', 'number', 1000)}
        {input('price_min', 'حداقل قیمت (ریال)')}
        {input('price_max', 'حداکثر قیمت (ریال)')}
        {input('purity', 'عیار از هزار')}
        <label>
          ترتیب نمایش
          <select
            value={query.sort || 'title'}
            onChange={(e) => change('sort', e.target.value)}
          >
            <option value="title">نام محصول</option>
            <option value="price_asc">ارزان‌تر</option>
            <option value="price_desc">گران‌تر</option>
            <option value="weight_asc">سبک‌تر</option>
            <option value="weight_desc">سنگین‌تر</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={query.in_stock === 'true'}
            onChange={(e) => change('in_stock', e.target.checked ? 'true' : '')}
          />
          فقط موجود
        </label>
        <button
          type="button"
          onClick={() => {
            setQuery({})
            setPage(1)
          }}
        >
          پاک کردن فیلترها
        </button>
      </form>
      <div className="facet-filters">
        {data?.facets?.map((f: any) => (
          <details
            className="card"
            key={f.code}
            open={[
              'usage',
              'design_style',
              'occasion',
              'audience',
              'market_tier',
            ].includes(f.code)}
          >
            <summary>{f.label}</summary>
            {f.values.map((v: any) => (
              <label className="facet-option" key={v.code}>
                <input
                  type="checkbox"
                  checked={(query[f.code] || '').split(',').includes(v.code)}
                  onChange={() => toggle(f.code, v.code)}
                />
                {v.label}{' '}
                <span className="muted">({number(v.count || 0)})</span>
              </label>
            ))}
          </details>
        ))}
      </div>
      {error ? (
        <div role="alert" className="empty">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>تلاش دوباره</button>
        </div>
      ) : loading ? (
        <div role="status" className="empty">
          در حال دریافت محصولات…
        </div>
      ) : data?.products?.length ? (
        <div className="grid">
          {data.products.map((p: Product) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>محصولی پیدا نشد</h2>
          <p>فیلترها را تغییر دهید یا دوباره تلاش کنید.</p>
          <button onClick={() => setRetry((n) => n + 1)}>
            تازه‌سازی کاتالوگ
          </button>
        </div>
      )}
      <nav className="browse-links" aria-label="صفحه‌بندی محصولات">
        <button
          disabled={loading || page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          صفحه قبل
        </button>
        <span>
          صفحه {number(page)} از {number(Math.max(1, data?.total_pages || 0))}
        </span>
        <button
          disabled={loading || page >= (data?.total_pages || 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          صفحه بعد
        </button>
      </nav>
    </section>
  )
}
export function ProductDetail({ id }: { id: string }) {
  const { products, loading, store } = useDidar()
  const [selected, setSelected] = useState(0)
  const p = products.find((p) => p.id === id)
  if (loading) return <p role="status">در حال دریافت محصول…</p>
  if (!p)
    return (
      <div className="empty">
        <h1>این محصول در دسترس نیست</h1>
        <Link href="/products">بازگشت به ویترین</Link>
      </div>
    )
  return (
    <section>
      <div className="breadcrumbs">
        <Link href="/">دیدار</Link> / <Link href="/products">ویترین</Link> /{' '}
        {p.breadcrumbs?.map((c) => (
          <span key={c.id}>
            <Link href={'/categories/' + c.slug}>{c.name}</Link> /{' '}
          </span>
        ))}
        {p.title}
      </div>
      <div className="detail-grid">
        <div>
          <div className="gallery-main">
            <ProductImage product={p} index={selected} />
          </div>
          {!!p.images?.length && (
            <div className="gallery-thumbs">
              {p.images.map((im, i) => (
                <button
                  key={im.id}
                  className={selected === i ? 'selected' : ''}
                  aria-label={'نمایش تصویر ' + number(i + 1)}
                  aria-pressed={selected === i}
                  onClick={() => setSelected(i)}
                >
                  <ImageAsset src={im.url} alt={im.alt || p.title} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="eyebrow">
            {p.category} · {p.jewelry_type}
          </p>
          <h1>{p.title}</h1>
          {store && (
            <ShareActions
              path={
                p.canonical_path ||
                `/m/${store.handle}/products/${p.public_key}`
              }
              title={p.title}
            />
          )}
          <PaymentMethodPicker />
          <div className="browse-links">
            {Object.entries(p.classification || {}).flatMap(([facet, values]) =>
              values.map((v) => (
                <Link
                  key={facet + v.code}
                  href={'/products?' + new URLSearchParams({ [facet]: v.code })}
                >
                  {v.label}
                </Link>
              )),
            )}
          </div>
          <p className="description">
            {p.description || 'توضیحات تکمیلی این محصول هنوز ثبت نشده است.'}
          </p>
          <dl className="specs">
            {Object.entries(p.attributes || {}).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
            <div>
              <dt>مدل / مرجع</dt>
              <dd>{p.reference || 'ثبت نشده'}</dd>
            </div>
            <div>
              <dt>عیار هزارگانی</dt>
              <dd>{number(p.purity)}</dd>
            </div>
            <div>
              <dt>بازه وزن اعلامی</dt>
              <dd>
                {p.min_weight_mg ? weight(p.min_weight_mg) : '—'} تا{' '}
                {p.max_weight_mg ? weight(p.max_weight_mg) : '—'}
              </dd>
            </div>
            <div>
              <dt>فروشنده و دریافت‌کننده وجه</dt>
              <dd>دیدار گلد</dd>
            </div>
          </dl>
          <h2>انتخاب وزن دقیق و تأمین‌کننده</h2>
          <p className="muted">
            قیمت بر اساس وزن واقعی هر عرضه محاسبه می‌شود؛ اعتبار نهایی در ثبت
            سفارش بررسی می‌شود.
          </p>
          {p.offers.map((o) => (
            <OfferCard key={o.id} offer={o} />
          ))}
          {!p.offers.length && <p className="empty">عرضه موجود نیست.</p>}
          <Link className="primary" href="/cart">
            مشاهده سبد خرید
          </Link>
        </div>
      </div>
    </section>
  )
}

export function PricingBreakdown({ value: p }: { value: any }) {
  if (!p) return null
  return (
    <details className="price-breakdown">
      <summary>اجزای قیمت به ریال</summary>
      {p.merchant_profile ? (
        <p>
          {p.merchant_profile.name} · نسخه {p.merchant_profile.version} · از{' '}
          {date(p.merchant_profile.effective_from)} ·{' '}
          {p.payment_method === 'CREDIT' ? 'اعتباری' : 'نقدی'}
        </p>
      ) : null}
      <p>
        اصل طلا: {money(p.metal_irr)} · اجرت: {money(p.labor_irr)}
      </p>
      <p>
        توزیع: {money(p.distribution_irr ?? 0)} · خرده‌فروشی:{' '}
        {money(p.retail_irr ?? p.margin_irr)}
      </p>
      {p.merchant_profile ? (
        <p>
          عملیات فروش اعتباری دیدار: {money(p.credit_irr || 0)} · اجرت{' '}
          {p.merchant_profile.merchant_type === 'RETAILER'
            ? 'کامل خرده‌فروش'
            : 'تأمین‌کننده'}{' '}
          از عرضه
        </p>
      ) : null}
      <p>
        مالیات واقعی VAT: {money(p.vat_irr ?? p.tax_irr)} · هزینه:{' '}
        {money(p.fee_irr ?? 0)} · گرد کردن: {money(p.rounding_irr ?? 0)}
      </p>
      {p.profile_charges?.length ? (
        <ul>
          {p.profile_charges.map((r: any) => (
            <li key={r.code}>
              {r.label}: {money(r.amount_irr)} ·{' '}
              {
                (
                  {
                    ALWAYS: 'نقدی و اعتباری',
                    CREDIT_ONLY: 'فقط اعتباری',
                    CASH_ONLY: 'فقط نقدی',
                    BY_PAYMENT_METHOD: 'طبق روش پرداخت',
                    DISABLED: 'غیرفعال',
                  } as any
                )[r.application_mode]
              }{' '}
              ·{' '}
              {
                (
                  {
                    GOLD_BASE_750_IRR: 'اصل طلا',
                    MAKING_IRR: 'اجرت عرضه',
                    GOLD_PLUS_MAKING_IRR: 'طلا + اجرت',
                    FIXED_IRR: 'ریال ثابت',
                  } as any
                )[r.applied_rule?.basis]
              }
            </li>
          ))}
        </ul>
      ) : null}
      {p.order_rules?.some(
        (r: any) => r.applied && r.payer === 'CUSTOMER' && r.amount_irr > 0,
      ) ? (
        <p>خدمات مشترک سفارش، یک‌بار در سبد افزوده می‌شوند.</p>
      ) : null}
      <p>
        مجموع هر قطعه: {money(p.total_irr)} · نسخه سیاست:{' '}
        {p.merchant_profile
          ? 'مالیات ' + p.merchant_profile.tax.version
          : (p.pricing_policy_id ?? 'تاریخی')}
      </p>
    </details>
  )
}
