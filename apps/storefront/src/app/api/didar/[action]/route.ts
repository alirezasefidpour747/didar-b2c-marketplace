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
])
async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
) {
  const { action } = await ctx.params
  if (!allowed.has(action))
    return NextResponse.json({ message: 'NOT_FOUND' }, { status: 404 })
  // No arbitrary destination/path forwarding. Bearer session passed only to configured backend.
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const auth = req.headers.get('authorization')
  if (auth) headers.authorization = auth
  try {
    const response = await fetch(
      `${process.env.MEDUSA_BACKEND_URL || 'http://localhost:9000'}/didar/${action}`,
      {
        method: req.method,
        headers,
        body: req.method === 'POST' ? await req.text() : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      },
    )
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
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
