// lockfile-impact.spec.ts 的夹具：一份照 pnpm 9 写法手写的小锁文件，与它的几种差异。
// 成员 a 经 mid 间接依赖 leaf，b 直接依赖 leaf 并 link 到 shared，c 依赖带 peer 后缀的 other；根只依赖 tooling（走 catalog）。

/** 按顺序做替换，每一处都必须真的命中：没命中就是夹具写错了，不让它悄悄等于原文。 */
function edited(text: string, edits: readonly (readonly [from: string, to: string])[]): string {
  return edits.reduce((current, [from, to]) => {
    if (!current.includes(from)) throw new Error(`夹具里没有这一段：${from}`)
    return current.replace(from, to)
  }, text)
}

export const MEMBERS = ['packages/a', 'packages/b', 'packages/c', 'packages/shared'].map(path => ({
  path,
}))

export const BASE = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

catalogs:
  default:
    tooling:
      specifier: 1.0.0
      version: 1.0.0

importers:

  .:
    devDependencies:
      tooling:
        specifier: 'catalog:'
        version: 1.0.0

  packages/a:
    dependencies:
      mid:
        specifier: ^1.0.0
        version: 1.0.0

  packages/b:
    dependencies:
      '@scope/shared':
        specifier: workspace:*
        version: link:../shared
      leaf:
        specifier: ^1.0.0
        version: 1.0.0

  packages/c:
    dependencies:
      other:
        specifier: ^2.0.0
        version: 2.0.0(peer@3.0.0)
      peer:
        specifier: ^3.0.0
        version: 3.0.0

  packages/shared: {}

packages:

  leaf@1.0.0:
    resolution: {integrity: sha512-leaf1}
    engines: {node: '>=18'}

  mid@1.0.0:
    resolution: {integrity: sha512-mid1}

  other@2.0.0:
    resolution: {integrity: sha512-other2}
    peerDependencies:
      peer: '>=3'
    cpu: [x64]
    os: [linux]

  peer@3.0.0:
    resolution: {integrity: sha512-peer3}

  tooling@1.0.0:
    resolution: {integrity: sha512-tooling1}
    hasBin: true

snapshots:

  leaf@1.0.0: {}

  mid@1.0.0:
    dependencies:
      leaf: 1.0.0

  other@2.0.0(peer@3.0.0):
    dependencies:
      peer: 3.0.0
    transitivePeerDependencies:
      - supports-color

  peer@3.0.0: {}

  tooling@1.0.0: {}
`

/** 只改一个成员的依赖：c 加了 extra。 */
export const ONE_MEMBER_DEPENDENCY = edited(BASE, [
  [
    `      other:
        specifier: ^2.0.0`,
    `      extra:
        specifier: ^1.0.0
        version: 1.0.0
      other:
        specifier: ^2.0.0`,
  ],
  [
    `  leaf@1.0.0:
    resolution: {integrity: sha512-leaf1}`,
    `  extra@1.0.0:
    resolution: {integrity: sha512-extra1}

  leaf@1.0.0:
    resolution: {integrity: sha512-leaf1}`,
  ],
  [
    `  leaf@1.0.0: {}`,
    `  extra@1.0.0: {}

  leaf@1.0.0: {}`,
  ],
])

/** 只升级一个被两个成员依赖的包：leaf 1.0.0 → 1.1.0。b 直接依赖它，a 经 mid 隔一跳依赖它，c 不依赖。 */
export const SHARED_UPGRADE = edited(BASE, [
  [
    `      leaf:
        specifier: ^1.0.0
        version: 1.0.0`,
    `      leaf:
        specifier: ^1.0.0
        version: 1.1.0`,
  ],
  [
    `  leaf@1.0.0:
    resolution: {integrity: sha512-leaf1}`,
    `  leaf@1.1.0:
    resolution: {integrity: sha512-leaf11}`,
  ],
  ['  leaf@1.0.0: {}', '  leaf@1.1.0: {}'],
  [
    `    dependencies:
      leaf: 1.0.0`,
    `    dependencies:
      leaf: 1.1.0`,
  ],
])

/** 顶层 overrides 有变化。 */
export const OVERRIDES = edited(BASE, [
  [
    'catalogs:',
    `overrides:
  leaf: 1.0.0

catalogs:`,
  ],
])

/** 认不出的写法：流式映射没有闭合。 */
export const UNPARSABLE = edited(BASE, [
  ['resolution: {integrity: sha512-mid1}', 'resolution: {integrity: sha512-mid1'],
])

/** 与 BASE 等价：importer 顺序、空行与一个条目的键顺序不同。 */
export const EQUIVALENT = edited(BASE, [
  [
    `  packages/a:
    dependencies:
      mid:
        specifier: ^1.0.0
        version: 1.0.0

  packages/b:
    dependencies:
      '@scope/shared':
        specifier: workspace:*
        version: link:../shared
      leaf:
        specifier: ^1.0.0
        version: 1.0.0
`,
    `  packages/b:
    dependencies:
      leaf:
        specifier: ^1.0.0
        version: 1.0.0
      '@scope/shared':
        specifier: workspace:*
        version: link:../shared


  packages/a:
    dependencies:
      mid:
        version: 1.0.0
        specifier: ^1.0.0
`,
  ],
])

/** 根 importer 的依赖变了（tooling 1.0.0 → 1.0.1，catalog 段不动）。 */
export const ROOT_DEPENDENCY = edited(BASE, [
  [
    `        specifier: 'catalog:'
        version: 1.0.0`,
    `        specifier: 'catalog:'
        version: 1.0.1`,
  ],
  [
    `  tooling@1.0.0:
    resolution: {integrity: sha512-tooling1}`,
    `  tooling@1.0.1:
    resolution: {integrity: sha512-tooling101}`,
  ],
  ['  tooling@1.0.0: {}', '  tooling@1.0.1: {}'],
])

/**
 * 别名依赖（`npm:` 写法）：c 以 other-alias 的名字依赖 other，version 写的是 `other@2.0.0(peer@3.0.0)`，snapshot 键也是它。
 * 这是 pnpm 9 对别名的写法（本仓库的锁文件里没有别名，夹具按 pnpm 的写法手写）。
 */
export const ALIAS_DEPENDENCY = edited(BASE, [
  [
    `      other:
        specifier: ^2.0.0
        version: 2.0.0(peer@3.0.0)`,
    `      other:
        specifier: ^2.0.0
        version: 2.0.0(peer@3.0.0)
      other-alias:
        specifier: npm:other@^2.0.0
        version: other@2.0.0(peer@3.0.0)`,
  ],
])

/** 引用了 snapshots 里没有的版本：b 的 leaf 指向 1.2.0，但 snapshots 没有它。 */
export const DANGLING_REFERENCE = edited(BASE, [
  [
    `      leaf:
        specifier: ^1.0.0
        version: 1.0.0`,
    `      leaf:
        specifier: ^1.0.0
        version: 1.2.0`,
  ],
])
