import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  describeImport,
  memberPath,
  specifiersOf,
  walkModules,
  type ModuleKind,
} from './module-graph.ts'

/** The members that depend on this contract. It must not depend on any of them. */
const dependentMember = /^@omne-harness\/agent(-host-local|-cordis-contract)?(\/|$)/u

/** A root graph must not reach Cordis, a Cordis entry of any package, or a dependent member. */
function forbiddenFromRoot(specifier: string): boolean {
  return (
    specifier === '@deepseek-ai/cordis' ||
    specifier.startsWith('@deepseek-ai/cordis/') ||
    /^@omne-harness\/[^/]+\/cordis$/u.test(specifier) ||
    dependentMember.test(specifier)
  )
}

describe('the manifest', () => {
  it('lists neither Cordis nor a dependent member', () => {
    const manifest = JSON.parse(readFileSync(memberPath('package.json'), 'utf8')) as {
      exports: Record<string, unknown>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const declared = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]
    expect(
      declared.filter(name => dependentMember.test(name) || name.startsWith('@deepseek-ai/')),
    ).toEqual([])
    expect(Object.keys(manifest.dependencies ?? {})).not.toContain('@deepseek-ai/cordis')
    expect(Object.keys(manifest.exports)).toEqual(['.', './testing'])
  })
})

describe('the testing entry reaches no Cordis and no dependent member', () => {
  it('in the javascript graph from dist/testing.js', () => {
    const graph = walkModules(memberPath('dist/testing.js'), 'javascript')
    expect(graph.files.size).toBeGreaterThan(1)
    expect(
      graph.imports.filter(edge => forbiddenFromRoot(edge.specifier)).map(describeImport),
    ).toEqual([])
  })
})

describe('the root entry reaches no Cordis and no dependent member', () => {
  const entries: readonly (readonly [ModuleKind, string])[] = [
    ['javascript', 'dist/index.js'],
    ['declaration', 'dist/index.d.ts'],
  ]
  it.each(entries)('in the %s graph from %s', (kind, entry) => {
    const graph = walkModules(memberPath(entry), kind)
    expect(graph.files.size).toBeGreaterThan(1)
    const forbidden = graph.imports.filter(edge => forbiddenFromRoot(edge.specifier))
    expect(forbidden.map(describeImport)).toEqual([])
  })

  it('reaches the contract packages that the design page names', () => {
    // A guard for the walk: an empty or shallow graph would pass the check above for free.
    const graph = walkModules(memberPath('dist/index.js'), 'javascript')
    const seen = new Set(graph.imports.map(edge => edge.specifier))
    for (const name of ['@omne-harness/assets', '@omne-harness/legal-identity']) {
      expect(seen).toContain(name)
    }
  })

  it('does not load the testing entry or node:assert', () => {
    // The doubles and suites of `./testing` must stay out of what a production consumer loads.
    const graph = walkModules(memberPath('dist/index.js'), 'javascript')
    expect([...graph.files].filter(file => /\/dist\/testing/u.test(file))).toEqual([])
    expect(graph.imports.filter(edge => edge.specifier.startsWith('node:assert'))).toEqual([])
  })

  it('sees every import form that can load a module', () => {
    // A guard for the scanner itself: a scanner that misses one of these forms would pass the
    // checks above while the root still loaded Cordis. Comments and strings are not imports.
    const text = [
      "import '@deepseek-ai/cordis'",
      "import type { Context } from 'a-type'",
      "import Default, { a as b } from 'd'",
      "import * as ns from 'e'",
      "export { x } from './b.js'",
      "export type * from './t.js'",
      "export * from 'c'",
      "const f = await import('@omne-harness/agent-host-local/cordis')",
      "// import 'in-line-comment'",
      "/* export * from 'in-block-comment' */",
      'const s = "import \'in-string\'"',
      "type T = import('declared').Type",
    ].join('\n')
    expect(specifiersOf(text)).toEqual([
      '@deepseek-ai/cordis',
      'a-type',
      'd',
      'e',
      './b.js',
      './t.js',
      'c',
      '@omne-harness/agent-host-local/cordis',
      'declared',
    ])
  })
})
