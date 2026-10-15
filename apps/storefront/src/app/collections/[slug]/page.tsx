import { Catalog } from '@/components/didar/catalog'
export default async function Collection({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <Catalog collectionSlug={decodeURIComponent(slug)} />
}
