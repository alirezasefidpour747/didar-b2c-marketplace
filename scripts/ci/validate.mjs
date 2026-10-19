// Reuse the existing isolated harness; no staging credentials or persistent data.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { receiptPath, validateRecordedStages } from './process-receipts.mjs';
const evidence = resolve('.local/ci-evidence');
mkdirSync(evidence, { recursive: true });
const stages = [];
let source = null, sourceResolution = null, subprocesses = { status: 'NOT_EXECUTED' };
const run = (name, command, args) => {
  const child = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  stages.push({ name, command, args, code: child.status, signal: child.signal, spawn_error: child.error?.code || null });
  writeFileSync(resolve(evidence, 'validation.json'), JSON.stringify({ source_sha: source, status: 'IN_PROGRESS', fresh: stages, inherited: [], subprocesses }, null, 2));
  if (child.status !== 0 || child.signal || child.error) throw Error(`${name} failed; observed exit ${child.status}, signal ${child.signal}`);
};
let status = 'FAIL';
try {
  if (!process.versions.node.startsWith('24.')) throw Error('Node.js 24 required');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  sourceResolution = { code: head.status, signal: head.signal, spawn_error: head.error?.code || null };
  if (head.status !== 0 || head.signal || head.error) throw Error('Could not observe exact CI source');
  const declaredSource = process.env.DIDAR_RELEASE_SOURCE || process.env.GITHUB_SHA || head.stdout.trim();
  if (!/^[a-f0-9]{40}$/.test(declaredSource) || declaredSource !== head.stdout.trim()) throw Error('Exact CI checkout/source mismatch');
  source = declaredSource;
  // Enable only the evidence writer for manual CI invocations too. Do not
  // change the application's CI/business environment or expose config values.
  process.env.DIDAR_RELEASE_SOURCE = source;
  process.env.DIDAR_PROCESS_EVIDENCE = 'true';
  try { const file = lstatSync(receiptPath); if (!file.isFile() || file.isSymbolicLink()) throw Error('Unsafe CI receipt file'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  writeFileSync(receiptPath, '', { mode: 0o600 }); // Only this run's fixed CI receipt.
  subprocesses = { status: 'IN_PROGRESS', source_sha: source };
  run('automation-contracts', 'node', ['--test', 'tests/ci-release.test.mjs', 'tests/topology-artifacts.test.mjs', 'tests/operator-bundle.test.mjs', 'tests/fresh-operator-bundle.test.mjs', 'tests/fresh-browser.test.mjs', 'tests/fresh-readback.test.mjs', 'tests/fresh-kit-export.test.mjs', 'tests/nginx-stack.test.mjs', 'tests/nginx-fresh.test.mjs', 'scripts/deployment/nginx/fresh-restore.test.mjs', 'tests/process-receipts.test.mjs', 'scripts/deployment/nginx/compat/compat.test.mjs']);
  run('native-sdk-lint-contracts', 'node', ['--test', 'tests/native-sdk-lint.test.mjs']);
  run('auth-relay-config-contracts', 'node', ['--test', 'tests/auth-network-relay.test.mjs']);
  run('nginx-signer-contracts', 'node', ['--test', 'scripts/deployment/nginx/sign.test.mjs']);
  run('tooling', 'bun', ['test', './tests/local-workflow.test.ts']);
  run('lint', 'bun', ['run', 'lint']);
  run('codegen', 'bun', ['run', '--cwd', 'packages/api', 'codegen']);
  run('api-types', 'bun', ['x', 'tsc', '--noEmit', '-p', 'packages/api/tsconfig.json']);
  run('storefront-types', 'bun', ['x', 'tsc', '--noEmit', '-p', 'apps/storefront/tsconfig.json']);
  run('focused-cms-media-ssr', 'node', ['scripts/ci/cms-media.mjs']);
  // Panel production builds already run tsc -b; no fictitious root check-types success.
  run('production-builds-backend-http-native-browser', 'bun', ['run', 'local:test']);
  run('fresh-no-demo-bootstrap', 'bun', ['run', 'local:test', '--reuse-build', '--no-demo-install-only']);
  const records = readFileSync(receiptPath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  subprocesses = validateRecordedStages(records, source);
  status = 'PASS';
} finally {
  if (status !== 'PASS' && subprocesses.status === 'IN_PROGRESS') subprocesses = { ...subprocesses, status: 'INCOMPLETE_OR_FAILED' };
  writeFileSync(resolve(evidence, 'subprocess-summary.json'), JSON.stringify(subprocesses, null, 2) + '\n');
  const result = { source_sha: source, status, source_resolution: sourceResolution, fresh: stages, subprocesses, inherited: [], limits: ['Isolated Linux CI, not owner staging, public TLS or production readiness'] };
  writeFileSync(resolve(evidence, 'validation.json'), JSON.stringify(result, null, 2) + '\n');
  // Keep the same actual child exits independently readable in durable job logs.
  console.log('DIDAR_CI_OBSERVED_RESULTS ' + JSON.stringify(result));
}
