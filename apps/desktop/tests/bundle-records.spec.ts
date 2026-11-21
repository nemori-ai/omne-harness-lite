import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { moduleName, readBundleModules, sha256 } from '../scripts/bundle-build.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

/** A profile directory holding main/main.js with `code` and, if given, its record. */
function built(code: string, record?: unknown): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'omne-bundle-record-')))
  directories.push(directory)
  mkdirSync(join(directory, 'main'))
  writeFileSync(join(directory, 'main/main.js'), code)
  if (record !== undefined)
    writeFileSync(
      join(directory, 'main/main.js.modules.json'),
      typeof record === 'string' ? record : JSON.stringify(record),
    )
  return directory
}

const good = (code: string) => ({
  profile: 'test',
  bundle: 'main/main.js',
  sha256: sha256(code),
  modules: ['src/main/main.ts'],
  renderedModules: ['src/main/main.ts'],
})

it('模块记录要是这个档、这个包、盘上这份文件的', () => {
  expect(readBundleModules('test', 'main/main.js', built('x', good('x')))).toEqual(good('x'))
  expect(() => readBundleModules('test', 'main/main.js', built('x'))).toThrow(
    'is missing: run `pnpm run build:test` first',
  )
  expect(() => readBundleModules('test', 'main/main.js', built('x', '{'))).toThrow(
    'is not a bundle module record',
  )
  expect(() =>
    readBundleModules('test', 'main/main.js', built('x', { ...good('x'), renderedModules: 1 })),
  ).toThrow('is not a bundle module record')
  expect(() =>
    readBundleModules('test', 'main/main.js', built('x', { ...good('x'), profile: 'release' })),
  ).toThrow('describes main/main.js of the release profile')
  expect(() => readBundleModules('test', 'main/main.js', built('y', good('x')))).toThrow('is stale')
})

it('模块名：本检出下的文件取相对路径，虚拟模块原样', () => {
  expect(moduleName('/d/src/main/main.ts?x', '/d')).toBe('src/main/main.ts')
  expect(moduleName('\0virtual', '/d')).toBe('\0virtual')
})
