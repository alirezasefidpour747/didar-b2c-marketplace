import { ProductDetail } from '@/components/didar/catalog'
import { publicProductLink } from '@/lib/didar-product-link'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Metadata } from 'next'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ path: string[] }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params
  const p = await publicProductLink('id', path[path.length - 1])
  return p
    ? { title: p.title }
    : { title: 'محصول در دسترس نیست', robots: { index: false, follow: false } }
}
export default async function Product({ params }: Props) {
  const { path } = await params
  const p = await publicProductLink('id', path[path.length - 1])
  if (!p) notFound()
  if (
    '/products/' + path.map(encodeURIComponent).join('/') !==
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
