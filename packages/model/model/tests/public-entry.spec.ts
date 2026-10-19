import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

it('the public entry exports credential delivery and judgment, not the store or the contract values', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(
    ['deliver', 'judgeGate', 'judgePresence', 'judgeResolution'].sort(),
  )
})

it('the source reaches neither a custodian, Cordis nor the host package', () => {
  for (const name of ['index.ts', 'deliver.ts', 'credential.ts']) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), name).toBe(false)
    expect(source.includes('model-host-local'), name).toBe(false)
    expect(source.includes('model-cordis-contract'), name).toBe(false)
    expect(source.includes('store.ts'), name).toBe(false)
  }
})

it('the package exposes only its root: the old cordis and execute subpaths do not resolve', () => {
  // Node's own resolver: vitest's module loader reports a missing export without the error code.
  const resolve = createRequire(import.meta.url).resolve
  for (const subpath of ['cordis', 'execute']) {
    expect(() => resolve(`@omne-harness/model/${subpath}`)).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    )
  }
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { exports: Record<string, unknown> }
  expect(Object.keys(manifest.exports)).toEqual(['.'])
})

it('the manifest declares no Cordis, lock-file or Cordis-contract dependency', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as Record<string, Record<string, string> | undefined>
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ])
    for (const name of [
      '@deepseek-ai/cordis',
      'proper-lockfile',
      '@omne-harness/model-cordis-contract',
    ])
      expect(Object.keys(manifest[field] ?? {}), `${field} ${name}`).not.toContain(name)
})
