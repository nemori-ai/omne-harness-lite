import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill-contract'

it('exports the skill body port', () => {
  expect(Object.keys(skill).sort()).toEqual([
    'DECLARATION_LIMITS',
    'DECLARATION_PATH',
    'DESCRIPTION_LIMIT',
    'MANIFEST_PATH',
    'PAGE_LIMIT',
    'bodyOffsetOf',
    'computeDigest',
    'inferMediaType',
    'isAssetVersion',
    'isControlFile',
    'isPackageDigest',
    'isPackagePath',
    'isSafeReason',
    'isSkillDescription',
    'isSkillName',
    'parseSkillPackage',
    'projectAssetBody',
    'sameCapability',
    'skillBodyContract',
    'toPackagePath',
  ])
})

it('exports the snapshot constructor and its guard on the provider entry only', async () => {
  const provider = await import('@omne-harness/skill-contract/provider')
  expect(Object.keys(provider).sort()).toEqual(['isSealedSnapshot', 'sealSnapshot'])
  expect(Object.keys(skill)).not.toContain('sealSnapshot')
  expect(Object.keys(skill)).not.toContain('isSealedSnapshot')
})

it('exports the five suites and the three memory doubles on the testing entry', async () => {
  const testing = await import('@omne-harness/skill-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'NotApplicable',
    'createMemoryReadCheck',
    'createMemoryResolution',
    'createMemorySource',
    'isNotApplicable',
    'runConformanceCase',
    'skillAccessConformance',
    'skillCatalogConformance',
    'skillPackageSourceConformance',
    'skillReadCheckConformance',
    'skillResolutionConformance',
  ])
})

it('reaches neither the testing modules nor a test framework from the root or the provider entry', () => {
  for (const entry of ['index.ts', 'provider.ts']) {
    const reached = walk(join(src, entry))
    const files = [...reached.files].map(file => relative(src, file))
    expect(
      files.filter(file => file.startsWith('testing')),
      entry,
    ).toEqual([])
    expect([...reached.bare].filter(isTestFramework), entry).toEqual([])
  }
})

it('does not import a test framework from the testing entry', () => {
  const reached = walk(join(src, 'testing.ts'))
  expect([...reached.bare].filter(isTestFramework)).toEqual([])
  expect(reached.bare).toContain('node:assert/strict')
})

it('writes the provider entry only as type re-exports and the one runtime re-export of the snapshot module', () => {
  const text = readFileSync(join(src, 'provider.ts'), 'utf8')
  const statements = exportStatements(join(src, 'provider.ts'))
  for (const statement of statements)
    expect(statement).toMatch(
      /^export type \{ [A-Za-z, ]+,? \} from '\.\/[a-z-]+\.ts'$|^export \{ isSealedSnapshot, sealSnapshot \} from '\.\/snapshot\.ts'$/,
    )
  // Comments and empty statements are not exports: the mutation sandbox adds both.
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  const rest = statements.reduce(
    (left, statement) => left.replace(/\s+/g, ' ').replace(statement, ''),
    withoutComments.replace(/\s+/g, ' '),
  )
  expect(rest.replace(/[;\s]/g, '')).toBe('')
})

it('names on the provider entry exactly the types and values that the SPEC gives it', () => {
  expect(exportedNames(join(src, 'provider.ts'))).toEqual([
    'CatalogResolution',
    'PackageInspection',
    'PackageLocator',
    'ReadVerdict',
    'Reply',
    'Resolution',
    'SkillPackageSource',
    'SkillReadCheck',
    'SkillRef',
    'SkillResolution',
    'SnapshotDefect',
    'SourceFailure',
    'isSealedSnapshot',
    'sealSnapshot',
  ])
})

const src = fileURLToPath(new URL('../src/', import.meta.url))

/** Module specifiers in a source text: `import … from`, `export … from`, bare and dynamic imports. */
const SPECIFIER = /(?:\bfrom|\bimport\s*\(?)\s*(['"])([^'"]+)\1/g

const isTestFramework = (specifier: string): boolean =>
  /^(?:vitest|jest|mocha|@vitest\/)/.test(specifier)

/** The source modules that `entry` reaches by relative imports, and the bare specifiers it names. */
function walk(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue
    files.add(file)
    for (const match of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const specifier = match[2] ?? ''
      if (specifier.startsWith('.')) pending.push(join(dirname(file), specifier))
      else bare.add(specifier)
    }
  }
  return { files, bare }
}

/**
 * The names that a re-exporting entry file exports, types included, sorted. A star export
 * (`export *` or `export type *`) has no list of names, so it appears as `*`. An inline `type`
 * inside the braces is read too.
 */
function exportedNames(entry: string): string[] {
  const text = readFileSync(entry, 'utf8')
  const names: string[] = []
  for (const _star of text.matchAll(/export\s+(?:type\s+)?\*/g)) names.push('*')
  for (const block of text.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))
    for (const part of (block[1] ?? '').split(','))
      if (part.trim() !== '')
        names.push(
          part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)
            .pop() ?? '',
        )
  return names.sort()
}

/** The export statements of an entry file, with their white space collapsed. */
function exportStatements(entry: string): string[] {
  const text = readFileSync(entry, 'utf8')
  return [...text.matchAll(/export\b[^;]*?from\s*(['"])[^'"]+\1/g)].map(match =>
    match[0].replace(/\s+/g, ' '),
  )
}
