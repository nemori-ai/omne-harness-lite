import { describe, expect, it } from 'vitest'
import {
  describeImport,
  memberPath,
  specifiersOf,
  walkModules,
  type ModuleKind,
} from './module-graph.ts'

it('draft public entries export nothing until the accepted contract replaces them', async () => {
  const root = (await import('@omne-harness/tool-host-local')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
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
      "const d = await import('@omne-harness/tool/cordis')",
    ].join('\n')
    expect(specifiersOf(text).filter(forbiddenFromRoot)).toEqual([
      '@deepseek-ai/cordis',
      './cordis.js',
      '@omne-harness/tool/cordis',
    ])
  })
})
