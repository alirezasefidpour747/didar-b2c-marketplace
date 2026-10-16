import Home from '@/components/didar/home'
import {
  readPublishedContent,
  publishedContentMetadata,
} from '@/lib/didar-content'
export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  return publishedContentMetadata(await readPublishedContent('DIDAR_HOME'), '/')
}
export default async function Page() {
  return <Home initialData={await readPublishedContent('DIDAR_HOME')} />
}
