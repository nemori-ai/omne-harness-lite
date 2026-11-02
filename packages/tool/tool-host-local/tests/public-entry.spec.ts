import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  describeImport,
  memberPath,
  specifiersOf,
  walkModules,
  type ModuleKind,
} from './module-graph.ts'

it('root entry exports the local start coordinator (G5), the host clock (G4), the registry and Catalog (G7), the absent ports and the guard factories (TL-11)', async () => {
  const root = (await import('@omne-harness/tool-host-local')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'INVOCATION_SOURCE_DOMAIN_KEY',
    'PROGRAMMATIC_NOT_IN_M2',
    'START_COORDINATOR_DOMAIN_KEY',
    'START_COORDINATOR_OWNER',
    'createAbsentToolPorts',
    'createLocalGrantVerifiers',
    'createLocalInvocationSource',
    'createLocalOperationIdentities',
    'createLocalScheduledEnvironment',
    'createLocalStartCoordinator',
    'createLocalStartGuard',
    'createLocalTextResults',
    'createLocalToolBindingRegistry',
    'createLocalToolCatalog',
    'createLocalToolClock',
    'createLocalToolCredentials',
    'createLocalToolLedgerGuards',
    'localArgumentLimits',
    'startCoordinatorAdoption',
  ])
})

/** A root graph must not reach Cordis or the Cordis entry of any package, this one included. */
function forbiddenFromRoot(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    /(^|\/)cordis(\.d)?\.(ts|js)$/u.test(specifier)
  )
}

describe('root entry has no Cordis', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/index.ts'],
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    const forbidden = graph.imports.filter(edge => forbiddenFromRoot(edge.specifier))
    expect(forbidden.map(describeImport)).toEqual([])
    for (const file of graph.files) expect(file).not.toMatch(/[/\\]cordis(\.d)?\.(ts|js)$/u)
  })

  it('sees every import form that can load a module', () => {
    // A guard for the walker itself: a walker that misses one of these forms would pass the
    // checks above while the root still loaded Cordis.
    const text = [
      "import '@deepseek-ai/cordis'",
      "export * from './cordis.js'",
      "const d = await import('@omne-harness/tool-cordis-contract/cordis')",
    ].join('\n')
    expect(specifiersOf(text).filter(forbiddenFromRoot)).toEqual([
      '@deepseek-ai/cordis',
      './cordis.js',
      '@omne-harness/tool-cordis-contract/cordis',
    ])
  })
})

/** A testing entry of any package, or a Cordis entry: neither belongs to a production source. */
function forbiddenInSource(specifier: string): boolean {
  return forbiddenFromRoot(specifier) || /(^|\/)testing(\.d)?(\.ts|\.js)?$/u.test(specifier)
}

describe('production sources import no testing entry', () => {
  const sources = readdirSync(memberPath('src')).filter(file => file.endsWith('.ts'))

  it('has sources to check', () => {
    expect(sources.length).toBeGreaterThan(0)
  })

  it.each(sources)('src/%s imports no testing entry and no Cordis', file => {
    const text = readFileSync(memberPath(`src/${file}`), 'utf8')
    expect(specifiersOf(text).filter(forbiddenInSource)).toEqual([])
  })

  it('sees a testing entry in every form of import that the walker reads', () => {
    const text = [
      "import { x } from '@omne-harness/tool/testing'",
      "export * from '@omne-harness/tool-contract/testing'",
      "const d = await import('./testing.ts')",
    ].join('\n')
    expect(specifiersOf(text).filter(forbiddenInSource)).toEqual([
      '@omne-harness/tool/testing',
      '@omne-harness/tool-contract/testing',
      './testing.ts',
    ])
  })
})
