'use client'
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1>دریافت این صفحه ممکن نشد</h1>
      <p>اتصال را بررسی و دوباره تلاش کنید.</p>
      <button onClick={reset}>تلاش دوباره</button>
    </div>
  )
}
