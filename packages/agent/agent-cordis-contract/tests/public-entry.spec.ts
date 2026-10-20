import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { describeImport, memberPath, walkModules } from './module-graph.ts'

describe('the root entry', () => {
  it('exports no values: the types are erased and the definitions are at ./cordis', async () => {
    const root = (await import('@omne-harness/agent-cordis-contract')) as Record<string, unknown>
    expect(Object.keys(root)).toEqual([])
  })

  it('loads nothing: the built entry has no import at all', () => {
    const graph = walkModules(memberPath('dist/index.js'), 'javascript')
    expect(graph.imports.map(describeImport)).toEqual([])
  })

  it('has no edge to Cordis at all, types included, in its declaration', () => {
    const graph = walkModules(memberPath('dist/index.d.ts'), 'declaration')
    expect(graph.files.size).toBeGreaterThan(1)
    const cordis = graph.imports.filter(edge => edge.specifier.startsWith('@deepseek-ai/cordis'))
    expect(cordis.map(describeImport)).toEqual([])
    expect(readFileSync(memberPath('dist/index.d.ts'), 'utf8')).not.toContain('@deepseek-ai/cordis')
  })

  it('reaches no Cordis entry of another package and no Agent implementation', () => {
    for (const [entry, kind] of [
      ['dist/index.js', 'javascript'],
      ['dist/index.d.ts', 'declaration'],
    ] as const) {
      const forbidden = walkModules(memberPath(entry), kind).imports.filter(
        edge =>
          /^@omne-harness\/[^/]+\/cordis$/u.test(edge.specifier) ||
          /^@omne-harness\/agent(-host-local)?(\/|$)/u.test(edge.specifier),
      )
      expect(forbidden.map(describeImport)).toEqual([])
    }
  })
})
