import test from 'node:test'
import assert from 'node:assert/strict'
import { ESLint } from 'eslint'
import { resolve } from 'node:path'

// Real panel configs and non-test TSX paths: react-refresh intentionally skips *.test.*.
for (const panel of ['admin', 'vendor']) {
  const cwd = resolve(`apps/${panel}`)
  const eslint = new ESLint({ cwd })
  const lint = async (path, source) => (await eslint.lintText(source, { filePath: resolve(cwd, path) }))[0].messages
  const component = 'export default function Page() { return <div /> }'
  const fields = `import { defineCustomFieldsConfig } from '@mercurjs/dashboard-sdk';
function GoldRecord() { return <div /> }
export default defineCustomFieldsConfig({ model: 'product', displays: [{ zone: 'general', fields: [{ id: 'gold', component: GoldRecord }] }] });`
  const refreshErrors = messages => messages.filter(m => m.ruleId?.endsWith('/only-export-components'))

  test(`${panel}: canonical Fast Refresh stays error-level with path-scoped options`, async () => {
    for (const path of ['src/components/lint-probe.tsx', 'src/routes/lint-probe/helper.tsx', 'src/routes/lint-probe/page.tsx', 'src/widgets/lint-probe.tsx', 'src/custom-fields/lint-probe.tsx']) {
      const rule = (await eslint.calculateConfigForFile(resolve(cwd, path))).rules['react-refresh/only-export-components']
      assert.equal(rule[0], 2, path)
      assert.equal(rule[1].allowConstantExport, true)
      assert.equal(rule[1].allowMercurCustomFields === true, path.startsWith('src/custom-fields/'))
      assert.deepEqual(rule[1].allowExportNames || [], path.endsWith('/page.tsx') ? ['config', 'handle'] : path.startsWith('src/widgets/') ? ['config'] : [])
    }
  })
  test(`${panel}: documented route config and handle coexist with the component`, async () => {
    assert.deepEqual(await lint('src/routes/lint-probe/page.tsx', `${component}\nexport const config = { label: 'Gold' }; export const handle = { breadcrumb: () => 'Gold' };`), [])
  })
  test(`${panel}: documented widget configuration coexists with the component`, async () => {
    assert.deepEqual(await lint('src/widgets/lint-probe.tsx', `import { defineWidgetConfig } from '@mercurjs/dashboard-sdk';\n${component}\nexport const config = defineWidgetConfig({ zone: 'products.list.before' });`), [])
  })
  test(`${panel}: documented custom-fields factory may contain local components`, async () => {
    assert.deepEqual(await lint('src/custom-fields/lint-probe.tsx', fields), [])
  })
  test(`${panel}: the actual SDK factory can use a named import alias`, async () => {
    assert.deepEqual(await lint('src/custom-fields/lint-probe.tsx', fields.replaceAll('defineCustomFieldsConfig', 'makeFields').replace('{ makeFields }', '{ defineCustomFieldsConfig as makeFields }')), [])
  })
  for (const [label, path, source] of [
    ['route-only export names do not leak into ordinary components', 'src/components/lint-probe.tsx', `${component}\nexport const config = {}; export const handle = {};`],
    ['route helpers are not route entrypoints', 'src/routes/lint-probe/helper.tsx', `${component}\nexport const config = {};`],
    ['unexpected route exports remain errors', 'src/routes/lint-probe/page.tsx', `${component}\nexport const unexpected = {};`],
    ['widget handle is not an allowed config export', 'src/widgets/lint-probe.tsx', `${component}\nexport const handle = {};`],
    ['unexpected custom-fields exports remain errors', 'src/custom-fields/lint-probe.tsx', `${fields}\nexport const unexpected = {};`],
    ['unexpected custom-fields helper functions remain errors', 'src/custom-fields/lint-probe.tsx', `${fields}\nexport function unexpectedHelper() { return {} }`],
    ['wildcard custom-fields exports remain errors', 'src/custom-fields/lint-probe.tsx', `${fields}\nexport * from './other';`],
    ['a similarly named local function is not the SDK contract', 'src/custom-fields/lint-probe.tsx', fields.replace("import { defineCustomFieldsConfig } from '@mercurjs/dashboard-sdk';", 'function defineCustomFieldsConfig(value: object) { return value }')],
    ['a factory from another module is not the SDK contract', 'src/custom-fields/lint-probe.tsx', fields.replace('@mercurjs/dashboard-sdk', 'unrelated-sdk')],
    ['a type-only import is not a runtime SDK wrapper', 'src/custom-fields/lint-probe.tsx', fields.replace('import { defineCustomFieldsConfig }', 'import type { defineCustomFieldsConfig }')],
    ['an inline type-only import is not a runtime SDK wrapper', 'src/custom-fields/lint-probe.tsx', fields.replace('import { defineCustomFieldsConfig }', 'import { type defineCustomFieldsConfig }')],
    ['an unsupported namespace call stays on the upstream path', 'src/custom-fields/lint-probe.tsx', fields.replace('import { defineCustomFieldsConfig }', 'import * as SDK').replace('export default defineCustomFieldsConfig(', 'export default SDK.defineCustomFieldsConfig(')],
    ['the SDK exception does not apply outside custom-fields', 'src/components/lint-probe.tsx', fields],
  ]) test(`${panel}: ${label}`, async () => {
    const errors = refreshErrors(await lint(path, source))
    assert.ok(errors.length > 0, `${path}: invalid export was silently accepted`)
    assert.ok(errors.every(m => m.severity === 2))
  })
  test(`${panel}: other recommended lint rules still run inside custom-fields`, async () => {
    const messages = await lint('src/custom-fields/lint-probe.tsx', `${fields}\nexport type Unrelated = any;`)
    assert.ok(messages.some(m => m.ruleId === '@typescript-eslint/no-explicit-any' && m.severity === 2))
  })
}
