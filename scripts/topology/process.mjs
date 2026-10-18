import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Record child close, including signal/spawn errors. Never derive exit status
// from a success-looking line. Input and command arguments can contain QA
// secrets and are deliberately absent from the persisted receipt.
export function observer(directory, stages = []) {
  let sequence = 0, persistence = Promise.resolve()
  return async function command(name, executable, args, { input, expected = [0], env = process.env, timeout = 180000 } = {}) {
    const ordinal = sequence++
    const started = new Date().toISOString()
    await mkdir(directory, { recursive: true })
    const result = await new Promise(resolve => {
      const child = spawn(executable, args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
      const stdout = [], stderr = []
      let error = null, timedOut = false
      child.stdout.on('data', value => stdout.push(value))
      child.stderr.on('data', value => stderr.push(value))
      child.on('error', value => { error = value.code || value.message })
      child.stdin.on('error', value => { if (value.code !== 'EPIPE') error = value.code || value.message })
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeout)
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        resolve({ code, signal, spawn_error: error, timed_out: timedOut, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
      })
      child.stdin.end(input)
    })
    const receipt = { ordinal, name, started, finished: new Date().toISOString(), code: result.code, signal: result.signal, spawn_error: result.spawn_error, timed_out: result.timed_out, expected_codes: expected, accepted: expected.includes(result.code) && !result.signal && !result.spawn_error && !result.timed_out }
    stages.push(receipt)
    const json = JSON.stringify(stages, null, 2) + '\n'
    persistence = persistence.then(() => writeFile(join(directory, 'process-exits.json'), json))
    await persistence
    if (!receipt.accepted) {
      const error = Error(`${name}: code=${result.code}, signal=${result.signal}, spawn_error=${result.spawn_error}`)
      error.stderr = result.stderr.toString('utf8')
      throw error
    }
    return result
  }
}
