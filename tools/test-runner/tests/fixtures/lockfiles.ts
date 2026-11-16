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

export const OVERRIDES = edited(BASE, [
  [
    'catalogs:',
    `overrides:
  leaf: 1.0.0

catalogs:`,
  ],
])

export const UNPARSABLE = edited(BASE, [
  ['resolution: {integrity: sha512-mid1}', 'resolution: {integrity: sha512-mid1'],
])

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
