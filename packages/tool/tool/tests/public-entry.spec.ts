import { readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
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

it('root entry exports the independent execution functions, the ledger and the runtime factory', () => {
  expect(Object.keys(tool).sort()).toEqual([
    'createIndependentToolScope',
    'createToolLedger',
    'createToolRuntime',
    'executeTool',
    'recordKey',
    'toolLedgerAdoption',
    'toolRuntimeAdoption',
  ])
})

it('testing entry exports only the non-durable store', async () => {
  const testing = await import('@omne-harness/tool/testing')
  expect(Object.keys(testing).sort()).toEqual(['createMemoryToolLedgerStore'])
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

  it('reaches Cordis in its install closure only through kernel-basis', () => {
    // kernel-basis owns Outcome and has a production dependency on Cordis (open item O8). Until
    // its owner moves Outcome to a package without Cordis, those are the accepted routes: direct,
    // and through the contract package. A new route fails here.
    expect(routesToCordis(memberPath('.'), [])).toEqual([
      ['@omne-harness/kernel-basis', '@deepseek-ai/cordis'],
      ['@omne-harness/tool-contract', '@omne-harness/kernel-basis', '@deepseek-ai/cordis'],
    ])
  })
})

/** Production dependency routes from a workspace package to Cordis, through workspace packages. */
function routesToCordis(directory: string, route: readonly string[]): string[][] {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  return Object.entries(manifest.dependencies ?? {}).flatMap(([name, range]) => {
    if (name === '@deepseek-ai/cordis') return [[...route, name]]
    if (!range.startsWith('workspace:') || route.includes(name)) return []
    return routesToCordis(realpathSync(join(directory, 'node_modules', name)), [...route, name])
  })
}
