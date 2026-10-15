import './globals.css'
export const metadata = {
  title: 'دیدار گلد | بازار طلای تأمین‌کنندگان',
  description: 'خرید شفاف طلای ۱۸ عیار با وزن دقیق و مقایسه تأمین‌کنندگان',
}
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
