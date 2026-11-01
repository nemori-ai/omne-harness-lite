import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('the commands subpath exports the shared core and its method set, and the root entry does not', async () => {
  const commands = await import('@omne-harness/model/commands')
  expect(Object.keys(commands).sort()).toEqual(
    ['MODEL_WRITE_METHODS', 'createModelCommandsCore', 'hasRecoveryWork', 'modelCommands'].sort(),
  )
  const root = await import('@omne-harness/model')
  expect(Object.keys(root)).not.toContain('createModelCommandsCore')
  expect(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'process.stdout.write(import.meta.resolve("@omne-harness/model/commands"))',
      ],
      { cwd: new URL('..', import.meta.url), encoding: 'utf8' },
    ),
  ).toMatch(/dist\/commands\/index\.js$/u)
})

it('the commands subpath import graph never reaches testing, host, Cordis or private contract entries', () => {
  const visited = new Set<string>()
  function walk(url: URL): void {
    if (visited.has(url.href)) return
    visited.add(url.href)
    expect(url.pathname.includes('/testing/')).toBe(false)
    const source = readFileSync(url, 'utf8')
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/gu)) {
      const specifier = match[1]
      if (specifier === undefined) throw new Error('import match')
      expect(specifier).not.toMatch(
        /cordis|host-local|session|legacy|\/testing|model-contract\/(?!provider$)/u,
      )
      if (specifier.startsWith('.')) walk(new URL(specifier, url))
    }
  }
  walk(new URL('../src/commands/index.ts', import.meta.url))
  expect(visited.size).toBeGreaterThan(1)
})
