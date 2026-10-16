import {
  readPublishedContent,
  publishedContentMetadata,
} from '@/lib/didar-content'
import { ContentPage } from '@/components/didar/content-page'
import { Catalog } from '@/components/didar/catalog'
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return publishedContentMetadata(
    await readPublishedContent('COLLECTION_LANDING', slug),
    '/collections/' + encodeURIComponent(slug),
  )
}
export default async function Collection({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <ContentPage
      kind="COLLECTION_LANDING"
      routeKey={decodeURIComponent(slug)}
      initialData={await readPublishedContent(
        'COLLECTION_LANDING',
        decodeURIComponent(slug),
      )}
    >
      <Catalog collectionSlug={decodeURIComponent(slug)} />
    </ContentPage>
  )
}
