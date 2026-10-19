import assert from 'node:assert/strict';
import { createServer } from 'node:net';

// Reserve distinct available fixture ports together. Docker binds them only to
// loopback; if another process wins the subsequent bind, creation fails closed.
export async function reserveLoopbackPorts() {
  const servers = [];
  try {
    for (let i = 0; i < 2; i++) {
      const server = createServer(); servers.push(server);
      await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
    }
    return servers.map(server => server.address().port);
  } finally {
    await Promise.all(servers.filter(server => server.listening).map(server => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()))));
  }
}
export function assertLoopbackMappings(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), 'Only reviewed fixture listeners may be present');
  for (const [port, hostPort] of Object.entries(expected)) {
    assert.deepEqual(actual[port], [{ HostIp: '127.0.0.1', HostPort: String(hostPort) }], 'Fixture listener changed: ' + port);
  }
}
