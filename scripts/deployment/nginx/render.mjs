// Render an isolated/candidate config from explicit, non-secret discovery values.
// This does not inspect, reload or modify any host's Nginx installation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { isIP } from 'node:net'

const names = ['NJS_MODULE_FILE', 'PID_FILE', 'SIGNER_DIRECTORY', 'RELAY_ADDRESS', 'LISTEN_ADDRESS', 'PUBLIC_HOST', 'PUBLIC_PORT', 'TLS_CERT_FILE', 'TLS_KEY_FILE', 'UPSTREAM_CA_FILE', 'RELAY_TLS_NAME']
const paths = ['NJS_MODULE_FILE', 'PID_FILE', 'SIGNER_DIRECTORY', 'TLS_CERT_FILE', 'TLS_KEY_FILE', 'UPSTREAM_CA_FILE']
const hostname = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))
function socket(value) {
  if (typeof value !== 'string') return false
  const match = value.match(/^(?:\[([0-9a-fA-F:]+)\]|([0-9.]+)):([0-9]+)$/)
  if (!match || !isIP(match[1] || match[2])) return false
  return Number(match[3]) > 0 && Number(match[3]) <= 65535
}

export function validate(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).sort().join(',') !== [...names].sort().join(',')) throw Error('EXPLICIT_DISCOVERY_FIELDS_REQUIRED')
  if (Object.values(values).some(value => typeof value !== 'string' || /[\r\n\x00]/.test(value))) throw Error('INVALID_DISCOVERY_VALUES')
  for (const name of paths) if (!/^\/[A-Za-z0-9_./-]+$/.test(values[name]) || values[name].split('/').includes('..')) throw Error('INVALID_ABSOLUTE_PATH:' + name)
  if (!hostname(values.PUBLIC_HOST) || !hostname(values.RELAY_TLS_NAME)) throw Error('INVALID_HOSTNAME')
  if (!socket(values.RELAY_ADDRESS) || !socket(values.LISTEN_ADDRESS)) throw Error('OBSERVED_IP_PORT_REQUIRED')
  if (!/^[0-9]+$/.test(values.PUBLIC_PORT) || Number(values.PUBLIC_PORT) < 1 || Number(values.PUBLIC_PORT) > 65535) throw Error('INVALID_PUBLIC_PORT')
  return values
}

export function render(values, output) {
  validate(values)
  const directory = resolve(output)
  if (!/^\/[A-Za-z0-9_./-]+$/.test(directory)) throw Error('INVALID_OUTPUT_PATH')
  const settings = { ...values, PROXY_HEADERS_FILE: directory + '/proxy-headers.conf' }
  const replace = source => source.replace(/__([A-Z_]+)__/g, (_, name) => {
    if (!(name in settings)) throw Error('UNRESOLVED_TEMPLATE_FIELD:' + name)
    return settings[name]
  })
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  for (const [source, destination] of [['nginx.conf.template', 'nginx.conf'], ['proxy-headers.conf', 'proxy-headers.conf']]) {
    writeFileSync(resolve(directory, destination), replace(readFileSync(new URL(source, import.meta.url), 'utf8')), { mode: 0o600, flag: 'wx' })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  if (process.argv.length !== 4) throw Error('Usage: node render.mjs <non-secret-discovery.json> <new-output-directory>')
  render(JSON.parse(readFileSync(process.argv[2], 'utf8')), process.argv[3])
}
