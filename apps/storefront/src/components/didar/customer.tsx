'use client'
import { PricingBreakdown } from './catalog'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RequireUser, useDidar } from './store'
import { date, money, number, states, weight } from './locale'
export function Login() {
  const { api, run, busy, authenticate, user, setMessage } = useDidar()
  const router = useRouter()
  const [register, setRegister] = useState(false),
    [supplier, setSupplier] = useState(false)
  useEffect(() => {
    if (
      new URLSearchParams(window.location.search).get('register') === 'supplier'
    ) {
      setRegister(true)
      setSupplier(true)
    }
  }, [])
  return (
    <section className="auth card">
      <p className="eyebrow">به دیدار خوش آمدید</p>
      <h1>{register ? 'ایجاد حساب جدید' : 'ورود به دیدار'}</h1>
      {user && (
        <p>
          با حساب {user.name} وارد شده‌اید. <Link href="/account">حساب من</Link>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          run(async () => {
            const d = await api(register ? 'register' : 'login', {
              email: f.get('email'),
              password: f.get('password'),
              ...(register
                ? {
                    name: f.get('name'),
                    role: supplier ? 'supplier' : 'customer',
                  }
                : {}),
            })
            authenticate(d)
            router.push(
              supplier || d.user.role !== 'customer' ? '/manage' : '/account',
            )
            if (register && supplier)
              setMessage(
                'درخواست عضویت ثبت شد؛ فعالیت شما پس از تأیید مدیر آغاز می‌شود.',
              )
          })
        }}
      >
        {register && (
          <label>
            نام کامل / کسب‌وکار
            <input
              name="name"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
            />
          </label>
        )}
        <label>
          ایمیل
          <input
            name="email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
          />
        </label>
        <label>
          رمز عبور
          <input
            name="password"
            type="password"
            minLength={12}
            required
            dir="ltr"
            autoComplete={register ? 'new-password' : 'current-password'}
          />
        </label>
        {register && (
          <label className="check">
            <input
              type="checkbox"
              checked={supplier}
              onChange={(e) => setSupplier(e.target.checked)}
            />
            ثبت‌نام به عنوان تأمین‌کننده (نیازمند تأیید مدیر)
          </label>
        )}
        <button className="primary" disabled={busy}>
          {register ? 'ایجاد حساب' : 'ورود'}
        </button>
      </form>
      <button onClick={() => setRegister(!register)}>
        {register ? 'حساب دارید؟ ورود' : 'حساب ندارید؟ عضویت'}
      </button>
      <p className="muted">
        حداقل ۱۲ نویسه برای رمز عبور. این محیط آزمایشی است؛ پرداخت واقعی انجام
        نمی‌شود.
      </p>
    </section>
  )
}
export function CheckoutForm() {
  const { products, rate, cart, setCart, user, api, run, busy, refresh } =
      useDidar(),
    router = useRouter()
  const [draftReady, setDraftReady] = useState(false)
  const [address, setAddress] = useState({
    name: '',
    phone: '',
    city: '',
    address: '',
    postal_code: '',
  })
  const all = products.flatMap((p) =>
      p.offers.map((o) => ({ ...o, title: p.title })),
    ),
    lines = all.filter((o) => cart[o.id] > 0)
  const missing = Object.keys(cart).filter(
    (id) => !all.some((o) => o.id === id),
  )
  const invalid = lines.some((o) => !o.price || cart[o.id] > o.quantity)
  useEffect(() => {
    try {
      const draft = JSON.parse(
        sessionStorage.getItem('didar-checkout-address') || '{}',
      )
      setAddress((a) => ({ ...a, ...draft }))
    } catch {}
    setDraftReady(true)
  }, [])
  useEffect(() => {
    if (draftReady)
      sessionStorage.setItem('didar-checkout-address', JSON.stringify(address))
  }, [address, draftReady])
  useEffect(() => {
    if (user)
      setAddress((a) => ({
        ...a,
        name: a.name || user.name,
        phone: a.phone || user.phone || '',
        ...(user.address || {}),
      }))
  }, [user])
  return (
    <aside className="card checkout">
      <h2>تکمیل خرید</h2>
      <p>
        جمع کل:{' '}
        <strong>
          {money(
            lines.reduce(
              (s, o) => s + (o.price?.total_irr || 0) * cart[o.id],
              0,
            ),
          )}
        </strong>
      </p>
      <p className="muted">
        فروشنده: دیدار. قیمت نهایی در ثبت سفارش قفل می‌شود. رزرو موجودی ۱۵ دقیقه
        است. هزینه ارسال این سندباکس صفر است.
      </p>
      {user?.role === 'customer' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              if (missing.length || !lines.length || invalid)
                throw new Error('محصول ناموجود را از سبد حذف کنید.')
              // Keep an uncertain network result recoverable across reloads of this cart intent.
              const signature = JSON.stringify({
                customer: user.id,
                cart: Object.entries(cart).sort(([a], [b]) =>
                  a.localeCompare(b),
                ),
                address,
              })
              let previous: { signature?: string; key?: string } = {}
              try {
                previous = JSON.parse(
                  sessionStorage.getItem('didar-checkout-intent') || '{}',
                )
              } catch {}
              const idempotency_key =
                previous.signature === signature && previous.key
                  ? previous.key
                  : crypto.randomUUID()
              sessionStorage.setItem(
                'didar-checkout-intent',
                JSON.stringify({ signature, key: idempotency_key }),
              )
              const d = await api('checkout', {
                idempotency_key,
                rate_version: rate.version,
                quote_expires_at: rate.quote_expires_at,
                lines: lines.map((o) => ({
                  offer_id: o.id,
                  quantity: cart[o.id],
                  version: o.version,
                })),
                address,
              })
              const id = d.order?.id || d.id
              setCart({})
              sessionStorage.removeItem('didar-checkout-intent')
              sessionStorage.removeItem('didar-checkout-address')
              await refresh()
              router.push(id ? '/orders/' + id : '/orders')
            })
          }}
        >
          {(
            [
              ['name', 'نام گیرنده'],
              ['phone', 'شماره همراه (09…)'],
              ['city', 'شهر'],
              ['address', 'نشانی کامل'],
              ['postal_code', 'کد پستی ۱۰ رقمی'],
            ] as const
          ).map(([name, label]) => (
            <label key={name}>
              {label}
              <input
                required
                value={address[name]}
                inputMode={
                  name === 'phone' || name === 'postal_code'
                    ? 'numeric'
                    : undefined
                }
                maxLength={
                  name === 'phone' ? 11 : name === 'postal_code' ? 10 : 500
                }
                pattern={
                  name === 'phone'
                    ? '09[0-9]{9}'
                    : name === 'postal_code'
                      ? '[0-9]{10}'
                      : undefined
                }
                onChange={(e) =>
                  setAddress({ ...address, [name]: e.target.value })
                }
              />
            </label>
          ))}
          {invalid && (
            <p role="alert">
              قیمت معتبر یا موجودی کافی در دسترس نیست؛ نرخ و سبد را تازه کنید.
            </p>
          )}
          <button
            className="primary"
            disabled={busy || !lines.length || !!missing.length || invalid}
          >
            ثبت و تأیید قیمت سفارش
          </button>
        </form>
      ) : (
        <Link className="primary" href="/login">
          برای خرید وارد حساب مشتری شوید
        </Link>
      )}
      <button disabled={busy} onClick={() => run(refresh)}>
        دریافت قیمت تازه
      </button>
    </aside>
  )
}
export function Cart({ checkoutOnly = false }: { checkoutOnly?: boolean }) {
  const { products, cart, setCart, loading } = useDidar()
  const all = products.flatMap((p) =>
    p.offers.map((o) => ({ ...o, title: p.title, product_id: p.id })),
  )
  const lines = all.filter((o) => cart[o.id] > 0),
    missing = Object.keys(cart).filter((id) => !all.some((o) => o.id === id))
  function remove(id: string) {
    setCart((c) => {
      const n = { ...c }
      delete n[id]
      return n
    })
  }
  return (
    <section>
      <h1>{checkoutOnly ? 'ثبت سفارش' : 'سبد خرید شما'}</h1>
      {loading ? (
        <p role="status">در حال دریافت سبد…</p>
      ) : !Object.keys(cart).length ? (
        <div className="empty">
          <p>سبد شما خالی است.</p>
          <Link className="primary" href="/products">
            انتخاب از ویترین
          </Link>
        </div>
      ) : (
        <div className="cart-grid">
          <div>
            {missing.map((id) => (
              <article className="cart-line" key={id}>
                <p>این عرضه دیگر در ویترین موجود نیست.</p>
                <button onClick={() => remove(id)}>حذف کالای ناموجود</button>
              </article>
            ))}
            {lines.map((o) => (
              <article className="cart-line" key={o.id}>
                <h3>
                  <Link href={'/products/' + o.product_id}>{o.title}</Link>
                </h3>
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
                      setCart((c) => ({
                        ...c,
                        [o.id]: Math.max(
                          1,
                          Math.min(o.quantity, Number(e.target.value) || 1),
                        ),
                      }))
                    }
                  />
                </label>
                {cart[o.id] > o.quantity && (
                  <p role="alert">موجودی تغییر کرده؛ تعداد را اصلاح کنید.</p>
                )}
                <strong>
                  {o.price
                    ? money(o.price.total_irr * cart[o.id])
                    : 'قیمت معتبر در دسترس نیست'}
                </strong>
                <PricingBreakdown value={o.price} />
                <button onClick={() => remove(o.id)}>حذف</button>
              </article>
            ))}
            {!checkoutOnly && (
              <Link href="/checkout">رفتن به صفحه تسویه‌حساب ←</Link>
            )}
          </div>
          <CheckoutForm />
        </div>
      )}
    </section>
  )
}
export function Account() {
  return (
    <RequireUser>
      <Profile />
    </RequireUser>
  )
}
function Profile() {
  const { user, api, run, busy, updateUser, setMessage } = useDidar()
  const [profile, setProfile] = useState<any>(null)
  useEffect(() => {
    run(async () => {
      const d = await api('profile')
      setProfile(d.user || d.profile || d)
    })
  }, [])
  if (!profile)
    return (
      <section>
        <h1>حساب من</h1>
        <p role="status">در حال دریافت اطلاعات حساب…</p>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const d = await api('profile')
              setProfile(d.user || d.profile || d)
            })
          }
        >
          تلاش دوباره
        </button>
      </section>
    )
  return (
    <section>
      <h1>حساب من</h1>
      <div className="account-grid">
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(async () => {
              const d = await api('profile', {
                name: f.get('name'),
                phone: f.get('phone'),
                address:
                  f.get('city') || f.get('address') || f.get('postal_code')
                    ? {
                        name: f.get('name'),
                        phone: f.get('phone'),
                        city: f.get('city'),
                        address: f.get('address'),
                        postal_code: f.get('postal_code'),
                      }
                    : {},
              })
              const u = d.user || d.profile || d
              updateUser({ ...user!, ...u })
              setProfile(u)
              setMessage('اطلاعات حساب ذخیره شد.')
            })
          }}
        >
          <h2>اطلاعات شخصی</h2>
          <p className="muted" dir="ltr">
            {user?.email}
          </p>
          <label>
            نام کامل
            <input
              name="name"
              defaultValue={profile?.name || user?.name}
              required
              minLength={2}
            />
          </label>
          <label>
            شماره همراه
            <input
              name="phone"
              defaultValue={profile?.phone || ''}
              pattern="09[0-9]{9}"
              maxLength={11}
              inputMode="tel"
            />
          </label>
          <label>
            شهر
            <input name="city" defaultValue={profile?.address?.city || ''} />
          </label>
          <label>
            نشانی کامل
            <input
              name="address"
              defaultValue={profile?.address?.address || ''}
            />
          </label>
          <label>
            کد پستی
            <input
              name="postal_code"
              defaultValue={profile?.address?.postal_code || ''}
              pattern="[0-9]{10}"
              maxLength={10}
            />
          </label>
          <button className="primary" disabled={busy || !profile}>
            ذخیره اطلاعات حساب
          </button>
        </form>
        <aside className="card">
          <h2>سفارش‌ها و پیگیری</h2>
          <p>تاریخچه خرید، وضعیت پرداخت و مراحل ارسال را مشاهده کنید.</p>
          <Link className="primary" href="/orders">
            مشاهده سفارش‌ها
          </Link>
          {user?.role !== 'customer' && (
            <p>
              <Link href="/manage">ورود به بخش مدیریت</Link>
            </p>
          )}
          <p className="muted">
            نشست این مرورگر محدود است. برای دستگاه مشترک پس از کار خارج شوید.
          </p>
        </aside>
      </div>
    </section>
  )
}
export function Orders({ id }: { id?: string }) {
  return (
    <RequireUser>
      <OrderList id={id} />
    </RequireUser>
  )
}
function OrderList({ id }: { id?: string }) {
  const { user, api, run, busy, refresh } = useDidar()
  const [orders, setOrders] = useState<any[]>([]),
    [loaded, setLoaded] = useState(false),
    [attempts, setAttempts] = useState<Record<string, string>>({})
  async function load() {
    setOrders((await api('orders')).orders)
    setLoaded(true)
  }
  useEffect(() => {
    run(load)
  }, [])
  const shown = id ? orders.filter((o) => o.id === id) : orders
  return (
    <section>
      <div className="section-title">
        <h1>{id ? 'پیگیری سفارش' : 'سفارش‌های ' + (user?.name || '')}</h1>
        <button disabled={busy} onClick={() => run(load)}>
          تازه‌سازی
        </button>
      </div>
      {id && (
        <p>
          <Link href="/orders">← همه سفارش‌ها</Link>
        </p>
      )}
      {!loaded ? (
        <p role="status">در حال دریافت سفارش‌ها…</p>
      ) : !shown.length ? (
        <div className="empty">هنوز سفارشی ثبت نشده است.</div>
      ) : (
        shown.map((o) => (
          <article className="order" key={o.id} data-order-id={o.id}>
            <div className="section-title">
              <h2>
                <Link href={'/orders/' + o.id}>
                  سفارش <code>{o.id.slice(0, 8)}</code>
                </Link>
              </h2>
              <span className="badge">{states[o.status] || o.status}</span>
            </div>
            <p>{date(o.created_at)}</p>
            {o.payment_status && (
              <p className="payment-state">
                وضعیت پرداخت:{' '}
                <strong>{states[o.payment_status] || o.payment_status}</strong>
              </p>
            )}
            <small>
              شناسه سفارش: <code>{o.id}</code>
            </small>
            {o.lines.map((l: any) => (
              <div className="order-line" key={l.id || l.offer_id}>
                <h3>{l.title}</h3>
                <p className="muted">
                  تأمین‌کننده: {l.supplier_name || l.supplier_id}
                </p>
                <p>
                  {weight(l.weight_mg)} × {number(l.quantity)} ·{' '}
                  {money(l.breakdown.total_irr * l.quantity)}
                </p>
                <PricingBreakdown value={l.breakdown} />
                <div className="tracking">
                  <span className="badge">
                    {states[l.fulfillment_status || 'allocated']}
                  </span>
                  {l.tracking_number && (
                    <span>
                      کد رهگیری: <b dir="ltr">{l.tracking_number}</b> ·{' '}
                      {l.carrier}
                    </span>
                  )}
                </div>
                {l.items?.map((item: any) => (
                  <div key={item.reservation_id} className="card">
                    <p>
                      قطعه <code>{item.uid}</code> · {weight(item.weight_mg)} ·{' '}
                      {states[item.status] || item.status}{' '}
                      {item.return_status &&
                        ' · ' +
                          (states[item.return_status] || item.return_status)}
                    </p>
                    {o.status === 'paid' &&
                      item.status === 'sold' &&
                      !item.return_status &&
                      user?.role === 'customer' && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault()
                            const f = new FormData(e.currentTarget)
                            run(async () => {
                              await api('returns', {
                                operation: 'request',
                                reservation_id: item.reservation_id,
                                reason: f.get('reason'),
                              })
                              await load()
                            })
                          }}
                        >
                          <label>
                            دلیل درخواست مرجوعی فیزیکی
                            <input name="reason" required maxLength={1000} />
                          </label>
                          <button disabled={busy}>درخواست مرجوعی قطعه</button>
                        </form>
                      )}
                  </div>
                ))}
                {o.status === 'paid' && user?.role !== 'customer' && (
                  <Fulfillment line={l} reload={load} />
                )}
              </div>
            ))}
            {o.total_irr && <strong>جمع کل: {money(o.total_irr)}</strong>}
            {o.address?.city && (
              <p>
                گیرنده: {o.address.name} · {o.address.city} ·{' '}
                {o.address.address}
              </p>
            )}
            {o.status === 'pending' && user?.role === 'customer' && (
              <div className="sandbox">
                <h3>درگاه پرداخت آزمایشی</h3>
                <p>
                  این درگاه پول واقعی دریافت نمی‌کند. رزرو تا{' '}
                  {date(o.expires_at)} معتبر است.
                </p>
                {(['success', 'failure', 'cancel'] as const).map((outcome) => (
                  <button
                    key={outcome}
                    disabled={busy}
                    className={outcome === 'success' ? 'primary' : ''}
                    onClick={() =>
                      run(async () => {
                        let attempt_id = attempts[o.id]
                        if (!attempt_id) {
                          const d = await api('payment', {
                            order_id: o.id,
                            operation: 'initialize',
                          })
                          attempt_id = d.payment?.id || d.attempt?.id
                          setAttempts((a) => ({ ...a, [o.id]: attempt_id }))
                        }
                        await api('payment', {
                          order_id: o.id,
                          operation: 'confirm',
                          attempt_id,
                          outcome,
                        })
                        await load()
                        await refresh()
                      })
                    }
                  >
                    {outcome === 'success'
                      ? 'شبیه‌سازی پرداخت موفق'
                      : outcome === 'failure'
                        ? 'شبیه‌سازی پرداخت ناموفق'
                        : 'لغو پرداخت آزمایشی'}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))
      )}
    </section>
  )
}
function Fulfillment({
  line: l,
  reload,
}: {
  line: any
  reload: () => Promise<void>
}) {
  const { api, run, busy, user } = useDidar()
  const [allowed, setAllowed] = useState(user?.role === 'admin')
  useEffect(() => {
    if (user?.role === 'supplier')
      api('permissions')
        .then((d) =>
          setAllowed(
            d.permissions.some(
              (p: any) =>
                p.permission === 'UPDATE_OWN_FULFILLMENT' && p.granted,
            ),
          ),
        )
        .catch(() => setAllowed(false))
  }, [user?.id])
  const status = l.fulfillment_status || 'allocated'
  const next: Record<string, string> = {
    allocated: 'preparing',
    preparing: 'dispatched',
    dispatched: 'delivered',
  }
  if (
    !allowed ||
    (l.stock_mode === 'itemized' &&
      !l.items?.some((i: any) => i.status === 'sold')) ||
    !next[status] ||
    (status === 'dispatched' && user?.role === 'supplier')
  )
    return null
  return (
    <form
      className="fulfillment-form"
      onSubmit={(e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        run(async () => {
          await api('fulfillment', {
            line_id: l.id,
            status: next[status],
            tracking_number:
              f.get('tracking_number') || l.tracking_number || '',
            carrier: f.get('carrier') || l.carrier || '',
          })
          await reload()
        })
      }}
    >
      {status === 'preparing' && (
        <>
          <label>
            کد رهگیری
            <input name="tracking_number" required maxLength={100} />
          </label>
          <label>
            شرکت حمل
            <input name="carrier" required maxLength={100} />
          </label>
        </>
      )}
      <button disabled={busy}>ثبت وضعیت: {states[next[status]]}</button>
    </form>
  )
}
