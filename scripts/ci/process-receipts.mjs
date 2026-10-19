// Actual finite child outcomes only. Never persist command arguments, URLs or env values.
import { appendFileSync, mkdirSync, lstatSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const receiptPath = resolve(import.meta.dirname, '../../.local/ci-evidence/subprocess-exits.jsonl')
export const requiredStages = Object.freeze(['build-admin', 'build-vendor', 'build-api', 'build-storefront', 'backend-regressions', 'native-http', 'browser-login-window', 'browser-32'])
const allowedStages = new Set(requiredStages)
const keys = ['format', 'stage', 'source_sha', 'observer', 'code', 'signal', 'spawn_error', 'started_at', 'closed_at'].sort()
const sha = /^[a-f0-9]{40}$/
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value))
const code = value => Number.isInteger(value) || value === null
const signal = value => value === null || typeof value === 'string' && /^SIG[A-Z0-9]{1,16}$/.test(value)
const errorCode = error => error ? typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code) ? error.code : 'SPAWN_ERROR' : null
const invalid = code => { throw Error(code) }

export function recordProcessClose(stage, result, { environment = process.env, path = receiptPath, started_at = new Date().toISOString(), observer = 'close' } = {}) {
  // Unlabelled commands and ordinary local tooling never pollute CI acceptance.
  if (stage === undefined || stage === null) return null
  if (!allowedStages.has(stage)) invalid('UNKNOWN_PROCESS_RECEIPT_STAGE')
  if (environment.CI !== 'true' && environment.GITHUB_ACTIONS !== 'true' && environment.DIDAR_PROCESS_EVIDENCE !== 'true') return null
  const source_sha = environment.DIDAR_RELEASE_SOURCE || environment.GITHUB_SHA
  if (!sha.test(source_sha || '')) invalid('PROCESS_RECEIPT_SOURCE_REQUIRED')
  if (!iso(started_at) || !['close', 'spawnSync'].includes(observer) || !code(result.code) || !signal(result.signal)) invalid('INVALID_ACTUAL_PROCESS_OUTCOME')
  const record = { format: 1, stage, source_sha, observer, code: result.code, signal: result.signal, spawn_error: errorCode(result.error), started_at, closed_at: new Date().toISOString() }
  if (Date.parse(record.started_at) > Date.parse(record.closed_at)) invalid('INVALID_PROCESS_RECEIPT_TIME')
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const parent = lstatSync(directory)
  if (!parent.isDirectory() || parent.isSymbolicLink()) invalid('UNSAFE_PROCESS_RECEIPT_DIRECTORY')
  try { const existing = lstatSync(path); if (!existing.isFile() || existing.isSymbolicLink()) invalid('UNSAFE_PROCESS_RECEIPT_FILE') } catch (error) { if (error.code !== 'ENOENT') throw error }
  // One append per small record; concurrent panel/group processes do not rewrite history.
  appendFileSync(path, JSON.stringify(record) + '\n', { mode: 0o600, flag: 'a' })
  return record
}

export function observeProcessClose(child, stage, options = {}) {
  let error = null
  // Spawn error is followed by close; do not manufacture a successful/null exit.
  child.once('error', value => { error = value })
  return new Promise((done, reject) => child.once('close', (code, signal) => {
    try {
      const result = { code, signal, error }
      recordProcessClose(stage, result, options)
      done(result)
    } catch (failure) { reject(failure) }
  }))
}

export function validateRecordedStages(receipts, sourceSHA) {
  if (!sha.test(sourceSHA || '') || !Array.isArray(receipts)) invalid('INVALID_PROCESS_RECEIPT_SELECTION')
  const selected = new Map()
  for (const receipt of receipts) {
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || Object.keys(receipt).sort().join(',') !== keys.join(',')) invalid('INVALID_PROCESS_RECEIPT_FIELDS')
    if (receipt.format !== 1 || !allowedStages.has(receipt.stage) || !['close', 'spawnSync'].includes(receipt.observer) || !code(receipt.code) || !signal(receipt.signal) || receipt.spawn_error !== null && (typeof receipt.spawn_error !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(receipt.spawn_error)) || !iso(receipt.started_at) || !iso(receipt.closed_at) || Date.parse(receipt.started_at) > Date.parse(receipt.closed_at)) invalid('INVALID_PROCESS_RECEIPT_RECORD')
    if (receipt.source_sha !== sourceSHA) invalid('STALE_PROCESS_RECEIPT_SOURCE')
    if (selected.has(receipt.stage)) invalid('DUPLICATE_PROCESS_RECEIPT_STAGE')
    if (receipt.code !== 0 || receipt.signal !== null || receipt.spawn_error !== null) invalid('FAILED_PROCESS_RECEIPT_STAGE:' + receipt.stage)
    selected.set(receipt.stage, receipt)
  }
  for (const stage of requiredStages) if (!selected.has(stage)) invalid('MISSING_PROCESS_RECEIPT_STAGE:' + stage)
  return { status: 'PASS', source_sha: sourceSHA, stages: requiredStages.map(stage => selected.get(stage)) }
}
