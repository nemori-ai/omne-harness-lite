import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as tool from '@omne-harness/tool'
import { describeImport, memberPath, walkModules, type ModuleKind } from './module-graph.ts'

/** Cordis and the Tool packages that depend on Cordis. The implementation must reach none. */
function forbidden(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    /^@omne-harness\/tool-(cordis-contract|host-local)(\/|$)/u.test(specifier)
  )
}

it('root entry exports no values until ticket 04 adds the execution functions', () => {
  expect(Object.keys(tool)).toEqual([])
})

describe('implementation has no Cordis', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['source', 'src/index.ts'],
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    expect(graph.imports.filter(edge => forbidden(edge.specifier)).map(describeImport)).toEqual([])
  })

  it('depends on the contract package and on neither Cordis nor a Cordis Tool package', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(manifest.dependencies).toMatchObject({ '@omne-harness/tool-contract': 'workspace:*' })
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(declared.filter(forbidden)).toEqual([])
  })
})
