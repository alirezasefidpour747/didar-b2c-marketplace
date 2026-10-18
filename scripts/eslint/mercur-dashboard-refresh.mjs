import reactRefresh from 'eslint-plugin-react-refresh'

const upstream = reactRefresh.rules['only-export-components']
const unwrap = node => ['TSAsExpression', 'TSSatisfiesExpression'].includes(node.type) ? unwrap(node.expression) : node

// Mercur 2.3.7 discovers default-exported configuration objects, not React HOCs.
// Upstream customHOCs only accepts component/function arguments, so it rejects
// defineCustomFieldsConfig({...}). Adapt that exact SDK export for classification
// only; upstream still checks every other export, without changing the parser AST.
const customFieldsRule = {
  ...upstream,
  meta: {
    ...upstream.meta,
    schema: [{
      ...upstream.meta.schema[0],
      properties: { ...upstream.meta.schema[0].properties, allowMercurCustomFields: { type: 'boolean' } },
    }],
  },
  create(context) {
    const visitor = upstream.create(context)
    if (!context.options[0]?.allowMercurCustomFields || !visitor.Program) return visitor
    return {
      Program(program) {
        const factories = new Set(program.body.flatMap(node =>
          node.type === 'ImportDeclaration' && node.importKind !== 'type' && node.source.value === '@mercurjs/dashboard-sdk'
            ? node.specifiers.filter(s => s.type === 'ImportSpecifier' && s.importKind !== 'type' && s.imported.name === 'defineCustomFieldsConfig').map(s => s.local.name)
            : []))
        const body = program.body.map(node => {
          if (node.type !== 'ExportDefaultDeclaration') return node
          const call = unwrap(node.declaration)
          if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || !factories.has(call.callee.name)
            || call.arguments.length !== 1 || unwrap(call.arguments[0]).type !== 'ObjectExpression') return node
          return { ...node, declaration: { ...call, type: 'Identifier', name: 'MercurCustomFieldsConfiguration' } }
        })
        visitor.Program({ ...program, body })
      },
    }
  },
}

// Register one consistent plugin object; preserve the canonical rule ID and
// original Vite behavior unless a scoped extension override opts into the SDK.
export const mercurViteRefresh = {
  ...reactRefresh.configs.vite,
  plugins: {
    'react-refresh': { ...reactRefresh, rules: { ...reactRefresh.rules, 'only-export-components': customFieldsRule } },
  },
}

export const mercurDashboardRefresh = [
  {
    files: ['src/routes/**/page.tsx'],
    rules: { 'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['config', 'handle'] }] },
  },
  {
    files: ['src/widgets/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['config'] }] },
  },
  {
    files: ['src/custom-fields/*.tsx'],
    rules: {
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowMercurCustomFields: true }],
    },
  },
]
