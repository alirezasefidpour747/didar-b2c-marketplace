'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { copy, errors, number } from './locale'
export type Price = {
  [key: string]: any
  distribution_irr?: number
  retail_irr?: number
  pricing_policy_id?: number
  price_model?: string
  metal_irr: number
  labor_irr: number
  margin_irr: number
  tax_irr: number
  fee_irr?: number
  total_irr: number
}
export type Offer = {
  prices?: Record<string, Price> | null
  price_unavailable_reason?: string | null
  stock_mode?: string
  making_mode?: string
  making_bps?: number
  making_weight_mg?: number
  id: string
  supplier_id: string
  supplier: string
  weight_mg: number
  quantity: number
  labor_irr: number
  labor_bps?: number
  labor_mode?: string
  margin_bps: number
  active?: boolean
  terms?: string
  version: number
  price: Price | null
}
export type Image = {
  id: string
  url: string
  alt: string
  position: number
  private?: boolean
  srcset?: string
}
export type Product = {
  classification?: Record<string, { code: string; label: string }[]>
  id: string
  title: string
  category: string
  slug?: string
  public_key?: string
  taxonomy_ready?: boolean
  canonical_path?: string
  breadcrumbs?: { id: string; name: string; slug: string }[]
  category_id?: string
  description: string
  purity: number
  reference?: string
  jewelry_type?: string
  min_weight_mg?: number
  max_weight_mg?: number
  active?: boolean
  approved?: boolean
  attributes?: Record<string, string>
  published?: boolean
  collection_ids?: string[]
  images?: Image[]
  offers: Offer[]
}
export type User = {
  content_operator?: boolean
  merchant_memberships?: { supplier_id: string; permission: string }[]
  id: string
  name: string
  email: string
  role: string
  supplier_id?: string
  phone?: string
  address?: any
}
export type Category = {
  id: string
  name: string
  slug: string
  parent_id?: string
  kind?: 'legacy' | 'family' | 'category' | 'subcategory'
  active?: boolean
  code?: string
}
export type Collection = {
  id: string
  name: string
  slug: string
  product_ids?: string[]
}
type Store = {
  store: any
  scopedHref: (href: string) => string
  scopeReady: boolean

  paymentMethod: string
  setPaymentMethod: (m: string) => void
  products: Product[]
  categories: Category[]
  collections: Collection[]
  rate: any
  user: User | null
  ready: boolean
  loading: boolean
  busy: boolean
  message: string
  setMessage: (s: string) => void
  cart: Record<string, number>
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>
  api: (action: string, body?: any, token?: string) => Promise<any>
  refresh: () => Promise<void>
  run: (fn: () => Promise<void>) => Promise<void>
  authenticate: (data: { user: User; token: string }) => void
  updateUser: (u: User) => void
  add: (o: Offer) => void
}
const Context = createContext<Store | null>(null)
export const useDidar = () => {
  const s = useContext(Context)
  if (!s) throw new Error('DidarProvider missing')
  return s
}
export function DidarProvider({ children }: { children: ReactNode }) {
  const scopeQueue = useRef<Promise<any>>(Promise.resolve())
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartHandle, setCartHandle] = useState<string | null>(null)
  const [store, setStore] = useState<any>(null)
  const [scopeReady, setScopeReady] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [collections, setCollections] = useState<Collection[]>([]),
    [rate, setRate] = useState<any>(null),
    [user, setUser] = useState<User | null>(null),
    [token, setToken] = useState(''),
    [cart, setCart] = useState<Record<string, number>>({}),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const path = usePathname(),
    router = useRouter()
  const handle = path.match(/^\/m\/([a-z0-9-]+)(?:\/|$)/)?.[1] || ''
  const currentScopeReady = scopeReady && (store?.handle || '') === handle
  const visibleStore = currentScopeReady ? store : null
  const scopedHref = (href: string) =>
    !handle ||
    !href.startsWith('/') ||
    href.startsWith('/m/') ||
    href.startsWith('/api/') ||
    href.startsWith('/manage')
      ? href
      : `/m/${handle}${href === '/' ? '' : href}`
  const api = useCallback(
    async (action: string, body?: any, session = token) => {
      const r = await fetch('/api/didar/' + action, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-didar-store': handle || 'global',
          ...(session ? { authorization: 'Bearer ' + session } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      })
      const d = await r.json()
      if (!r.ok)
        throw new Error(
          errors[d.message] ||
            (String(d.message || '').startsWith('INVALID_')
              ? 'اطلاعات واردشده معتبر نیست؛ مقادیر فرم را بررسی کنید.'
              : d.message) ||
            'خطای سرور',
        )
      return d
    },
    [token, handle],
  )
  const refresh = useCallback(async () => {
    const d = await api('catalog')
    if ((d.store?.handle || '') !== handle)
      throw new Error('زمینه فروشگاه تغییر کرد؛ صفحه را تازه کنید.')
    setStore(d.store || null)
    setProducts(d.products)
    setRate({
      ...d.rate,
      quote_expires_at: d.quote_expires_at,
      price_available: d.price_available,
      rate_stale: d.rate_stale,
    })
    setCategories(d.categories || [])
    setCollections(d.collections || [])
  }, [api, handle])
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await fn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'خطای غیرمنتظره')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    let active = true
    const t = sessionStorage.getItem('didar-session') || ''
    setPaymentMethod(
      sessionStorage.getItem('didar-price-method') === 'CREDIT'
        ? 'CREDIT'
        : 'CASH',
    )
    setToken(t)
    try {
      const c = JSON.parse(
        localStorage.getItem('didar-cart' + (handle ? ':' + handle : '')) ||
          '{}',
      )
      setCartHandle(handle)
      setCart(
        Object.fromEntries(
          Object.entries(c).filter(
            ([, q]) => Number.isInteger(q) && Number(q) > 0 && Number(q) <= 100,
          ),
        ) as Record<string, number>,
      )
    } catch {
      setCart({})
      setCartHandle(handle)
    }
    ;(async () => {
      try {
        setScopeReady(false)
        setStore(null)
        setProducts([])
        const transition = scopeQueue.current
          .catch(() => {})
          .then(() => {
            if (!active) return
            return api(
              'storefront',
              handle ? { kind: 'enter', handle } : { kind: 'leave' },
              t,
            )
          })
        scopeQueue.current = transition
        await transition
        if (!active) return
        const d = await api('catalog', undefined, t)
        if (!active) return
        if ((d.store?.handle || '') !== handle)
          throw new Error('زمینه فروشگاه نامعتبر است.')
        setStore(d.store || null)
        setProducts(d.products)
        setCategories(d.categories || [])
        setCollections(d.collections || [])
        setRate({
          ...d.rate,
          quote_expires_at: d.quote_expires_at,
          price_available: d.price_available,
          rate_stale: d.rate_stale,
        })
        setScopeReady(true)
        if (t) {
          try {
            const me = await api('me', undefined, t)
            if (active) setUser(me.user)
          } catch {
            if (!active) return
            sessionStorage.removeItem('didar-session')
            setToken('')
          }
        }
      } catch (e) {
        if (active) setMessage(e instanceof Error ? e.message : 'خطای ارتباط')
      } finally {
        if (active) {
          setReady(true)
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [handle, handle ? token : '']) // Global sign-in keeps the established bootstrap; invite scopes revalidate on account changes.
  useEffect(() => {
    if (ready) sessionStorage.setItem('didar-price-method', paymentMethod)
  }, [ready, paymentMethod])
  useEffect(() => {
    if (ready && cartHandle === handle)
      localStorage.setItem(
        'didar-cart' + (handle ? ':' + handle : ''),
        JSON.stringify(cart),
      )
  }, [cart, ready, handle, cartHandle])
  useEffect(() => {
    setMessage('')
    setMenuOpen(false)
  }, [path])
  function authenticate(d: { user: User; token: string }) {
    setToken(d.token)
    setUser(d.user)
    sessionStorage.setItem('didar-session', d.token)
    api('me', undefined, d.token)
      .then((me) => {
        if (sessionStorage.getItem('didar-session') === d.token)
          setUser(me.user)
      })
      .catch(() => {})
  }
  function add(o: Offer) {
    setCart((c) => ({ ...c, [o.id]: Math.min((c[o.id] || 0) + 1, o.quantity) }))
    setMessage('به سبد خرید اضافه شد.')
  }
  return (
    <Context.Provider
      value={{
        store: visibleStore,
        scopedHref,
        scopeReady: currentScopeReady,
        paymentMethod,
        setPaymentMethod,
        products,
        categories,
        collections,
        rate,
        user,
        ready,
        loading,
        busy,
        message,
        setMessage,
        cart,
        setCart,
        api,
        refresh,
        run,
        authenticate,
        updateUser: setUser,
        add,
      }}
    >
      <a className="skip-link" href="#main">
        رفتن به محتوای اصلی
      </a>
      <div className="announcement">
        محیط آزمایشی دیدار · پرداخت واقعی انجام نمی‌شود
      </div>
      <header
        onKeyDown={(e) => {
          if (e.key === 'Escape') setMenuOpen(false)
        }}
      >
        <Link className="brand" href={scopedHref('/')}>
          {visibleStore?.name || 'دیدار'}
          <span>GOLD · DIDAR</span>
        </Link>
        <button
          className="menu-toggle"
          aria-controls="main-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((x) => !x)}
        >
          فهرست {menuOpen ? '−' : '+'}
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? 'nav-open' : ''}
          aria-label="ناوبری اصلی"
        >
          <Link
            aria-current={path === '/products' ? 'page' : undefined}
            href={scopedHref('/products')}
          >
            {copy.catalog}
          </Link>
          <Link href={scopedHref('/cart')}>
            {copy.cart}{' '}
            <b>{number(Object.values(cart).reduce((s, n) => s + n, 0))}</b>
          </Link>
          {user ? (
            <>
              <Link href={scopedHref('/orders')}>{copy.orders}</Link>
              <Link href={scopedHref('/account/wallet')}>کیف پول</Link>
              <Link href={scopedHref('/account')}>{copy.account}</Link>
              {user.role === 'customer' &&
                user.merchant_memberships?.some(
                  (m) => m.permission === 'ONBOARDING',
                ) && <Link href="/manage/onboarding">همراهی فروشنده</Link>}
              {user.role === 'customer' &&
                user.merchant_memberships?.some(
                  (m) => m.permission === 'STOREFRONT',
                ) && <Link href="/manage/storefront">مدیریت ویترین مجاز</Link>}
              {user.role === 'customer' &&
                user.merchant_memberships?.some(
                  (m) => m.permission === 'SHARE',
                ) && <Link href="/manage/sharing">اشتراک فروشنده مجاز</Link>}
              {(user.role !== 'customer' ||
                user.content_operator ||
                user.merchant_memberships?.some((m) =>
                  ['CONTENT_EDIT', 'CONTENT_PUBLISH'].includes(m.permission),
                )) && <Link href="/manage/pages">صفحه‌ساز</Link>}
              {user.role !== 'customer' && (
                <>
                  <Link href="/manage">{copy.manage}</Link>
                  <Link href="/manage/storefront">ویترین من</Link>
                  <Link href="/manage/sharing">اشتراک محصولات</Link>
                  <Link href="/manage/onboarding">شروع فروش</Link>
                </>
              )}
              <button
                onClick={() =>
                  run(async () => {
                    await api('logout', {})
                    setUser(null)
                    setToken('')
                    sessionStorage.removeItem('didar-session')
                    sessionStorage.removeItem('didar-checkout-intent')
                    sessionStorage.removeItem('didar-checkout-address')
                    router.push(scopedHref('/'))
                  })
                }
              >
                خروج · {user.name}
              </button>
            </>
          ) : (
            <Link href={scopedHref('/login')}>{copy.login}</Link>
          )}
        </nav>
      </header>
      <main id="main">
        {message && (
          <div role="status" className="message">
            {message}
            <button aria-label="بستن پیام" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
        {busy && (
          <p className="processing" role="status">
            در حال پردازش…
          </p>
        )}
        {handle && !currentScopeReady ? (
          <section className="empty">
            <h1>ورود به فروشگاه</h1>
            <p>این فروشگاه باید در دسترس و دعوت شما معتبر باشد.</p>
            <Link href={scopedHref('/login')}>ورود با حساب دیدار</Link>
            {path.endsWith('/login') && children}
          </section>
        ) : (
          children
        )}
      </main>
      <footer>
        <Link className="brand" href={scopedHref('/')}>
          دیدار گلد
        </Link>
        <p>
          زیبایی ماندگار، خرید شفاف. خرید شما از دیدار و تأمین از شرکای
          تأییدشده.
        </p>
        <div className="footer-links">
          <Link href={scopedHref('/products')}>
            {handle ? 'محصولات فروشگاه' : 'کاتالوگ مشترک'}
          </Link>
          <Link href={scopedHref('/account/wallet')}>کیف پول</Link>
          <Link href={scopedHref('/account')}>حساب مشتری</Link>
          {!handle && (
            <Link href="/login?register=supplier">پیوستن به تأمین‌کنندگان</Link>
          )}
        </div>
        <small>محیط آزمایشی · مبالغ به ریال · بدون پرداخت واقعی</small>
      </footer>
    </Context.Provider>
  )
}
export function RequireUser({
  children,
  roles,
}: {
  children: ReactNode
  roles?: string[]
}) {
  const { user, ready, scopedHref } = useDidar()
  if (!ready) return <p role="status">در حال دریافت حساب…</p>
  if (!user)
    return (
      <div className="empty">
        <h1>ورود به حساب</h1>
        <p>برای مشاهده این صفحه وارد حساب خود شوید.</p>
        <Link className="primary" href={scopedHref('/login')}>
          ورود / عضویت
        </Link>
      </div>
    )
  if (roles && !roles.includes(user.role))
    return (
      <div className="empty">
        <h1>دسترسی محدود</h1>
        <p>این بخش برای نقش حساب شما در دسترس نیست.</p>
      </div>
    )
  return <>{children}</>
}

export function PaymentMethodPicker() {
  const { paymentMethod, setPaymentMethod } = useDidar()
  return (
    <label>
      روش محاسبه قیمت
      <select
        aria-label="روش محاسبه قیمت"
        value={paymentMethod}
        onChange={(e) => setPaymentMethod(e.target.value)}
      >
        <option value="CASH">نقدی</option>
        <option value="CREDIT">اعتباری؛ محاسبه و پرداخت آزمایشی</option>
      </select>
    </label>
  )
}

export function ScopedLink(props: React.ComponentProps<typeof Link>) {
  const { scopedHref } = useDidar()
  return (
    <Link
      {...props}
      href={
        typeof props.href === 'string' ? scopedHref(props.href) : props.href
      }
    />
  )
}
