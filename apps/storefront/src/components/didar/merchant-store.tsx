'use client'
import { CuratedPage } from './sharing'
import { Wallet } from './wallet'
import { Catalog, ProductDetail, RateBar, ImageAsset } from './catalog'
import { Login, Cart, Account, Orders } from './customer'
import { useDidar, ScopedLink as Link } from './store'
export function MerchantStore({ segments }: { segments: string[] }) {
  const { store, products, scopeReady } = useDidar()
  const [section, id] = segments
  if (section === 'login') return <Login />
  if (!scopeReady) return null
  if (section === 'c' && id) return <CuratedPage slug={id} />
  if (section === 'products' && id) {
    const p = products.find((p) => p.public_key === id || p.id === id)
    return p ? (
      <ProductDetail id={p.id} />
    ) : (
      <section className="empty">
        <h1>محصول در دسترس نیست</h1>
        <p>این محصول عرضه مجاز در این فروشگاه ندارد.</p>
      </section>
    )
  }
  if (section === 'login') return <Login />
  if (section === 'cart' || section === 'checkout')
    return <Cart checkoutOnly={section === 'checkout'} />
  if (section === 'account' && id === 'wallet') return <Wallet />
  if (section === 'account') return <Account />
  if (section === 'orders') return <Orders id={id} />
  if (section === 'products') return <Catalog />
  if (section === 'categories') return <Catalog categorySlug={id} />
  if (section === 'collections') return <Catalog collectionSlug={id} />
  if (section === 'discover') return <Catalog discoverySlug={id} />
  return (
    <>
      <section className="hero merchant-hero">
        <div>
          <p className="eyebrow">ویترین اختصاصی · با زیرساخت دیدار</p>
          {store?.logo_url && (
            <ImageAsset
              className="merchant-logo"
              src={store.logo_url}
              alt={store.name}
              privateImage={store.visibility === 'INVITE_ONLY'}
            />
          )}
          <h1>{store?.name}</h1>
          <p>{store?.intro}</p>
          <Link className="primary" href="/products">
            کشف محصولات این فروشگاه ←
          </Link>
          <p className="muted">{store?.contact}</p>
        </div>
        <div className="merchant-monogram" aria-hidden="true">
          {store?.name?.slice(0, 1)}
          <small>DIDAR SELECT</small>
        </div>
      </section>
      <RateBar />
      <Catalog home />
    </>
  )
}
