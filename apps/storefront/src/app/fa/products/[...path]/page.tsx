import { ProductDetail } from '@/components/didar/catalog'
import { publicProductLink } from '@/lib/didar-product-link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ path: string[] }> }
async function resolve(params: Props['params']) {
  const { path } = await params
  const key = path.at(-1)?.match(/-([a-f0-9]{32})$/)?.[1]
  return { path, p: key ? await publicProductLink('key', key) : null }
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { p } = await resolve(params)
  return p
    ? { title: p.title }
    : { title: 'محصول در دسترس نیست', robots: { index: false, follow: false } }
}
export default async function Product({ params }: Props) {
  const { p, path } = await resolve(params)
  if (!p) notFound()
  if (
    '/fa/products/' + path.map(encodeURIComponent).join('/') !==
    p.canonical_path
  )
    permanentRedirect(p.canonical_path)
  return (
    <>
      <link rel="canonical" href={p.canonical_path} />
      <ProductDetail id={p.id} />
    </>
  )
}
