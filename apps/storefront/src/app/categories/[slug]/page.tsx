import { Catalog } from '@/components/didar/catalog'
export default async function Category({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <Catalog categorySlug={decodeURIComponent(slug)} />
}
