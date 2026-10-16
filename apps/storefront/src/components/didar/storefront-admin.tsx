'use client'
import { useCallback, useEffect, useState } from 'react'
import { useDidar, RequireUser, ScopedLink as Link } from './store'
export function StorefrontAdmin() {
  return (
    <RequireUser>
      <Editor />
    </RequireUser>
  )
}
function Editor() {
  const { api, run, busy, user } = useDidar(),
    [data, setData] = useState<any>(null),
    [sid, setSid] = useState('')
  const load = useCallback(async () => {
    const d = await api('storefront')
    setData(d)
    setSid((x) => x || d.suppliers[0]?.id || '')
  }, [api])
  useEffect(() => {
    run(load)
  }, [load])
  const old = data?.stores.find((s: any) => s.supplier_id === sid)
  async function save(body: any) {
    await api('storefront', { ...body, supplier_id: sid })
    await load()
  }
  return (
    <section>
      <p className="eyebrow">مدیریت ویترین اختصاصی</p>
      <h1>فروشگاه من</h1>
      <p>
        انتشار و افزایش دسترسی نیازمند تأیید دیدار است. شناسه پیوند پس از ایجاد
        ثابت می‌ماند.
      </p>
      <Link href="/manage">مدیریت محصولات و پذیرش قطعات ←</Link>
      <label>
        فروشنده
        <select
          aria-label="فروشنده ویترین"
          value={sid}
          onChange={(e) => setSid(e.target.value)}
        >
          {data?.suppliers.map((s: any) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {sid && (
        <form
          className="card form-grid"
          key={sid + ':' + (old?.version || 0)}
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(() =>
              save({
                kind: 'save',
                version: old?.version,
                handle: f.get('handle'),
                name: f.get('name'),
                intro: f.get('intro'),
                contact: f.get('contact'),
                logo_image_id: f.get('logo'),
                visibility: f.get('visibility'),
                published: f.has('published'),
                approved: f.has('approved'),
              }),
            )
          }}
        >
          <label>
            شناسه پیوند ثابت
            <input
              name="handle"
              aria-label="شناسه پیوند ثابت"
              dir="ltr"
              required
              pattern="[a-z0-9][a-z0-9-]{2,59}"
              defaultValue={old?.handle}
              readOnly={!!old}
            />
          </label>
          <label>
            نام ویترین
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={old?.name}
            />
          </label>
          <label>
            معرفی
            <textarea name="intro" maxLength={2000} defaultValue={old?.intro} />
          </label>
          <label>
            اطلاعات تماس مجاز
            <input name="contact" maxLength={300} defaultValue={old?.contact} />
          </label>
          <label>
            شناسه تصویر نشان از محصولات خود
            <input name="logo" defaultValue={old?.logo_image_id} />
          </label>
          <label>
            دسترسی
            <select
              name="visibility"
              defaultValue={old?.visibility || 'PUBLIC_MARKETPLACE'}
            >
              <option value="PUBLIC_MARKETPLACE">
                بازار عمومی و پیوند فروشگاه
              </option>
              <option value="UNLISTED_LINK">
                فقط پیوند؛ خارج از جستجوی عمومی
              </option>
              <option value="INVITE_ONLY">فقط مشتری دعوت‌شده و واردشده</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="published"
              defaultChecked={old?.published}
            />
            منتشر شود
          </label>
          {user?.role === 'admin' && (
            <label className="check">
              <input
                type="checkbox"
                name="approved"
                defaultChecked={old?.approved}
              />
              تأیید دیدار
            </label>
          )}
          <button className="primary" disabled={busy}>
            ذخیره ویترین
          </button>
          {old && (
            <p>
              وضعیت: {old.approved ? 'تأیید شده' : 'در انتظار تأیید'} ·{' '}
              <a href={'/m/' + old.handle}>مشاهده فروشگاه</a>
            </p>
          )}
        </form>
      )}
      {sid && (
        <form
          className="card form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(() =>
              save({
                kind: 'invite',
                email: f.get('email'),
                days: Number(f.get('days')),
                active: f.has('active'),
              }),
            )
          }}
        >
          <h2>دعوت مشتری به ویترین خصوصی</h2>
          <label>
            ایمیل حساب مشتری
            <input name="email" type="email" required />
          </label>
          <label>
            روز اعتبار
            <input
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={30}
            />
          </label>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked />
            دعوت فعال؛ برای لغو بردارید
          </label>
          <button disabled={busy}>ثبت دسترسی دعوت</button>
        </form>
      )}
      {user?.role === 'admin' && sid && (
        <form
          className="card form-grid"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(() =>
              save({
                kind: 'member',
                email: f.get('email'),
                permission: f.get('permission'),
                active: f.has('active'),
              }),
            )
          }}
        >
          <h2>دسترسی محدود همکار</h2>
          <label>
            ایمیل حساب موجود
            <input name="email" type="email" required />
          </label>
          <label>
            مجوز
            <select name="permission">
              <option value="STOREFRONT">ویترین</option>
              <option value="SHARE">اشتراک‌گذاری</option>
              <option value="ONBOARDING">همراهی ثبت محصول</option>
              <option value="CONTENT_EDIT">ویرایش صفحه</option>
              <option value="CONTENT_PUBLISH">تأیید و انتشار صفحه</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked />
            فعال
          </label>
          <button disabled={busy}>ذخیره دسترسی همکار</button>
        </form>
      )}
    </section>
  )
}
