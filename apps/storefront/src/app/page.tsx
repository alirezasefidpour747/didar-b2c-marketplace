'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
type Offer = {
  id: string
  supplier_id: string
  supplier: string
  weight_mg: number
  quantity: number
  labor_irr: number
  margin_bps: number
  version: number
  price: {
    metal_irr: number
    labor_irr: number
    margin_irr: number
    tax_irr: number
    total_irr: number
  }
}
type Product = {
  id: string
  title: string
  category: string
  description: string
  purity: number
  offers: Offer[]
}
type User = { id: string; name: string; email: string; role: string }
const money = (n: number | string) =>
  new Intl.NumberFormat('fa-IR').format(Number(n)) + ' ریال'
const weight = (n: number) =>
  new Intl.NumberFormat('fa-IR', { minimumFractionDigits: 3 }).format(
    n / 1000,
  ) + ' گرم'
const labels: Record<string, string> = {
  pending: 'در انتظار پرداخت',
  paid: 'پرداخت شده',
  failed: 'پرداخت ناموفق',
  expired: 'منقضی شده',
}
const errors: Record<string, string> = {
  CONFLICT_OFFER_CHANGED:
    'قیمت یا موجودی عرضه تغییر کرده است؛ قیمت تازه را بررسی کنید.',
  CONFLICT_STOCK: 'موجودی کافی نیست؛ سبد را اصلاح کنید.',
  CONFLICT_RATE_CHANGED:
    'نرخ طلا تغییر کرده است؛ قیمت تازه را بررسی و دوباره تأیید کنید.',
  CONFLICT_RATE_STALE: 'نرخ نیاز به به‌روزرسانی مدیر دارد.',
  CONFLICT_VERSION: 'موجودی تغییر کرده است؛ صفحه را تازه کنید.',
  UNAUTHORIZED: 'ایمیل یا رمز عبور نادرست است، یا نشست پایان یافته است.',
  FORBIDDEN: 'دسترسی مجاز نیست.',
  INVALID_ADDRESS: 'شماره همراه و کد پستی را بررسی کنید.',
  INVALID_PASSWORD_MIN_12: 'رمز عبور باید حداقل ۱۲ نویسه باشد.',
  CONFLICT_DUPLICATE: 'این مورد قبلاً ثبت شده است.',
  BACKEND_UNAVAILABLE: 'ارتباط با سرور برقرار نشد.',
}
export default function Home() {
  const [products, setProducts] = useState<Product[]>([]),
    [rate, setRate] = useState<any>(null),
    [user, setUser] = useState<User | null>(null),
    [token, setToken] = useState(''),
    [view, setView] = useState('catalog'),
    [cart, setCart] = useState<Record<string, number>>({}),
    [orders, setOrders] = useState<any[]>([]),
    [managed, setManaged] = useState<any>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [category, setCategory] = useState('همه'),
    [register, setRegister] = useState(false),
    [checkoutKey, setCheckoutKey] = useState(''),
    [address, setAddress] = useState({
      name: '',
      phone: '',
      city: '',
      address: '',
      postal_code: '',
    })
  async function api(action: string, body?: any, session = token) {
    const r = await fetch('/api/didar/' + action, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(session ? { authorization: 'Bearer ' + session } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const d = await r.json()
    if (!r.ok) throw new Error(errors[d.message] || d.message || 'خطای سرور')
    return d
  }
  async function refresh() {
    const d = await api('catalog')
    setProducts(d.products)
    setRate(d.rate)
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    try {
      await fn()
    } catch (e: any) {
      setMessage(e.message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    const t = sessionStorage.getItem('didar-session') || ''
    setToken(t)
    try {
      setCart(JSON.parse(localStorage.getItem('didar-cart') || '{}'))
    } catch {}
    run(async () => {
      await refresh()
      if (t) {
        const d = await api('me', undefined, t)
        setUser(d.user)
      }
    })
  }, [])
  useEffect(() => {
    localStorage.setItem('didar-cart', JSON.stringify(cart))
    setCheckoutKey('')
  }, [cart])
  const all = products.flatMap((p) =>
    p.offers.map((o) => ({ ...o, title: p.title })),
  )
  const lines = all.filter((o) => cart[o.id] > 0),
    total = lines.reduce((s, o) => s + o.price.total_irr * cart[o.id], 0)
  function add(o: Offer) {
    setCart((c) => ({ ...c, [o.id]: Math.min((c[o.id] || 0) + 1, o.quantity) }))
    setMessage('به سبد خرید اضافه شد.')
  }
  async function navigate(v: string) {
    setView(v)
    setMessage('')
    await run(async () => {
      if (v === 'orders') setOrders((await api('orders')).orders)
      if (v === 'manage') setManaged(await api('manage'))
    })
  }
  const input = (key: keyof typeof address, label: string) => (
    <label>
      {label}
      <input
        required
        value={address[key]}
        onChange={(e) => setAddress({ ...address, [key]: e.target.value })}
      />
    </label>
  )
  return (
    <>
      <header>
        <Link className="brand" href="/">
          دیدار<span>GOLD MARKETPLACE</span>
        </Link>
        <nav>
          <button onClick={() => navigate('catalog')}>ویترین طلا</button>
          <button onClick={() => navigate('cart')}>
            سبد خرید <b>{Object.values(cart).reduce((s, n) => s + n, 0)}</b>
          </button>
          {user ? (
            <>
              <button onClick={() => navigate('orders')}>سفارش‌ها</button>
              {user.role !== 'customer' && (
                <button onClick={() => navigate('manage')}>مدیریت طلا</button>
              )}
              <button
                onClick={() =>
                  run(async () => {
                    await api('logout', {})
                    setToken('')
                    setUser(null)
                    sessionStorage.removeItem('didar-session')
                    setView('catalog')
                  })
                }
              >
                خروج · {user.name}
              </button>
            </>
          ) : (
            <button onClick={() => setView('login')}>ورود / عضویت</button>
          )}
        </nav>
      </header>
      <main>
        {message && (
          <div role="status" className="message">
            {message}
            <button aria-label="بستن پیام" onClick={() => setMessage('')}>
              ×
            </button>
          </div>
        )}
        {busy && <p role="status">در حال پردازش…</p>}
        {view === 'catalog' && (
          <>
            <section className="hero">
              <div>
                <p className="eyebrow">طلای اصیل، انتخاب آگاهانه</p>
                <h1>
                  درخششِ طلا،
                  <br />
                  <em>شفافیتِ دیدار.</em>
                </h1>
                <p>
                  یک کاتالوگ، چند تأمین‌کننده. طلای ۱۸ عیار را با وزن دقیق و
                  جزئیات روشن قیمت مقایسه کنید.
                </p>
                <a href="#catalog" className="primary">
                  کشف مجموعه دیدار ←
                </a>
                <div className="trust">
                  وزن دقیق تا میلی‌گرم <span>✦</span> فاکتور شفاف <span>✦</span>{' '}
                  انتخاب تأمین‌کننده
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="orbit" />
                <div className="jewel">✧</div>
                <span>دیدار / مجموعه طلا</span>
              </div>
            </section>
            <section className="rate">
              <span>نرخ مبنای هر گرم طلای ۱۸ عیار</span>
              <strong>{rate ? money(rate.rate_irr) : 'دریافت نرخ…'}</strong>
              <small>
                نرخ نمایشی سندباکس ·{' '}
                {rate && new Date(rate.updated_at).toLocaleString('fa-IR')}
              </small>
            </section>
            <section id="catalog">
              <div className="section-title">
                <div>
                  <p className="eyebrow">مجموعه منتخب</p>
                  <h2>برای هر روزِ درخشان شما</h2>
                </div>
                <input
                  aria-label="جستجوی محصول"
                  placeholder="جستجو در مجموعه…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="tabs">
                {['همه', ...new Set(products.map((p) => p.category))].map(
                  (c) => (
                    <button
                      className={category === c ? 'selected' : ''}
                      key={c}
                      onClick={() => setCategory(c)}
                    >
                      {c}
                    </button>
                  ),
                )}
              </div>
              <div className="grid">
                {products
                  .filter(
                    (p) =>
                      (category === 'همه' || p.category === category) &&
                      p.title.includes(search),
                  )
                  .map((p, i) => (
                    <article className="product" key={p.id}>
                      <div
                        className={'product-art art-' + (i % 4)}
                        aria-label={p.category}
                      >
                        <span>
                          {p.category === 'انگشتر'
                            ? '◉'
                            : p.category === 'گردنبند'
                              ? '♧'
                              : p.category === 'گوشواره'
                                ? '♧ ♧'
                                : '◎'}
                        </span>
                        <small>۱۸ عیار / {p.purity}</small>
                      </div>
                      <div className="product-body">
                        <small>{p.category}</small>
                        <h3>{p.title}</h3>
                        <p>{p.description}</p>
                        {p.offers.map((o) => (
                          <div className="offer" key={o.id}>
                            <div>
                              <strong>{o.supplier}</strong>
                              <span>
                                {weight(o.weight_mg)} · موجودی{' '}
                                {new Intl.NumberFormat('fa-IR').format(
                                  o.quantity,
                                )}
                              </span>
                            </div>
                            <b>{money(o.price.total_irr)}</b>
                            <details>
                              <summary>جزئیات قیمت</summary>
                              <p>
                                اصل طلا: {money(o.price.metal_irr)}
                                <br />
                                اجرت: {money(o.price.labor_irr)}
                                <br />
                                سود: {money(o.price.margin_irr)}
                                <br />
                                مالیات اجرت و سود: {money(o.price.tax_irr)}
                              </p>
                            </details>
                            <button
                              disabled={!o.quantity || busy}
                              onClick={() => add(o)}
                            >
                              {o.quantity ? 'افزودن به سبد +' : 'ناموجود'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
              </div>
              {!products.length && !busy && (
                <p>محصولی دریافت نشد. اتصال سرور را بررسی کنید.</p>
              )}
            </section>
          </>
        )}
        {view === 'login' && (
          <section className="form-card">
            <p className="eyebrow">حساب دیدار</p>
            <h1>{register ? 'عضویت در دیدار' : 'خوش آمدید'}</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const f = new FormData(e.currentTarget)
                run(async () => {
                  const d = await api(
                    register ? 'register' : 'login',
                    Object.fromEntries(f),
                  )
                  sessionStorage.setItem('didar-session', d.token)
                  setToken(d.token)
                  setUser(d.user)
                  setView('catalog')
                })
              }}
            >
              {register && (
                <label>
                  نام
                  <input name="name" required />
                </label>
              )}
              <label>
                ایمیل
                <input name="email" type="email" dir="ltr" required />
              </label>
              <label>
                رمز عبور
                <input
                  name="password"
                  type="password"
                  minLength={12}
                  required
                  dir="ltr"
                />
              </label>
              <button className="primary" disabled={busy}>
                {register ? 'ایجاد حساب' : 'ورود'}
              </button>
            </form>
            <button onClick={() => setRegister(!register)}>
              {register ? 'حساب دارید؟ ورود' : 'حساب ندارید؟ عضویت'}
            </button>
            <p className="muted">
              محیط آزمایشی است؛ پرداخت واقعی انجام نمی‌شود.
            </p>
          </section>
        )}
        {view === 'cart' && (
          <section>
            <h1>سبد خرید شما</h1>
            {!lines.length ? (
              <p>سبد شما خالی است.</p>
            ) : (
              <>
                <div className="cart-grid">
                  <div>
                    {lines.map((o) => (
                      <article className="cart-line" key={o.id}>
                        <h3>{o.title}</h3>
                        <p>
                          {o.supplier} · {weight(o.weight_mg)}
                        </p>
                        <label>
                          تعداد
                          <input
                            aria-label={'تعداد ' + o.title}
                            type="number"
                            min={1}
                            max={o.quantity}
                            value={cart[o.id]}
                            onChange={(e) =>
                              setCart({
                                ...cart,
                                [o.id]: Math.max(
                                  1,
                                  Math.min(o.quantity, Number(e.target.value)),
                                ),
                              })
                            }
                          />
                        </label>
                        <strong>{money(o.price.total_irr * cart[o.id])}</strong>
                        <button
                          onClick={() => {
                            const c = { ...cart }
                            delete c[o.id]
                            setCart(c)
                          }}
                        >
                          حذف
                        </button>
                      </article>
                    ))}
                  </div>
                  <aside>
                    <h2>تکمیل خرید</h2>
                    <p>
                      جمع کل: <strong>{money(total)}</strong>
                    </p>
                    <p>
                      قیمت نهایی در ثبت سفارش قفل می‌شود. رزرو موجودی ۱۵ دقیقه
                      است.
                    </p>
                    {user?.role === 'customer' ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault()
                          run(async () => {
                            const key = checkoutKey || crypto.randomUUID()
                            setCheckoutKey(key)
                            await api('checkout', {
                              idempotency_key: key,
                              rate_version: rate.version,
                              lines: lines.map((o) => ({
                                offer_id: o.id,
                                quantity: cart[o.id],
                                version: o.version,
                              })),
                              address,
                            })
                            setCart({})
                            setOrders((await api('orders')).orders)
                            setView('orders')
                            setMessage(
                              'سفارش ثبت شد. پرداخت آزمایشی را تکمیل کنید.',
                            )
                            await refresh()
                          })
                        }}
                      >
                        {input('name', 'نام گیرنده')}
                        {input('phone', 'شماره همراه (09…)')}
                        {input('city', 'شهر')}
                        {input('address', 'نشانی کامل')}
                        {input('postal_code', 'کد پستی ۱۰ رقمی')}
                        <button className="primary" disabled={busy}>
                          ثبت و تأیید قیمت سفارش
                        </button>
                      </form>
                    ) : (
                      <button
                        className="primary"
                        onClick={() => setView('login')}
                      >
                        برای خرید وارد حساب مشتری شوید
                      </button>
                    )}
                    <button onClick={() => run(refresh)}>
                      دریافت قیمت تازه
                    </button>
                  </aside>
                </div>
              </>
            )}
          </section>
        )}
        {view === 'orders' && (
          <section>
            <h1>سفارش‌های {user?.name}</h1>
            <button onClick={() => navigate('orders')}>تازه‌سازی</button>
            {orders.length === 0 && <p>هنوز سفارشی ثبت نشده است.</p>}
            {orders.map((o) => (
              <article className="order" key={o.id}>
                <div className="section-title">
                  <h3>
                    سفارش <code>{o.id.slice(0, 8)}</code>
                  </h3>
                  <span className="badge">{labels[o.status]}</span>
                </div>
                <p>{new Date(o.created_at).toLocaleString('fa-IR')}</p>
                {o.lines.map((l: any, i: number) => (
                  <p key={i}>
                    {l.title} · {weight(l.weight_mg)} × {l.quantity} ·{' '}
                    {money(l.breakdown.total_irr * l.quantity)}
                  </p>
                ))}
                {o.total_irr && <strong>جمع کل: {money(o.total_irr)}</strong>}
                {o.status === 'pending' && user?.role === 'customer' && (
                  <div className="sandbox">
                    <h3>درگاه پرداخت آزمایشی</h3>
                    <p>
                      این درگاه پول واقعی دریافت نمی‌کند. فقط یکی از نتیجه‌های
                      آزمایشی را انتخاب کنید.
                    </p>
                    {['success', 'failure'].map((outcome) => (
                      <button
                        key={outcome}
                        disabled={busy}
                        className={outcome === 'success' ? 'primary' : ''}
                        onClick={() =>
                          run(async () => {
                            await api('payment', { order_id: o.id, outcome })
                            setOrders((await api('orders')).orders)
                            await refresh()
                          })
                        }
                      >
                        {outcome === 'success'
                          ? 'شبیه‌سازی پرداخت موفق'
                          : 'شبیه‌سازی پرداخت ناموفق'}
                      </button>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
        {view === 'manage' && managed && (
          <section>
            <h1>
              {user?.role === 'admin'
                ? 'مدیریت بازار دیدار'
                : 'پنل تأمین‌کننده'}
            </h1>
            <p>
              وزن بر حسب میلی‌گرم، قیمت بر حسب ریال و سود/مالیات بر حسب صدم درصد
              (۷۰۰ = ۷٪).
            </p>
            {user?.role === 'admin' && (
              <div className="admin-grid">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    run(async () => {
                      await api('manage', {
                        kind: 'rate',
                        rate_irr: Number(f.get('rate')),
                        tax_bps: Number(f.get('tax')),
                      })
                      setManaged(await api('manage'))
                      await refresh()
                      setMessage('نرخ ذخیره شد.')
                    })
                  }}
                >
                  <h2>نرخ و مالیات</h2>
                  <label>
                    ریال / گرم
                    <input
                      name="rate"
                      type="number"
                      min="1"
                      defaultValue={managed.rate.rate_irr}
                      required
                    />
                  </label>
                  <label>
                    مالیات (bps)
                    <input
                      name="tax"
                      type="number"
                      min="0"
                      max="10000"
                      defaultValue={managed.rate.tax_bps}
                      required
                    />
                  </label>
                  <button disabled={busy}>ذخیره نرخ</button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    run(async () => {
                      await api('manage', {
                        kind: 'product',
                        title: f.get('title'),
                        category: f.get('category'),
                        purity: Number(f.get('purity')),
                      })
                      setManaged(await api('manage'))
                      await refresh()
                    })
                  }}
                >
                  <h2>محصول مشترک جدید</h2>
                  <label>
                    نام
                    <input name="title" required />
                  </label>
                  <label>
                    دسته
                    <input name="category" required />
                  </label>
                  <label>
                    عیار هزارگانی
                    <input
                      name="purity"
                      type="number"
                      defaultValue={750}
                      min="1"
                      max="1000"
                      required
                    />
                  </label>
                  <button disabled={busy}>ثبت در کاتالوگ Mercur</button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    run(async () => {
                      await api('manage', {
                        kind: 'supplier',
                        name: f.get('name'),
                      })
                      setManaged(await api('manage'))
                    })
                  }}
                >
                  <h2>تأمین‌کننده جدید</h2>
                  <label>
                    نام
                    <input name="name" required />
                  </label>
                  <button disabled={busy}>ثبت تأمین‌کننده</button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const f = new FormData(e.currentTarget)
                    run(async () => {
                      await api('manage', {
                        kind: 'new_offer',
                        product_id: f.get('product_id'),
                        supplier_id: f.get('supplier_id'),
                        weight_mg: Number(f.get('weight_mg')),
                        quantity: Number(f.get('quantity')),
                        labor_irr: Number(f.get('labor_irr')),
                        margin_bps: Number(f.get('margin_bps')),
                      })
                      setManaged(await api('manage'))
                      await refresh()
                    })
                  }}
                >
                  <h2>عرضه با وزن دقیق</h2>
                  <label>
                    محصول
                    <select name="product_id">
                      {managed.products.map((p: Product) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تأمین‌کننده
                    <select name="supplier_id">
                      {managed.suppliers.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {[
                    ['weight_mg', 'وزن میلی‌گرم', 1],
                    ['quantity', 'تعداد', 0],
                    ['labor_irr', 'اجرت ریال', 0],
                    ['margin_bps', 'سود bps', 0],
                  ].map(([n, l, min]) => (
                    <label key={n}>
                      {l}
                      <input
                        name={String(n)}
                        type="number"
                        min={min}
                        required
                      />
                    </label>
                  ))}
                  <button disabled={busy}>ثبت عرضه</button>
                </form>
              </div>
            )}
            {user?.role === 'admin' && (
              <details className="order">
                <summary>شناسه تأمین‌کنندگان برای ساخت حساب اپراتوری</summary>
                {managed.suppliers.map((s: any) => (
                  <p key={s.id}>
                    {s.name} · <code>{s.id}</code>
                  </p>
                ))}
                <p>
                  برای ایجاد حساب تأمین‌کننده از ابزار امن create-account
                  استفاده کنید.
                </p>
              </details>
            )}
            {user?.role === 'supplier' && (
              <form
                className="order"
                onSubmit={(e) => {
                  e.preventDefault()
                  const f = new FormData(e.currentTarget)
                  run(async () => {
                    await api('manage', {
                      kind: 'new_offer',
                      product_id: f.get('product_id'),
                      weight_mg: Number(f.get('weight_mg')),
                      quantity: Number(f.get('quantity')),
                      labor_irr: Number(f.get('labor_irr')),
                      margin_bps: Number(f.get('margin_bps')),
                    })
                    setManaged(await api('manage'))
                    await refresh()
                    setMessage('عرضه شما ثبت شد.')
                  })
                }}
              >
                <h2>عرضه در کاتالوگ مشترک</h2>
                <label>
                  محصول
                  <select name="product_id">
                    {managed.products.map((p: Product) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ['weight_mg', 'وزن میلی‌گرم', 1],
                    ['quantity', 'تعداد قابل فروش', 0],
                    ['labor_irr', 'اجرت ریال', 0],
                    ['margin_bps', 'سود bps', 0],
                  ] as const
                ).map(([n, l, min]) => (
                  <label key={n}>
                    {l}
                    <input name={n} type="number" min={min} required />
                  </label>
                ))}
                <button disabled={busy}>ثبت عرضه من</button>
              </form>
            )}
            {managed.products.map((p: Product) => (
              <article className="order" key={p.id}>
                <h2>{p.title}</h2>
                {p.offers.map((o: Offer) => (
                  <form
                    className="inventory-form"
                    key={o.id + o.version}
                    onSubmit={(e) => {
                      e.preventDefault()
                      const f = new FormData(e.currentTarget)
                      run(async () => {
                        await api('manage', {
                          kind: 'offer',
                          id: o.id,
                          version: o.version,
                          quantity: Number(f.get('quantity')),
                          labor_irr: Number(f.get('labor')),
                          margin_bps: Number(f.get('margin')),
                        })
                        setManaged(await api('manage'))
                        await refresh()
                        setMessage('موجودی ذخیره شد.')
                      })
                    }}
                  >
                    <strong>
                      {o.supplier} · {weight(o.weight_mg)}
                    </strong>
                    <label>
                      تعداد
                      <input
                        type="number"
                        name="quantity"
                        min="0"
                        defaultValue={o.quantity}
                        required
                      />
                    </label>
                    <label>
                      اجرت ریال
                      <input
                        type="number"
                        name="labor"
                        min="0"
                        defaultValue={o.labor_irr}
                        required
                      />
                    </label>
                    <label>
                      سود bps
                      <input
                        type="number"
                        name="margin"
                        min="0"
                        max="10000"
                        defaultValue={o.margin_bps}
                        required
                      />
                    </label>
                    <button disabled={busy}>ذخیره</button>
                  </form>
                ))}
              </article>
            ))}
          </section>
        )}
      </main>
      <footer>
        <div className="brand">دیدار گلد</div>
        <p>زیبایی ماندگار، خرید شفاف. بازار طلای چند تأمین‌کننده.</p>
        <small>محیط آزمایشی · مبالغ به ریال · بدون پرداخت واقعی</small>
      </footer>
    </>
  )
}
