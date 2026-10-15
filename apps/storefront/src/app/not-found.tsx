import Link from 'next/link'
export default function NotFound() {
  return (
    <div className="empty">
      <h1>صفحه پیدا نشد</h1>
      <Link href="/products">بازگشت به ویترین طلا</Link>
    </div>
  )
}
