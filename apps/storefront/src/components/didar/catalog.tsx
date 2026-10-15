'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useDidar, type Product, type Offer } from './store'
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
export function OfferCard({ offer: o }: { offer: Offer }) {
  const { add, busy } = useDidar()
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
        {o.price && (
          <p>
            اصل طلا: {money(o.price.metal_irr)}
            <br />
            اجرت: {money(o.price.labor_irr)}
            <br />
            توزیع: {money(o.price.distribution_irr ?? 0)} · خرده‌فروشی:{' '}
            {money(o.price.retail_irr ?? o.price.margin_irr)}
            <br />
            مالیات واقعی VAT به ریال: {money(o.price.tax_irr)}
            <br />
            هزینه‌ها: {money(o.price.fee_irr || 0)}
          </p>
        )}
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
      <Link href={'/products/' + p.id} aria-label={'مشاهده ' + p.title}>
        <ProductImage product={p} />
      </Link>
      <div className="product-body">
        <small>
          {p.category} · عیار {number(p.purity)}
        </small>
        <h3>
          <Link href={'/products/' + p.id}>{p.title}</Link>
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
  home = false,
}: {
  categorySlug?: string
  collectionSlug?: string
  home?: boolean
}) {
  const { products, categories, collections, loading, refresh, run } =
    useDidar()
  const [search, setSearch] = useState(''),
    [category, setCategory] = useState(''),
    [min, setMin] = useState(''),
    [max, setMax] = useState(''),
    [exact, setExact] = useState('')
  const selectedCategory = categories.find((c) => c.slug === categorySlug),
    selectedCollection = collections.find((c) => c.slug === collectionSlug)
  const categoryIds = new Set<string>()
  function descendants(id: string) {
    if (categoryIds.has(id)) return
    categoryIds.add(id)
    categories
      .filter((c) => c.parent_id === id)
      .forEach((c) => descendants(c.id))
  }
  if (selectedCategory) descendants(selectedCategory.id)
  const normalized = (s: string) =>
    s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase('fa-IR')
  const found = products
    .filter((p) => {
      if (
        categorySlug &&
        (!selectedCategory || !categoryIds.has(p.category_id || ''))
      )
        return false
      if (
        collectionSlug &&
        (!selectedCollection ||
          (!(p.collection_ids || []).includes(selectedCollection.id) &&
            !(selectedCollection.product_ids || []).includes(p.id)))
      )
        return false
      return (
        (!category || p.category_id === category || p.category === category) &&
        normalized(
          [
            p.title,
            p.reference,
            p.description,
            p.jewelry_type,
            p.category,
          ].join(' '),
        ).includes(normalized(search))
      )
    })
    .map((p) => ({
      ...p,
      offers: p.offers.filter(
        (o) =>
          (!min || o.weight_mg >= Math.round(Number(min) * 1000)) &&
          (!max || o.weight_mg <= Math.round(Number(max) * 1000)) &&
          (!exact || o.weight_mg === Math.round(Number(exact) * 1000)),
      ),
    }))
    .filter((p) => (!min && !max && !exact) || p.offers.length > 0)
  return (
    <section id="catalog">
      <div className="section-title">
        <div>
          <p className="eyebrow">کاتالوگ مشترک دیدار</p>
          <h1>
            {selectedCategory?.name ||
              selectedCollection?.name ||
              (home ? 'برای هر روزِ درخشان شما' : 'ویترین طلا')}
          </h1>
        </div>
        <p className="muted">
          {number(found.length)} محصول · فروشنده شما دیدار است
        </p>
      </div>
      <div className="browse-links">
        {categories
          .filter((c) => !c.parent_id || categoryIds.has(c.parent_id))
          .map((c) => (
            <Link key={c.id} href={'/categories/' + c.slug}>
              {c.parent_id ? '↳ ' : ''}
              {c.name}
            </Link>
          ))}
        {collections.map((c) => (
          <Link key={c.id} href={'/collections/' + c.slug}>
            مجموعه {c.name}
          </Link>
        ))}
      </div>
      <form
        className="filters"
        onSubmit={(e) => e.preventDefault()}
        role="search"
      >
        <label>
          جستجوی محصول
          <input
            aria-label="جستجوی محصول"
            placeholder="نام، مدل یا نوع زیور…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          دسته‌بندی
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">همه</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            {!categories.length &&
              [...new Set(products.map((p) => p.category))].map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
        </label>
        <label>
          وزن دقیق (گرم)
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={exact}
            onChange={(e) => setExact(e.target.value)}
          />
        </label>
        <label>
          حداقل وزن (گرم)
          <input
            type="number"
            min="0"
            step="0.001"
            value={min}
            onChange={(e) => setMin(e.target.value)}
          />
        </label>
        <label>
          حداکثر وزن (گرم)
          <input
            type="number"
            min="0"
            step="0.001"
            value={max}
            onChange={(e) => setMax(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setSearch('')
            setCategory('')
            setExact('')
            setMin('')
            setMax('')
          }}
        >
          پاک کردن فیلترها
        </button>
      </form>
      {loading ? (
        <div role="status" className="empty">
          در حال دریافت محصولات…
        </div>
      ) : found.length ? (
        <div className="grid">
          {found.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>محصولی پیدا نشد</h2>
          <p>فیلترها را تغییر دهید یا دوباره تلاش کنید.</p>
          <button onClick={() => run(refresh)}>تازه‌سازی کاتالوگ</button>
        </div>
      )}
    </section>
  )
}
export function ProductDetail({ id }: { id: string }) {
  const { products, loading } = useDidar()
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
      <p>
        اصل طلا: {money(p.metal_irr)} · اجرت: {money(p.labor_irr)}
      </p>
      <p>
        توزیع: {money(p.distribution_irr ?? 0)} · خرده‌فروشی:{' '}
        {money(p.retail_irr ?? p.margin_irr)}
      </p>
      <p>
        مالیات واقعی VAT: {money(p.vat_irr ?? p.tax_irr)} · هزینه:{' '}
        {money(p.fee_irr ?? 0)} · گرد کردن: {money(p.rounding_irr ?? 0)}
      </p>
      <p>
        مجموع هر قطعه: {money(p.total_irr)} · نسخه سیاست:{' '}
        {p.pricing_policy_id ?? 'تاریخی'}
      </p>
    </details>
  )
}
