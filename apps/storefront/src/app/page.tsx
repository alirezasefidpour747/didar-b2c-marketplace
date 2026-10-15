'use client'
import Link from 'next/link'
import { Catalog, RateBar } from '@/components/didar/catalog'
export default function Home() {
  return (
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
            یک کاتالوگ، چند تأمین‌کننده. طلای ۱۸ عیار را با وزن دقیق و جزئیات
            روشن قیمت مقایسه کنید.
          </p>
          <Link href="/products" className="primary">
            کشف مجموعه دیدار ←
          </Link>
          <div className="trust">
            وزن دقیق تا میلی‌گرم <span>✦</span> فاکتور شفاف <span>✦</span> خرید
            از دیدار
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit" />
          <div className="jewel">✧</div>
          <span>دیدار / انتخابی ماندگار</span>
        </div>
      </section>
      <RateBar />
      <Catalog home />
    </>
  )
}
