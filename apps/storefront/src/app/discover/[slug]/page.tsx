import { Catalog } from '@/components/didar/catalog'
export default async function Discovery({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <Catalog key={slug} discoverySlug={slug} />
}
