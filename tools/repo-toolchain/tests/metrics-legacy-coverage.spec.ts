import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { distIsStale, lineHitsFrom, measureCoverage } from '../src/metrics/coverage.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'omne-coverage-legacy-'))
  roots.push(root)
  return root
}
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

it('excludes archived coverage paths but retains similar directory and file suffixes', () => {
  const entry = { statementMap: { '0': { start: { line: 1 } } }, s: { '0': 1 } }
  const files = lineHitsFrom(
    {
      '/repo/packages/live/src/old.legacy/a.ts': entry,
      '/repo/packages/live/src/old.legacy-not/a.ts': entry,
      '/repo/packages/live/src/a.legacy': entry,
      '/repo/packages/member.legacy/src/a.ts': entry,
    },
    '/repo',
  )
  expect([...files.keys()]).toEqual([
    'packages/live/src/old.legacy-not/a.ts',
    'packages/live/src/a.legacy',
  ])
})

it('ignores archived timestamps while an active newer source still makes dist stale', () => {
  const root = fixture()
  for (const path of ['src/live.ts', 'dist/live.js', 'src/old.legacy/poison.ts'])
    put(root, path, '')
  utimesSync(join(root, 'src/live.ts'), 10, 10)
  utimesSync(join(root, 'dist/live.js'), 20, 20)
  utimesSync(join(root, 'src/old.legacy/poison.ts'), 30, 30)
  expect(distIsStale(root)).toBe(false)
  put(root, 'dist/old.legacy/poison.js', '')
  utimesSync(join(root, 'dist/old.legacy/poison.js'), 40, 40)
  utimesSync(join(root, 'src/live.ts'), 35, 35)
  expect(distIsStale(root)).toBe(true)
})

it('real coverage excludes archived tests and source, keeps configured exclusions and active failures', () => {
  const root = fixture()
  const member = 'packages/live'
  const dir = join(root, member)
  mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true })
  symlinkSync(
    fileURLToPath(new URL('../node_modules/vitest', import.meta.url)),
    join(dir, 'node_modules/vitest'),
    'dir',
  )
  mkdirSync(join(dir, 'node_modules/@vitest'))
  symlinkSync(
    fileURLToPath(new URL('../../../node_modules/@vitest/coverage-v8', import.meta.url)),
    join(dir, 'node_modules/@vitest/coverage-v8'),
    'dir',
  )
  symlinkSync(
    fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
    join(dir, 'node_modules/.bin/vitest'),
  )
  put(dir, 'package.json', JSON.stringify({ type: 'module', scripts: { test: 'vitest run' } }))
  put(
    dir,
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { exclude: ['tests/fixtures/**'], coverage: { exclude: ['src/ignored.ts'] } } })\n`,
  )
  put(dir, 'src/live.ts', 'export const value = 1\n')
  put(dir, 'src/ignored.ts', 'export const ignored = 1\n')
  put(dir, 'src/archive.legacy/poison.ts', 'throw new Error("archive source loaded")\n')
  put(
    dir,
    'tests/live.spec.ts',
    `import { test, expect } from 'vitest'\nimport { value } from '../src/live.ts'\ntest('live', () => expect(value).toBe(1))\n`,
  )
  put(dir, 'tests/archive.legacy/poison.spec.ts', 'throw new Error("archive test ran")\n')
  put(dir, 'tests/fixtures/poison.spec.ts', 'throw new Error("configured excluded test ran")\n')
  put(root, 'packages/old.legacy/package.json', JSON.stringify({ scripts: { test: 'vitest run' } }))
  const out = join(root, 'evidence')
  const result = measureCoverage(root, [member, 'packages/old.legacy'], out)
  expect([...result.members]).toEqual([[member, 0]])
  expect([...result.files.keys()]).toEqual([`${member}/src/live.ts`])
  put(dir, 'tests/current.legacy-not/poison.spec.ts', 'throw new Error("active test failed")\n')
  const failed = measureCoverage(root, [member], out)
  expect(failed.members.get(member)).not.toBe(0)
}, 25_000)
