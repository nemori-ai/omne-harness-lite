import { readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import * as skill from '@omne-harness/skill-contract'

it('exports the skill body port', () => {
  expect(Object.keys(skill).sort()).toEqual([
    'computeDigest',
    'inferMediaType',
    'isAssetVersion',
    'isControlFile',
    'isPackageDigest',
    'isPackagePath',
    'isSafeReason',
    'isSkillName',
    'parseSkillPackage',
    'projectAssetBody',
    'skillBodyContract',
    'toPackagePath',
  ])
})

it('exports the snapshot constructor on the provider entry only', async () => {
  const provider = await import('@omne-harness/skill-contract/provider')
  expect(Object.keys(provider).sort()).toEqual(['sealSnapshot'])
  expect(Object.keys(skill)).not.toContain('sealSnapshot')
})

it('exports the three port suites and their memory doubles on the testing entry', async () => {
  const testing = await import('@omne-harness/skill-contract/testing')
  expect(Object.keys(testing).sort()).toEqual([
    'NotApplicable',
    'createMemoryReadCheck',
    'createMemoryResolution',
    'createMemorySource',
    'isNotApplicable',
    'runConformanceCase',
    'skillPackageSourceConformance',
    'skillReadCheckConformance',
    'skillResolutionConformance',
  ])
})

it('reaches neither the testing entry nor vitest from the root or the provider entry', () => {
  for (const entry of ['index.js', 'provider.js']) {
    const reached = walk(join(dist, entry))
    expect(
      [...reached.files].map(file => relative(dist, file)),
      entry,
    ).not.toContain('testing.js')
    expect(reached.bare, entry).not.toContain('vitest')
  }
})

const dist = fileURLToPath(new URL('../dist/', import.meta.url))

/** The dist modules that `entry` reaches by relative imports, and the bare specifiers it names. */
function walk(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>()
  const bare = new Set<string>()
  const pending = [entry]
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue
    files.add(file)
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:\bfrom|\bimport\s*\(?)\s*['"]([^'"]+)['"]/g)) {
      const specifier = match[1] ?? ''
      if (specifier.startsWith('.')) pending.push(join(dirname(file), specifier))
      else bare.add(specifier)
    }
  }
  return { files, bare }
}
