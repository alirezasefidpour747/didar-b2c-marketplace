import { cache } from 'react'
import type { Metadata } from 'next'
// Read-only public publication lookup. No merchant cookie or financial context is minted.
export const readPublishedContent = cache(
  async (kind: string, routeKey = '', handle = '') => {
    try {
      const url = new URL(
        '/didar/pages',
        process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000',
      )
      url.searchParams.set('kind', kind)
      url.searchParams.set('route_key', routeKey)
      if (handle) url.searchParams.set('handle', handle)
      const r = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })
      return r.ok ? await r.json() : null
    } catch {
      return null
    }
  },
)
export function publishedContentMetadata(
  data: any,
  canonical: string,
  handle = '',
): Metadata {
  if (!data) return {}
  const first: any = Object.values(data.assets || {})[0]
  return {
    title: data.page.title,
    alternates: { canonical },
    openGraph: {
      title: data.page.title,
      url: canonical,
      images: first
        ? [
            {
              url:
                first.url +
                '&variant=medium' +
                (handle ? '&preview_store=' + encodeURIComponent(handle) : ''),
              alt: first.alt,
            },
          ]
        : [],
    },
  }
}
