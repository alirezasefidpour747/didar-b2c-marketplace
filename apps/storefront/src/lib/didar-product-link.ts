import 'server-only'
export type PublicProductLink = {
  id: string
  title: string
  canonical_path: string
  breadcrumbs: { id: string; name: string; slug: string }[]
}
export async function publicProductLink(
  key: 'id' | 'uid' | 'key',
  value: string,
): Promise<PublicProductLink | null> {
  const url = new URL(
    '/didar/product-link',
    process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000',
  )
  url.searchParams.set(key, value)
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 404 || response.status === 400) return null
  if (!response.ok) throw new Error('BACKEND_UNAVAILABLE')
  return response.json()
}
