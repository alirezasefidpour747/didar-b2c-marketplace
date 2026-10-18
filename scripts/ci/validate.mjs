// Reuse the existing isolated harness; no staging credentials or persistent data.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const evidence = resolve('.local/ci-evidence');
mkdirSync(evidence, { recursive: true });
const stages = [];
const run = (name, command, args) => {
  const child = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  stages.push({ name, command, args, code: child.status, signal: child.signal, spawn_error: child.error?.code || null });
  writeFileSync(resolve(evidence, 'validation.json'), JSON.stringify({ source_sha: process.env.GITHUB_SHA || null, status: 'IN_PROGRESS', fresh: stages, inherited: [] }, null, 2));
  if (child.status !== 0 || child.signal || child.error) throw Error(`${name} failed; observed exit ${child.status}, signal ${child.signal}`);
};
let status = 'FAIL';
try {
  if (!process.versions.node.startsWith('24.')) throw Error('Node.js 24 required');
  run('automation-contracts', 'node', ['--test', 'tests/ci-release.test.mjs']);
  run('tooling', 'bun', ['test', './tests/local-workflow.test.ts']);
  run('lint', 'bun', ['run', 'lint']);
  run('codegen', 'bun', ['run', '--cwd', 'packages/api', 'codegen']);
  run('api-types', 'bun', ['x', 'tsc', '--noEmit', '-p', 'packages/api/tsconfig.json']);
  run('storefront-types', 'bun', ['x', 'tsc', '--noEmit', '-p', 'apps/storefront/tsconfig.json']);
  // Panel production builds already run tsc -b; no fictitious root check-types success.
  run('production-builds-backend-http-native-browser', 'bun', ['run', 'local:test']);
  run('fresh-no-demo-bootstrap', 'bun', ['run', 'local:test', '--reuse-build', '--no-demo-install-only']);
  status = 'PASS';
} finally {
  writeFileSync(resolve(evidence, 'validation.json'), JSON.stringify({ source_sha: process.env.DIDAR_RELEASE_SOURCE || process.env.GITHUB_SHA || null, status, fresh: stages, inherited: [], limits: ['Isolated Linux CI, not owner staging, public TLS or production readiness'] }, null, 2) + '\n');
}
