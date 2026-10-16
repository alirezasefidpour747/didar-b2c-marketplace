import { MerchantStore } from '@/components/didar/merchant-store'
import type { Metadata } from 'next'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ handle: string; path?: string[] }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, path = [] } = await params
  try {
    const url = new URL(
      '/didar/storefront',
      process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000',
    )
    url.searchParams.set('handle', handle)
    if (path[0] === 'products' && path[1])
      url.searchParams.set('product_key', path[1])
    if (path[0] === 'c' && path[1]) url.searchParams.set('share_slug', path[1])
    const r = await fetch(url, { cache: 'no-store' })
    if (!r.ok) throw new Error('private')
    const { store, preview } = await r.json()
    const canonical =
      '/m/' +
      handle +
      (path.length ? '/' + path.map(encodeURIComponent).join('/') : '')
    return {
      title: preview?.title || store.name,
      description: preview?.description || store.intro,
      alternates: { canonical },
      openGraph: {
        title: preview?.title || store.name,
        description: preview?.description || store.intro,
        url: canonical,
        images: preview?.image_url
          ? [{ url: preview.image_url, alt: preview.title }]
          : store.logo_url
            ? [
                {
                  url:
                    store.logo_url +
                    '&preview_store=' +
                    encodeURIComponent(handle),
                  alt: store.name,
                },
              ]
            : [],
      },
      robots: {
        index: store.visibility === 'PUBLIC_MARKETPLACE',
        follow: store.visibility === 'PUBLIC_MARKETPLACE',
      },
    }
  } catch {
    return { title: 'فروشگاه دیدار', robots: { index: false, follow: false } }
  }
}
export default async function Page({ params }: Props) {
  const { path = [] } = await params
  return <MerchantStore segments={path} />
}
