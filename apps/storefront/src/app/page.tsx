'use client'
import Link from 'next/link'
import { Catalog, RateBar, ProductImage } from '@/components/didar/catalog'
import { useDidar } from '@/components/didar/store'
export default function Home() {
  const { products } = useDidar(),
    featured = products.find((p) => p.images?.length)
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">DIDAR · طلای اصیل، انتخاب آگاهانه</p>
          <h1>
            برای لحظه‌هایی
            <br />
            که <em>ماندگار می‌شوند.</em>
          </h1>
          <p>
            انتخابی از طلای اصیل؛ با وزن دقیق، هویت روشن هر قطعه و جزئیات شفاف
            قیمت. زیبایی را با اطمینان انتخاب کنید.
          </p>
          <Link href="/products" className="primary">
            کشف مجموعه دیدار ←
          </Link>
          <div className="trust">
            وزن دقیق تا میلی‌گرم <span>✦</span> فاکتور شفاف <span>✦</span> خرید
            از دیدار
          </div>
        </div>
        <div className="editorial-media">
          {featured ? (
            <ProductImage product={featured} />
          ) : (
            <div className="editorial-seal" aria-label="هویت نوشتاری دیدار">
              دیدار<span>DIDAR · GOLD</span>
              <small>زیباییِ انتخاب آگاهانه</small>
            </div>
          )}
          <span className="editorial-caption">
            {featured ? featured.title : 'طلای اصیل · جزئیات ماندگار'}
          </span>
        </div>
      </section>
      <section className="editorial-intro">
        <div>
          <p className="eyebrow">انتخاب دیدار</p>
          <h2>زیبایی در جزئیات است.</h2>
        </div>
        <p>
          از زیورهای روزمره تا هدیه‌ای برای یک مناسبت خاص، انتخاب خود را با
          دسته‌بندی و ویژگی‌های تأییدشده پیدا کنید. قیمت هر عرضه از وزن واقعی و
          شرایط همان فروشنده محاسبه می‌شود.
        </p>
      </section>
      <RateBar />
      <Catalog home />
    </>
  )
}
