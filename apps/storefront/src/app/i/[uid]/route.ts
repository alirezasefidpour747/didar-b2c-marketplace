import { publicProductLink } from '@/lib/didar-product-link'
export const dynamic = 'force-dynamic'
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params
  try {
    const p = await publicProductLink('uid', uid)
    if (p)
      return new Response(null, {
        status: 307,
        headers: {
          Location: p.canonical_path,
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex',
        },
      })
    return new Response('این محصول در دسترس نیست', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    })
  } catch {
    return new Response('دریافت اطلاعات موقتاً ممکن نیست', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' },
    })
  }
}
