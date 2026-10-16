import './design-tokens.css'
import './globals.css'
import './luxury-foundation.css'
import { DidarProvider } from '@/components/didar/store'
function metadataOrigin() {
  try {
    const value = process.env.DIDAR_PUBLIC_ORIGIN
    if (process.env.DIDAR_PUBLIC_ORIGIN_VERIFIED !== 'true' || !value)
      return undefined
    const u = new URL(value)
    return u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      u.pathname === '/' &&
      !u.search &&
      !u.hash
      ? new URL(u.origin)
      : undefined
  } catch {
    return undefined
  }
}
export const metadata = {
  metadataBase: metadataOrigin(),
  title: 'دیدار گلد | بازار طلای تأمین‌کنندگان',
  description: 'خرید شفاف طلای ۱۸ عیار با وزن دقیق و مقایسه تأمین‌کنندگان',
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <DidarProvider>{children}</DidarProvider>
      </body>
    </html>
  )
}
