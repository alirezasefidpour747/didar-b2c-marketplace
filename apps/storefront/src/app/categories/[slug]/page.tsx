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
    await readPublishedContent('CATEGORY_LANDING', slug),
    '/categories/' + encodeURIComponent(slug),
  )
}
export default async function Category({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <ContentPage
      kind="CATEGORY_LANDING"
      routeKey={decodeURIComponent(slug)}
      initialData={await readPublishedContent(
        'CATEGORY_LANDING',
        decodeURIComponent(slug),
      )}
    >
      <Catalog categorySlug={decodeURIComponent(slug)} />
    </ContentPage>
  )
}
