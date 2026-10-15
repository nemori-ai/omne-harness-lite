// dependency-cruiser: file-level cycles and the legacy exit guard (RFC-0002).
// These are structural guards, so they fail the run for dev tools and product sources alike. Group direction is not
// expressed yet: the new package groups have no registered layers.

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-legacy',
      comment: 'The legacy trees and the old @omne-harness-lite packages stay unreferenced.',
      severity: 'error',
      from: {},
      to: { path: '(^|/)(apps|packages)\\.0\\.0\\.1\\.legacy/|^@omne-harness-lite/' },
    },
    {
      name: 'no-unresolvable',
      comment:
        'Every import resolves. An alias this config cannot follow, for example one that reaches a legacy tree, fails here instead of escaping no-legacy.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-circular',
      comment: 'Runtime import cycles between files.',
      severity: 'error',
      from: {},
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
  ],
  options: {
    // Keep dist and installed packages as leaves: excluding them would drop the edges that point at them.
    doNotFollow: { path: ['node_modules', '(^|/)dist/', '\\.0\\.0\\.1\\.legacy/'] },
    exclude: { path: ['(^|/)tmp/', '(^|/)\\.worktrees/', '(^|/)coverage/'] },
    tsPreCompilationDeps: 'specify',
    tsConfig: { fileName: 'tsconfig.base.json' },
    // Same condition as typecheck: workspace imports resolve to member sources instead of dist.
    enhancedResolveOptions: {
      conditionNames: ['source', 'import', 'types', 'node', 'default'],
      exportsFields: ['exports'],
      mainFields: ['module', 'main', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
