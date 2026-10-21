import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isLegacyDirectory, isLegacyFile } from '../src/core/check-scope.ts'
import { collectSources } from '../src/index.ts'
import { collectMemberSources } from '../src/metrics/sources.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-legacy-scope-')))
  roots.push(root)
  return root
}
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

describe('legacy check boundaries', () => {
  it('excludes directory suffixes, preserves similar names and file basenames', () => {
    expect(isLegacyDirectory('packages/nested.legacy/core')).toBe(true)
    expect(isLegacyFile('packages\\nested.legacy\\a.ts')).toBe(true)
    expect(isLegacyFile('tools/live/file.legacy')).toBe(false)
    expect(isLegacyDirectory('tools/old.legacy-not')).toBe(false)
  })

  it('static collectors skip nested archived directories and keep active violations', () => {
    const root = fixture()
    for (const path of [
      'packages/live/src/a.ts',
      'packages/nested.legacy/core/a.ts',
      'packages/similar.legacy-not/src/a.ts',
    ])
      put(root, path, 'export const value = 1\n')
    for (const path of [
      'packages/live/acceptance/PF-001.acceptance.ts',
      'packages/nested.legacy/core/acceptance/PF-001.acceptance.ts',
    ])
      put(root, path, '// covers: PF-001 S1\n')
    const expected = [
      'packages/live/acceptance/PF-001.acceptance.ts',
      'packages/live/src/a.ts',
      'packages/similar.legacy-not/src/a.ts',
    ]
    for (const collect of [collectSources, collectMemberSources])
      expect(
        collect(root)
          .map(file => file.path)
          .sort(),
      ).toEqual(expected)
  })
})
