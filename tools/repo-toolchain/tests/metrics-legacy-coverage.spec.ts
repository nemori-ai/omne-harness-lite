import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-coverage-legacy-')))
  roots.push(root)
  return root
}
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}
/** 让夹具成员能 `pnpm exec vitest`：链到本包装好的 vitest 与根上的覆盖率插件。 */
function linkVitest(dir: string): void {
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

// Slow: runs real vitest coverage in a fixture workspace. 4.5 s on the full-admission fast-tier ledger, over the 2.5 s per-case budget (6.2 s under load) (tools/test-runner/README_ZH.md「归层」).
it(
  'real coverage excludes archived tests and source, keeps configured exclusions and active failures',
  { tags: ['slow'], timeout: 25_000 },
  async () => {
    const root = fixture()
    const member = 'packages/live'
    const dir = join(root, member)
    linkVitest(dir)
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
    put(
      root,
      'packages/old.legacy/package.json',
      JSON.stringify({ scripts: { test: 'vitest run' } }),
    )
    const out = join(root, 'evidence')
    const result = await measureCoverage(root, [member, 'packages/old.legacy'], out)
    expect([...result.members]).toEqual([[member, 0]])
    expect([...result.files.keys()]).toEqual([`${member}/src/live.ts`])
    put(dir, 'tests/current.legacy-not/poison.spec.ts', 'throw new Error("active test failed")\n')
    const failed = await measureCoverage(root, [member], out)
    expect(failed.members.get(member)).not.toBe(0)
  },
)

// 归慢层：两个夹具成员各起两次真实 vitest 覆盖率（串行一次、并行一次），本机空闲时约 8 秒。
it(
  'parallel coverage gives the same readings, exit codes and member order as serial',
  { tags: ['slow'], timeout: 60_000 },
  async () => {
    const root = fixture()
    // 「大」成员排在后面：并行时它先开始、后结束，完成先后与原顺序不同，结果仍按原顺序。
    const members = ['packages/small', 'packages/large']
    for (const member of members) {
      const dir = join(root, member)
      linkVitest(dir)
      put(dir, 'package.json', JSON.stringify({ type: 'module', scripts: { test: 'vitest run' } }))
      // 第二个分支没有用例走到：行命中有真有假，比较才有内容。
      put(
        dir,
        'src/value.ts',
        'export function value(n: number) {\n  if (n > 0) return 1\n  return 2\n}\n',
      )
      put(
        dir,
        'tests/value.spec.ts',
        `import { test, expect } from 'vitest'\nimport { value } from '../src/value.ts'\ntest('v', () => expect(value(1)).toBe(1))\n`,
      )
    }
    put(
      join(root, 'packages/large'),
      'tests/slow.spec.ts',
      `import { test, expect } from 'vitest'\ntest('slow', async () => {\n  await new Promise(resolve => setTimeout(resolve, 1500))\n  expect(1).toBe(2)\n})\n`,
    )
    const serial = await measureCoverage(root, members, join(root, 'serial'))
    const parallel = await measureCoverage(root, members, join(root, 'parallel'), {
      parallel: { members: 2, workers: 1 },
    })
    expect([...serial.members]).toEqual([
      ['packages/small', 0],
      ['packages/large', 1],
    ])
    expect([...parallel.members]).toEqual([...serial.members])
    expect([...parallel.seconds.keys()]).toEqual(members)
    expect([...parallel.files.keys()]).toEqual([...serial.files.keys()])
    expect([...parallel.files.keys()]).toEqual(members.map(member => `${member}/src/value.ts`))
    for (const [path, hits] of serial.files)
      expect([...(parallel.files.get(path) ?? [])]).toEqual([...hits])
    expect([...(serial.files.get('packages/small/src/value.ts')?.values() ?? [])]).toContain(false)
    expect(parallel.staleDist).toEqual(serial.staleDist)
    // 每个成员的日志各归各的：大成员的失败只出现在它自己的日志里。
    expect(readFileSync(join(root, 'parallel', 'packages__large.vitest.log'), 'utf8')).toContain(
      'slow',
    )
    expect(
      readFileSync(join(root, 'parallel', 'packages__small.vitest.log'), 'utf8'),
    ).not.toContain('slow')
  },
)
