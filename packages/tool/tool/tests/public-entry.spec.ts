import { describe, expect, it } from 'vitest'
import * as tool from '@omne-harness/tool'
import {
  describeImport,
  memberPath,
  specifiersOf,
  walkModules,
  type ModuleKind,
} from './module-graph.ts'

it('exports the body port, the identity decoders and the default result policy identity', () => {
  expect(Object.keys(tool).sort()).toEqual([
    'TOOL_IDENTITY_MAX_LENGTH',
    'decodeToolCallId',
    'decodeToolCursor',
    'decodeToolDeliveryId',
    'decodeToolInstanceId',
    'decodeToolOperationId',
    'decodeToolResultVersion',
    'decodeToolRevision',
    'decodeToolWaitId',
    'defaultResultPolicyAdoption',
    'defaultResultPolicyRules',
    'toolBodyContract',
  ])
})

/** A root graph must not reach Cordis, a Cordis entry of any package, or the provider member. */
function forbiddenFromRoot(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    specifier === '@omne-harness/tool-host-local' ||
    specifier.startsWith('@omne-harness/tool-host-local/') ||
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
    expect(graph.files.size).toBeGreaterThan(1)
    const forbidden = graph.imports.filter(edge => forbiddenFromRoot(edge.specifier))
    expect(forbidden.map(describeImport)).toEqual([])
    for (const file of graph.files) expect(file).not.toMatch(/[/\\]cordis(\.d)?\.(ts|js)$/u)
  })

  it('sees every import form that can load a module', () => {
    // A guard for the walker itself: a walker that misses one of these forms would pass the
    // checks above while the root still loaded Cordis.
    const text = [
      "import '@deepseek-ai/cordis'",
      "import type { Context } from 'a-type'",
      "export { x } from './b.js'",
      "export * from 'c'",
      "const d = await import('@omne-harness/tool-host-local/cordis')",
    ].join('\n')
    expect(specifiersOf(text)).toEqual([
      '@deepseek-ai/cordis',
      'a-type',
      './b.js',
      'c',
      '@omne-harness/tool-host-local/cordis',
    ])
  })
})
