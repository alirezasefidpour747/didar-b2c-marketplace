'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { copy, errors, number } from './locale'
export type Price = {
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
export type Image = { id: string; url: string; alt: string; position: number }
export type Product = {
  id: string
  title: string
  category: string
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
}
export type Collection = {
  id: string
  name: string
  slug: string
  product_ids?: string[]
}
type Store = {
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
  const api = useCallback(
    async (action: string, body?: any, session = token) => {
      const r = await fetch('/api/didar/' + action, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'content-type': 'application/json',
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
    [token],
  )
  const refresh = useCallback(async () => {
    const d = await api('catalog')
    setProducts(d.products)
    setRate({
      ...d.rate,
      quote_expires_at: d.quote_expires_at,
      price_available: d.price_available,
      rate_stale: d.rate_stale,
    })
    setCategories(d.categories || [])
    setCollections(d.collections || [])
  }, [api])
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
    const t = sessionStorage.getItem('didar-session') || ''
    setToken(t)
    try {
      const c = JSON.parse(localStorage.getItem('didar-cart') || '{}')
      setCart(
        Object.fromEntries(
          Object.entries(c).filter(
            ([, q]) => Number.isInteger(q) && Number(q) > 0 && Number(q) <= 100,
          ),
        ) as Record<string, number>,
      )
    } catch {}
    ;(async () => {
      try {
        await refresh()
        if (t) {
          try {
            setUser((await api('me', undefined, t)).user)
          } catch {
            sessionStorage.removeItem('didar-session')
            setToken('')
          }
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'خطای ارتباط')
      } finally {
        setReady(true)
        setLoading(false)
      }
    })()
  }, []) // Bootstrap once; later calls use the current session.
  useEffect(() => {
    if (ready) localStorage.setItem('didar-cart', JSON.stringify(cart))
  }, [cart, ready])
  useEffect(() => {
    setMessage('')
  }, [path])
  function authenticate(d: { user: User; token: string }) {
    setToken(d.token)
    setUser(d.user)
    sessionStorage.setItem('didar-session', d.token)
  }
  function add(o: Offer) {
    setCart((c) => ({ ...c, [o.id]: Math.min((c[o.id] || 0) + 1, o.quantity) }))
    setMessage('به سبد خرید اضافه شد.')
  }
  return (
    <Context.Provider
      value={{
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
      <header>
        <Link className="brand" href="/">
          دیدار<span>GOLD · DIDAR</span>
        </Link>
        <nav aria-label="ناوبری اصلی">
          <Link
            aria-current={path === '/products' ? 'page' : undefined}
            href="/products"
          >
            {copy.catalog}
          </Link>
          <Link href="/cart">
            {copy.cart}{' '}
            <b>{number(Object.values(cart).reduce((s, n) => s + n, 0))}</b>
          </Link>
          {user ? (
            <>
              <Link href="/orders">{copy.orders}</Link>
              <Link href="/account/wallet">کیف پول</Link>
              <Link href="/account">{copy.account}</Link>
              {user.role !== 'customer' && (
                <Link href="/manage">{copy.manage}</Link>
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
                    router.push('/')
                  })
                }
              >
                خروج · {user.name}
              </button>
            </>
          ) : (
            <Link href="/login">{copy.login}</Link>
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
        {children}
      </main>
      <footer>
        <Link className="brand" href="/">
          دیدار گلد
        </Link>
        <p>
          زیبایی ماندگار، خرید شفاف. خرید شما از دیدار و تأمین از شرکای
          تأییدشده.
        </p>
        <div className="footer-links">
          <Link href="/products">کاتالوگ مشترک</Link>
          <Link href="/account/wallet">کیف پول</Link>
              <Link href="/account">حساب مشتری</Link>
          <Link href="/login?register=supplier">پیوستن به تأمین‌کنندگان</Link>
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
  const { user, ready } = useDidar()
  if (!ready) return <p role="status">در حال دریافت حساب…</p>
  if (!user)
    return (
      <div className="empty">
        <h1>ورود به حساب</h1>
        <p>برای مشاهده این صفحه وارد حساب خود شوید.</p>
        <Link className="primary" href="/login">
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
