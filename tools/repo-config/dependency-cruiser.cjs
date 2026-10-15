// dependency-cruiser is the repository's one dependency graph (RFC-0002). `pnpm run lint:deps` and the clean loop read
// the same run through tools/ts-checks/src/deps; member and group cycles are computed there from this graph.
// Structural guards fail for dev tools and product sources alike.
//
// Direction rules project docs/package-organization.md and docs/architecture/layers-and-dependencies.md onto member
// paths. Rules that need a role the repository does not record yet (a contract must not depend on its provider; a
// provider is reached through the contract it implements) are not expressed; see docs/package-organization.md.
const PACKAGES = '^packages/'
const SDK = '^packages/access/sdk/'
const SERVER_ENTRY = '^packages/access/server-entry/'
const PUBLIC_CONTRACT = '^packages/access/public-contract/'
const ASSEMBLY = '^packages/assembly/assembly/'
const SHARED = '^packages/(common|util)/'
const ORGANIZATION = 'docs/package-organization.md'
const LAYERS = 'docs/architecture/layers-and-dependencies.md#依赖关系与禁止方向'

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
    {
      name: 'sdk-not-server',
      comment: `The SDK does not import server-side access or the assembly tree. ${ORGANIZATION}「SDK是客户端统一编程入口」; ${LAYERS}「SDK 与服务端实现解耦」`,
      severity: 'error',
      from: { path: SDK },
      to: { path: `${SERVER_ENTRY}|${ASSEMBLY}` },
    },
    {
      name: 'server-entry-not-sdk',
      comment: `server-entry calls capabilities through the shared contract and does not import the SDK. ${ORGANIZATION}「server-entry按共同契约调用能力公开接口」`,
      severity: 'error',
      from: { path: SERVER_ENTRY },
      to: { path: SDK },
    },
    {
      name: 'contract-not-endpoint',
      comment: `The public contract depends on neither client nor server implementation. ${LAYERS}「两端共用契约」`,
      severity: 'error',
      from: { path: PUBLIC_CONTRACT },
      to: { path: `^apps/|${SDK}|${SERVER_ENTRY}|${ASSEMBLY}` },
    },
    {
      name: 'capability-not-sdk',
      comment: `Business capabilities and runtime do not depend on the SDK. ${LAYERS}「业务含义不受协议支配」`,
      severity: 'error',
      from: { path: PACKAGES, pathNot: SDK },
      to: { path: SDK },
    },
    {
      name: 'capability-not-assembly',
      comment: `Only the assembly reads the assembly entry; members use kernel-basis instead. ${ORGANIZATION}「装配组有两个目标成员」; ${LAYERS}「装配负责选择实现」`,
      severity: 'error',
      from: { path: PACKAGES, pathNot: ASSEMBLY },
      to: { path: ASSEMBLY },
    },
    {
      name: 'shared-stays-pure',
      comment: `Shared pure definitions (common, util) do not depend on domain members. ${ORGANIZATION}「共同纯定义不依赖领域状态和提供者」`,
      severity: 'error',
      from: { path: SHARED },
      to: { path: PACKAGES, pathNot: SHARED },
    },
    {
      name: 'product-not-outward',
      comment: `Product packages depend on neither applications nor development tools. ${LAYERS}; tools/AGENTS.md「产品包不因此依赖工具」`,
      severity: 'error',
      from: { path: PACKAGES },
      to: { path: '^(apps|tools)/' },
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
