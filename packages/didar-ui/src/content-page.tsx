'use client'
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react'
import { useDidar, ScopedLink, type Product } from './store'
import { ProductCard, ImageAsset } from './catalog'
import './content-page.css'
const labels: Record<string, string> = {
  HERO_VIDEO: 'ویدیوی آغازین',
  HERO_MEDIA_SLIDER: 'اسلایدر رسانه',
  EDITORIAL_MOSAIC: 'موزاییک تصویری',
  SPLIT_STORY: 'داستان دو بخشی',
  FULL_BLEED_MEDIA: 'رسانه تمام عرض',
  COLLECTION_SPOTLIGHT: 'مجموعه منتخب',
  FEATURED_PRODUCT_GRID: 'محصولات منتخب',
  PRODUCT_CAROUSEL: 'ریل محصولات',
  CATEGORY_FACET_DISCOVERY: 'کشف دسته و ویژگی',
  BRAND_STORY: 'داستان برند',
  SPACER_DIVIDER: 'فاصله و جداکننده',
}
export { labels as contentBlockLabels }
const CMSMobile = createContext(false)
function CTA({ value }: { value: any }) {
  return value?.path ? (
    <ScopedLink className="cms-cta" href={value.path}>
      {value.label} ←
    </ScopedLink>
  ) : null
}
function usePreferences() {
  const [prefs, setPrefs] = useState({ mobile: false, quiet: true })
  useEffect(() => {
    const m = matchMedia('(max-width: 600px)'),
      r = matchMedia('(prefers-reduced-motion: reduce)')
    const change = () =>
      setPrefs({
        mobile: m.matches,
        quiet: r.matches || !!(navigator as any).connection?.saveData,
      })
    change()
    m.addEventListener('change', change)
    r.addEventListener('change', change)
    return () => {
      m.removeEventListener('change', change)
      r.removeEventListener('change', change)
    }
  }, [])
  return prefs
}
function Media({
  m,
  assets,
  eager = false,
}: {
  m: any
  assets: any
  eager?: boolean
}) {
  const prefs = usePreferences(),
    mobile = useContext(CMSMobile) || prefs.mobile,
    quiet = prefs.quiet
  const a =
      assets[
        mobile && assets[m.mobile_asset_id] ? m.mobile_asset_id : m.asset_id
      ],
    ref = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(eager),
    [src, setSrc] = useState(''),
    [playing, setPlaying] = useState(false),
    [failure, setFailure] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ob = new IntersectionObserver(
      (xs) => {
        if (xs[0]?.isIntersecting) {
          setVisible(true)
          ob.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    ob.observe(el)
    return () => ob.disconnect()
  }, [])
  const { mediaURL, mediaHeaders } = useDidar()
  useEffect(() => {
    setSrc('')
    setFailure(false)
    if (!a?.video_url || !visible || quiet) return
    let owned = '',
      active = true
    const c = new AbortController()
    if (!a.private && !mediaHeaders) {
      setSrc(mediaURL ? mediaURL(a.video_url) : a.video_url)
      return
    }
    fetch(mediaURL ? mediaURL(a.video_url) : a.video_url, {
      headers: mediaHeaders ? mediaHeaders() : { authorization: 'Bearer ' + (sessionStorage.getItem('didar-session') || '') },
      signal: c.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error('video')
        owned = URL.createObjectURL(await r.blob())
        if (active) setSrc(owned)
      })
      .catch(() => {
        if (active) setFailure(true)
      })
    return () => {
      active = false
      c.abort()
      if (owned) URL.revokeObjectURL(owned)
    }
  }, [a?.id, a?.private, a?.video_url, visible, quiet, mediaURL, mediaHeaders])
  const style = {
    objectFit: m.fit === 'COVER' ? 'cover' : 'contain',
    objectPosition: `${m.focal_x ?? 50}% ${m.focal_y ?? 50}%`,
  } as CSSProperties
  if (!a)
    return (
      <div
        className="cms-media-placeholder"
        role="img"
        aria-label={m.alt || 'رسانه انتخاب نشده'}
      >
        رسانه انتخاب نشده یا در دسترس نیست
      </div>
    )
  const variants = [...(a.variants || [])]
    .sort((x: any, y: any) => x.width - y.width)
    .filter((v: any, i: number, xs: any[]) => !i || v.width !== xs[i - 1].width)
  return (
    <figure
      className="cms-media"
      ref={ref}
      style={{ aspectRatio: `${a.width || 4}/${a.height || 3}` }}
    >
      <div className="cms-image" style={style}>
        <picture style={style}>
          {!a.private && assets[m.mobile_asset_id] && (
            <source
              media="(max-width: 600px)"
              srcSet={assets[m.mobile_asset_id].url + '&variant=medium'}
            />
          )}
          <ImageAsset
            src={a.url + '&variant=zoom'}
            alt={m.alt || a.alt}
            width={a.width}
            height={a.height}
            privateImage={a.private}
            eager={eager}
            sizes="(max-width:600px) 100vw, 90vw"
            srcSet={variants
              .map(
                (v: any) => a.url + '&variant=' + v.kind + ' ' + v.width + 'w',
              )
              .join(', ')}
          />
        </picture>
      </div>
      {a.type === 'VIDEO' && src && !failure && (
        <video
          ref={video}
          src={src}
          muted
          playsInline
          loop
          autoPlay={!quiet}
          preload="metadata"
          style={style}
          aria-label={m.alt}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailure(true)}
        />
      )}
      {a.type === 'VIDEO' && (
        <div className="cms-video-controls">
          {src && !failure ? (
            <button
              type="button"
              aria-label={playing ? 'توقف ویدیو' : 'پخش ویدیو'}
              onClick={() => {
                if (playing) video.current?.pause()
                else void video.current?.play().catch(() => setFailure(true))
              }}
            >
              {playing ? 'توقف ویدیو Ⅱ' : 'پخش ویدیو ▷'}
            </button>
          ) : (
            <span>
              {quiet
                ? 'تصویر ثابت · کاهش حرکت یا مصرف داده'
                : 'تصویر جایگزین ویدیو'}
            </span>
          )}
        </div>
      )}
      {m.caption && <figcaption>{m.caption}</figcaption>}
    </figure>
  )
}
function Slider({ b, assets }: { b: any; assets: any }) {
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    { quiet } = usePreferences(),
    slides = b.slides || []
  useEffect(() => {
    if (!b.autoplay || paused || quiet || slides.length < 2) return
    const id = setInterval(
      () => setIndex((i) => (i + 1) % slides.length),
      b.interval_ms || 7000,
    )
    return () => clearInterval(id)
  }, [b.autoplay, b.interval_ms, paused, quiet, slides.length])
  const move = (n: number) => {
    setPaused(true)
    setIndex((i) => (i + n + slides.length) % slides.length)
  }
  return (
    <div
      className="cms-slider"
      role="region"
      aria-roledescription="اسلایدر"
      aria-label={b.title || 'داستان‌های دیدار'}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          move(1)
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          move(-1)
        }
      }}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
    >
      {slides.map((m: any, i: number) => (
        <div key={i} hidden={i !== index} aria-hidden={i !== index}>
          {i === index && (
            <>
              <Media m={m} assets={assets} />
              <CTA value={m.cta} />
            </>
          )}
        </div>
      ))}
      <div className="cms-slider-controls">
        <button onClick={() => move(-1)} aria-label="اسلاید قبلی">
          →
        </button>
        <span aria-live="polite">
          {index + 1} / {slides.length}
        </span>
        <button onClick={() => move(1)} aria-label="اسلاید بعدی">
          ←
        </button>
        {b.autoplay && (
          <button onClick={() => setPaused((p) => !p)}>
            {paused ? 'ادامه گردش اسلاید' : 'توقف گردش اسلاید'}
          </button>
        )}
      </div>
    </div>
  )
}
export function ContentRenderer({
  data,
  catalog,
  preview = false,
  mobilePreview = false,
}: {
  data: any
  catalog?: any
  preview?: boolean
  mobilePreview?: boolean
}) {
  const live = useDidar(),
    products: Product[] = catalog?.products || live.products,
    collections = catalog?.collections || live.collections,
    categories = catalog?.categories || live.categories
  return (
    <CMSMobile.Provider value={mobilePreview}>
      <div
        className={'cms-page' + (preview ? ' cms-preview' : '')}
        data-page-id={data.page.id}
        data-version-id={data.version.id}
      >
        {data.blocks.map((b: any, index: number) => {
          const selected = (b.product_ids || [])
              .map((id: string) => products.find((p) => p.id === id))
              .filter(Boolean) as Product[],
            collection = collections.find((c: any) => c.id === b.collection_id),
            cProducts = products.filter(
              (p) =>
                (p.collection_ids || []).includes(b.collection_id) ||
                (collection?.product_ids || []).includes(p.id),
            ),
            category = categories.find((c: any) => c.id === b.category_id)
          const copy = (
            <div className="cms-copy">
              {b.title &&
                (index === 0 ? <h1>{b.title}</h1> : <h2>{b.title}</h2>)}
              {b.body && <p>{b.body}</p>}
              <CTA value={b.cta} />
              <CTA value={b.media?.cta} />
            </div>
          )
          return (
            <section
              key={b.id}
              data-block-type={b.type}
              className={
                'cms-block cms-' +
                b.type.toLowerCase() +
                ' cms-theme-' +
                b.theme.toLowerCase() +
                (b.side === 'END' ? ' cms-media-end' : '')
              }
              aria-label={b.title || labels[b.type]}
            >
              {['HERO_VIDEO', 'FULL_BLEED_MEDIA'].includes(b.type) && (
                <>
                  <Media m={b.media} assets={data.assets} eager={index === 0} />
                  {copy}
                </>
              )}
              {b.type === 'HERO_MEDIA_SLIDER' && (
                <>
                  {copy}
                  <Slider b={b} assets={data.assets} />
                </>
              )}
              {b.type === 'EDITORIAL_MOSAIC' && (
                <>
                  {copy}
                  <div
                    className={
                      'cms-mosaic cms-mosaic-' + b.layout.toLowerCase()
                    }
                  >
                    {b.tiles.map((m: any, i: number) => (
                      <div key={i}>
                        <Media m={m} assets={data.assets} />
                        <CTA value={m.cta} />
                      </div>
                    ))}
                  </div>
                </>
              )}
              {b.type === 'SPLIT_STORY' && (
                <>
                  <Media m={b.media} assets={data.assets} />
                  {copy}
                </>
              )}
              {b.type === 'BRAND_STORY' && copy}
              {[
                'FEATURED_PRODUCT_GRID',
                'PRODUCT_CAROUSEL',
                'COLLECTION_SPOTLIGHT',
              ].includes(b.type) && (
                <>
                  {copy}
                  {collection && (
                    <ScopedLink
                      href={'/collections/' + collection.slug}
                      className="cms-cta"
                    >
                      {collection.name} ←
                    </ScopedLink>
                  )}
                  {b.type === 'PRODUCT_CAROUSEL' && (
                    <div className="cms-slider-controls">
                      <button
                        aria-label="محصولات قبلی"
                        onClick={(e) =>
                          (
                            e.currentTarget
                              .closest('section')
                              ?.querySelector(
                                '.cms-product-rail',
                              ) as HTMLElement
                          )?.scrollBy({
                            left: 360,
                            behavior: 'smooth',
                          })
                        }
                      >
                        →
                      </button>
                      <button
                        aria-label="محصولات بعدی"
                        onClick={(e) =>
                          (
                            e.currentTarget
                              .closest('section')
                              ?.querySelector(
                                '.cms-product-rail',
                              ) as HTMLElement
                          )?.scrollBy({
                            left: -360,
                            behavior: 'smooth',
                          })
                        }
                      >
                        ←
                      </button>
                    </div>
                  )}
                  <div
                    className={
                      b.type === 'PRODUCT_CAROUSEL'
                        ? 'cms-product-rail'
                        : 'products'
                    }
                    {...(preview ? { inert: true } : {})}
                  >
                    {(b.type === 'COLLECTION_SPOTLIGHT'
                      ? cProducts
                      : selected
                    ).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                  {!(b.type === 'COLLECTION_SPOTLIGHT' ? cProducts : selected)
                    .length && <p>عرضه مجاز و موجود فعلاً در دسترس نیست.</p>}
                  {preview && (
                    <small>قیمت زنده · خرید در پیش‌نمایش غیرفعال است.</small>
                  )}
                </>
              )}
              {b.type === 'CATEGORY_FACET_DISCOVERY' && (
                <>
                  {copy}
                  <div className="cms-discovery">
                    {category && (
                      <ScopedLink href={'/categories/' + category.slug}>
                        {category.name} ←
                      </ScopedLink>
                    )}
                    {b.facet && (
                      <ScopedLink
                        href={
                          '/products?' +
                          new URLSearchParams({ [b.facet]: b.value }).toString()
                        }
                      >
                        کشف ویژگی منتخب ←
                      </ScopedLink>
                    )}
                    {!category &&
                      !b.facet &&
                      categories
                        .filter((c: any) => c.kind === 'family')
                        .map((c: any) => (
                          <ScopedLink key={c.id} href={'/categories/' + c.slug}>
                            {c.name} ←
                          </ScopedLink>
                        ))}
                  </div>
                </>
              )}
              {b.type === 'SPACER_DIVIDER' && (
                <hr style={{ marginBlock: (b.height || 40) / 2 }} />
              )}
            </section>
          )
        })}
      </div>
    </CMSMobile.Provider>
  )
}
export function ContentPage({
  kind,
  routeKey = '',
  fallback,
  children,
  initialData,
}: {
  kind: string
  routeKey?: string
  fallback?: ReactNode
  children?: ReactNode
  initialData?: any
}) {
  const { api, scopeReady, store } = useDidar(),
    [data, setData] = useState<any>(initialData || null)
  useEffect(() => {
    let active = true
    if (!scopeReady) return
    setData(initialData || null)
    api('pages?' + new URLSearchParams({ kind, route_key: routeKey }))
      .then((d) => {
        if (active) setData(d)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, scopeReady, store?.handle, kind, routeKey])
  return (
    <>
      {data ? <ContentRenderer data={data} /> : fallback}
      {children}
    </>
  )
}
export function ContentPreview({ version }: { version: string }) {
  const { api, run } = useDidar(),
    [data, setData] = useState<any>(null),
    [mobile, setMobile] = useState(false)
  useEffect(() => {
    run(async () =>
      setData(
        await api('pages', { operation: 'preview', version_id: version }),
      ),
    )
  }, [api, version])
  return (
    <section>
      <h1>پیش‌نمایش خصوصی</h1>
      <p>منتشر نشده · دسترسی و قیمت در زمان خرید دوباره بررسی می‌شود.</p>
      <button onClick={() => setMobile((m) => !m)}>
        {mobile ? 'نمای دسکتاپ' : 'نمای موبایل ۳۹۰'}
      </button>
      <div className={mobile ? 'cms-preview-mobile' : ''}>
        {data && (
          <ContentRenderer
            data={data}
            catalog={data.catalog}
            preview
            mobilePreview={mobile}
          />
        )}
      </div>
    </section>
  )
}
