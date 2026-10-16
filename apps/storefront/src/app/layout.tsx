import './design-tokens.css'
import './globals.css'
import './luxury-foundation.css'
import { DidarProvider } from '@/components/didar/store'
export const metadata = {
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
