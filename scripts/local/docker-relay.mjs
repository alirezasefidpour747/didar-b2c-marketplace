import { createServer } from 'node:net'
import { spawn } from 'node:child_process'

// Each host loopback TCP connection is carried through Docker's local exec stream.
// DNS resolution and the database connection happen INSIDE the existing API network.
// No database listener is published and no Docker bridge IP is inspected.
export const relayProgram = `
const net = require('node:net');
const socket = net.connect(Number(process.argv[2]), process.argv[1]);
process.stdin.pipe(socket); socket.pipe(process.stdout);
socket.on('error', () => process.exit(1));
process.stdin.on('end', () => socket.end());
`
export async function dockerDatabaseRelay(container, database, launch) {
  if (!/^[a-f0-9]{12,64}$/.test(container)) throw new Error('Invalid inspected container ID')
  const host = database.hostname, port = database.port || '5432'
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || !/^\d{1,5}$/.test(port)) throw new Error('Unsupported private database address')
  const streams = new Set()
  const server = createServer(socket => {
    const child = launch ? launch() : spawn('docker', ['exec', '-i', container, 'node', '-e', relayProgram, host, port], { stdio: ['pipe', 'pipe', 'ignore'] })
    const entry = { socket, child }; streams.add(entry)
    socket.pipe(child.stdin); child.stdout.pipe(socket)
    const close = () => { streams.delete(entry); socket.destroy(); child.kill() }
    socket.once('error', close); socket.once('close', close)
    child.once('error', close); child.once('exit', close)
    child.stdin.on('error', close); child.stdout.on('error', close)
  })
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    close: async () => {
      for (const { socket, child } of streams) { socket.destroy(); child.kill() }
      await new Promise(resolve => server.close(resolve))
    },
  }
}
