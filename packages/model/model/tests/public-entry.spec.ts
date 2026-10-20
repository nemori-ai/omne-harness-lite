import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'

it('the public entry exports standalone execution, runtime construction and credential functions', async () => {
  const root = await import('@omne-harness/model')
  expect(Object.keys(root).sort()).toEqual(
    [
      'createModelRuntime',
      'createModelSendBoundary',
      'executeModel',
      'deliver',
      'judgeGate',
      'judgePresence',
      'judgeResolution',
    ].sort(),
  )
})

it('the source reaches neither a custodian, Cordis nor the host package', () => {
  for (const name of ['index.ts', 'deliver.ts', 'credential.ts', 'runtime.ts', 'execute.ts']) {
    const source = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')
    expect(source.includes('@deepseek-ai/cordis'), name).toBe(false)
    expect(source.includes('model-host-local'), name).toBe(false)
    expect(source.includes('model-cordis-contract'), name).toBe(false)
    expect(source.includes('store.ts'), name).toBe(false)
  }
})

it('the package exposes its root and isolated testing entry: the old cordis and execute subpaths do not resolve', () => {
  // Node's own resolver: vitest's module loader reports a missing export without the error code.
  const resolve = createRequire(import.meta.url).resolve
  for (const subpath of ['cordis', 'execute']) {
    expect(() => resolve(`@omne-harness/model/${subpath}`)).toThrow(
      expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }),
    )
  }
  expect(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'process.stdout.write(import.meta.resolve("@omne-harness/model/testing"))',
      ],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
    ),
  ).toMatch(/dist\/testing\/index\.js$/u)
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { exports: Record<string, unknown> }
  expect(Object.keys(manifest.exports)).toEqual(['.', './testing'])
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

it('the root import graph never reaches testing, host, Cordis or private contract entries', () => {
  const visited = new Set<string>()
  function walk(url: URL): void {
    if (visited.has(url.href)) return
    visited.add(url.href)
    const source = readFileSync(url, 'utf8')
    expect(url.pathname.includes('/testing/')).toBe(false)
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)) {
      const specifier = match[1]
      if (specifier === undefined) throw new Error('import match')
      expect(specifier).not.toMatch(/cordis|host-local|session|legacy|\/testing|model-contract\//u)
      if (specifier.startsWith('.')) walk(new URL(specifier, url))
    }
  }
  walk(new URL('../src/index.ts', import.meta.url))
  expect(visited.size).toBeGreaterThan(1)
})
