import { describe, expect, it } from 'vitest'
import { describeImport, memberPath, walkModules, type ModuleKind } from './module-graph.ts'

it('root entry exports no values; the definitions are at ./cordis', async () => {
  const root = (await import('@omne-harness/tool-cordis-contract')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual([])
})

it('the testing entry exports the registration suite, its non-durable double and the case helpers', async () => {
  const testing = await import('@omne-harness/tool-cordis-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'NotApplicable',
    'createMemoryToolRegistrations',
    'isNotApplicable',
    'memoryToolRegistrationFixture',
    'registrationAnswers',
    'runConformanceCase',
    'toolRegistrationConformance',
  ])
  expect(testing.createMemoryToolRegistrations().durability).toBe('none')
})

describe('the testing entry has no Tool implementation and no Cordis at run time', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/testing.ts'],
    ['javascript', 'dist/testing.js'],
    ['declaration', 'dist/testing.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    const implementations = graph.imports.filter(edge =>
      /^@omne-harness\/tool(-host-local)?(\/|$)/u.test(edge.specifier),
    )
    expect(implementations.map(describeImport)).toEqual([])
    if (kind === 'javascript') {
      const cordis = graph.imports.filter(edge => edge.specifier.startsWith('@deepseek-ai/cordis'))
      expect(cordis.map(describeImport)).toEqual([])
    }
  })
})
