import { NextRequest, NextResponse } from 'next/server'
const allowed = new Set([
  'catalog',
  'me',
  'login',
  'register',
  'logout',
  'checkout',
  'payment',
  'orders',
  'manage',
  'profile',
  'fulfillment',
  'image',
])
async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
) {
  const { action } = await ctx.params
  if (!allowed.has(action) || (action === 'image' && req.method !== 'GET'))
    return NextResponse.json({ message: 'NOT_FOUND' }, { status: 404 })
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers.authorization = auth
  try {
    let body: string | undefined
    if (req.method === 'POST') {
      const limit = 1_200_000
      const tooLarge = () =>
        NextResponse.json({ message: 'INVALID_UPLOAD_SIZE' }, { status: 413 })
      if (Number(req.headers.get('content-length') || 0) > limit)
        return tooLarge()
      const reader = req.body?.getReader()
      const chunks: Uint8Array[] = []
      let length = 0
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            length += value.byteLength
            if (length > limit) {
              await reader.cancel()
              return tooLarge()
            }
            chunks.push(value)
          }
        } finally {
          reader.releaseLock()
        }
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      body = new TextDecoder().decode(bytes)
    }
    const url = new URL(
      `/didar/${action}`,
      process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000',
    )
    if (action === 'image') {
      const id = req.nextUrl.searchParams.get('id')
      if (!id || !/^[-\w]{1,120}$/.test(id))
        return NextResponse.json({ message: 'NOT_FOUND' }, { status: 404 })
      url.searchParams.set('id', id)
    }
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        'content-type':
          response.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json(
      { message: 'BACKEND_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
export const GET = proxy
export const POST = proxy
