import { NextRequest, NextResponse } from 'next/server'
const allowed = new Set([
  'storefront',
  'sharing',
  'catalog',
  'quote',
  'merchant-pricing',
  'classification',
  'labels',
  'product-link',
  'finance',
  'treasury',
  'wallet',
  'ledger',
  'tahesab',
  'acceptance',
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
  'intake',
  'inventory',
  'rfid',
  'returns',
  'permissions',
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
  const context = req.cookies.get('didar-store-context')?.value
  if (context) headers['x-didar-context'] = context
  const visit = req.cookies.get('didar-share-visit')?.value
  if (visit) headers['x-didar-visit'] = visit
  const expected = req.headers.get('x-didar-store')
  if (expected) headers['x-didar-store'] = expected
  if (auth) headers.authorization = auth
  if (req.method === 'POST' && ['storefront', 'sharing'].includes(action)) {
    const origin = req.headers.get('origin')
    if (origin && new URL(origin).host !== req.headers.get('host'))
      return NextResponse.json({ message: 'FORBIDDEN' }, { status: 403 })
  }
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
    if (
      ['catalog', 'classification', 'storefront', 'sharing'].includes(action)
    ) {
      if (req.nextUrl.search.length > 6000)
        return NextResponse.json({ message: 'INVALID_FILTER' }, { status: 400 })
      for (const [key, value] of req.nextUrl.searchParams) {
        if (url.searchParams.has(key))
          return NextResponse.json(
            { message: 'INVALID_FILTER' },
            { status: 400 },
          )
        url.searchParams.set(key, value)
      }
    }
    if (action === 'image') {
      const id = req.nextUrl.searchParams.get('id')
      if (!id || !/^[-\w]{1,120}$/.test(id))
        return NextResponse.json({ message: 'NOT_FOUND' }, { status: 404 })
      url.searchParams.set('id', id)
    }
    if (action === 'product-link') {
      for (const key of ['id', 'uid', 'key']) {
        const value = req.nextUrl.searchParams.get(key)
        if (value && value.length <= 100) url.searchParams.set(key, value)
      }
    }
    if (['intake', 'inventory', 'rfid'].includes(action))
      for (const key of ['id', 'search']) {
        const value = req.nextUrl.searchParams.get(key)
        if (value && value.length <= 250) url.searchParams.set(key, value)
      }
    const response = await fetch(url, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    })
    const bytes = await response.arrayBuffer()
    let payload: any
    if (
      ['storefront', 'sharing'].includes(action) &&
      req.method === 'POST' &&
      response.ok
    ) {
      payload = JSON.parse(new TextDecoder().decode(bytes))
    }
    const contextToken = payload?.context_token
    const visitToken = payload?.visit_token
    if (payload) {
      delete payload.context_token
      delete payload.visit_token
    }
    const result = new NextResponse(payload ? JSON.stringify(payload) : bytes, {
      status: response.status,
      headers: {
        'content-type':
          response.headers.get('content-type') || 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    })
    if (contextToken)
      result.cookies.set('didar-store-context', contextToken, {
        httpOnly: true,
        secure: req.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 86400,
      })
    if (visitToken)
      result.cookies.set('didar-share-visit', visitToken, {
        httpOnly: true,
        secure: req.nextUrl.protocol === 'https:',
        sameSite: 'lax',
        path: '/',
        maxAge: 604800,
      })
    if (payload?.left) {
      result.cookies.set('didar-share-visit', '', {
        httpOnly: true,
        path: '/',
        maxAge: 0,
      })
    }
    if (payload?.left)
      result.cookies.set('didar-store-context', '', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
    return result
  } catch {
    return NextResponse.json(
      { message: 'BACKEND_UNAVAILABLE' },
      { status: 503 },
    )
  }
}
export const GET = proxy
export const POST = proxy
