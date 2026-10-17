'use client'
import { useEffect, useState } from 'react'
import { RequireUser, useDidar, ScopedLink as Link } from './store'
import { PricingBreakdown } from './catalog'
import {date,money,number,states,weight} from './locale'
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
                  {money(
                    l.breakdown.total_irr * l.quantity +
                      (l.breakdown.order_allocations || [])
                        .flat()
                        .filter((r: any) => r.payer === 'CUSTOMER')
                        .reduce(
                          (s: number, r: any) => s + r.amount_irr + r.tax_irr,
                          0,
                        ),
                  )}
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
