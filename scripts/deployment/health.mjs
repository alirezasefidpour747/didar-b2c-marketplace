// Transport/catalog readiness only; functional auth acceptance is a separate test.
import https from 'node:https'
const privatePort = Number(process.env.DIDAR_PRIVATE_NEXT_PORT || 3001)
const publicPort = Number(process.env.DIDAR_AUTH_INGRESS_PORT || 3000)
try {
  const r = await fetch(`http://127.0.0.1:${privatePort}/api/didar/catalog`, { signal: AbortSignal.timeout(5000) })
  const d = await r.json()
  if (!r.ok || !Array.isArray(d.products) || !d.rate) throw Error('private Next/catalog not ready')
  if (process.env.DIDAR_AUTH_INGRESS_TLS_CERT_FILE) {
    if (!process.env.DIDAR_AUTH_HEALTH_SERVER_NAME) throw Error('TLS health server name required')
    await new Promise((resolve, reject) => {
      const req = https.get({ hostname: '127.0.0.1', port: publicPort, servername: process.env.DIDAR_AUTH_HEALTH_SERVER_NAME, path: '/api/didar/catalog', timeout: 5000 }, r => {
        let bytes = ''; r.on('data', b => bytes += b); r.on('end', () => { try { const d = JSON.parse(bytes); if (r.statusCode !== 200 || !Array.isArray(d.products) || !d.rate) throw Error(); resolve() } catch { reject(Error('ingress catalog not ready')) } })
      }); req.on('error', reject); req.on('timeout', () => req.destroy(Error('ingress timeout')))
    })
  } else {
    const r = await fetch(`http://127.0.0.1:${publicPort}/api/didar/catalog`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw Error('ingress not ready')
  }
  console.log('DIDAR packaged storefront ready')
} catch { console.error('DIDAR packaged storefront not ready'); process.exitCode = 1 }
