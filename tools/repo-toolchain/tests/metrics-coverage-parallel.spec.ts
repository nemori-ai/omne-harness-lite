// 覆盖率跨成员并行的调度部分：并发度的写法、按上次耗时排先后、限并发且结果按原顺序的任务池。
// 真实 vitest 的串行与并行对照在 metrics-legacy-coverage.spec.ts（慢层）。
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  countTestFiles,
  inPool,
  longestFirst,
  parseCoverageParallel,
  previousCoverageSeconds,
} from '../src/metrics/coverage.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'omne-coverage-parallel-')))
  roots.push(root)
  return root
}
function put(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

describe('并发度的写法', () => {
  it('<M>x<W>，两个都是正整数；别的写法报错，不悄悄退回串行', () => {
    expect(parseCoverageParallel('3x5')).toEqual({ members: 3, workers: 5 })
    expect(parseCoverageParallel('12x1')).toEqual({ members: 12, workers: 1 })
    for (const bad of ['', '3', '0x2', '2x0', '3x', 'x3', '3*5', ' 3x5', '3x5x1', '-1x2', '1.5x2'])
      expect(() => parseCoverageParallel(bad), bad).toThrow('<同时成员数>x<每成员工作进程数>')
  })

  it('入口：--coverage-parallel 不带 --coverage 时报错，写法不对也报错，都在量之前', () => {
    const cli = fileURLToPath(new URL('../src/metrics/cli.ts', import.meta.url))
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ['--experimental-strip-types', cli, ...args], {
        encoding: 'utf8',
      })
    const alone = run('--coverage-parallel', '2x2')
    expect(alone.status).not.toBe(0)
    expect(alone.stderr).toContain('只在带 --coverage 时有意义')
    const malformed = run('--plan', 'missing.json', '--coverage', '--coverage-parallel', 'many')
    expect(malformed.status).not.toBe(0)
    expect(malformed.stderr).toContain('<同时成员数>x<每成员工作进程数>')
  })
})

describe('排先后', () => {
  it('有上次耗时的按耗时从长到短；一样长的保持原顺序', () => {
    const seconds = new Map([
      ['a', 3],
      ['b', 30],
      ['c', 3],
      ['d', 8],
    ])
    expect(longestFirst(['a', 'b', 'c', 'd'], seconds, new Map())).toEqual(['b', 'd', 'a', 'c'])
  })

  it('没有上次耗时的按测试文件数，换算成有耗时成员的平均每文件秒数，再与有耗时的一起排', () => {
    // 有耗时的：x 10 秒 5 个文件 → 每文件 2 秒。y 没耗时、6 个文件 → 估 12 秒，排在 x 前；z 1 个文件 → 2 秒。
    const order = longestFirst(
      ['x', 'y', 'z'],
      new Map([['x', 10]]),
      new Map([
        ['x', 5],
        ['y', 6],
        ['z', 1],
      ]),
    )
    expect(order).toEqual(['y', 'x', 'z'])
    // 都没有耗时：只按文件数。
    expect(
      longestFirst(
        ['p', 'q'],
        new Map(),
        new Map([
          ['p', 1],
          ['q', 4],
        ]),
      ),
    ).toEqual(['q', 'p'])
  })

  it('历次 metrics.json：同一成员取最新一份里的正数，0 与坏文件不算', () => {
    const root = fixture()
    const write = (run: string, seconds: unknown, mtime: number) => {
      put(root, `${run}/metrics.json`, JSON.stringify({ meta: { coverageSeconds: seconds } }))
      utimesSync(join(root, run, 'metrics.json'), mtime, mtime)
    }
    write('old', { a: 40, b: 5, c: 7 }, 100)
    write('new', { a: 20, b: 0 }, 200)
    write('none', null, 300)
    put(root, 'broken/metrics.json', '{')
    expect(previousCoverageSeconds([root, join(root, 'missing')])).toEqual(
      new Map([
        ['a', 20],
        ['b', 5],
        ['c', 7],
      ]),
    )
  })

  it('测试文件数不算 node_modules、dist、点目录与归档目录', () => {
    const root = fixture()
    for (const path of [
      'tests/a.spec.ts',
      'tests/deep/b.test.mts',
      'src/c.spec.tsx',
      'tests/helper.ts',
      'node_modules/x/d.spec.ts',
      'dist/e.spec.js',
      '.stryker-tmp/f.spec.ts',
      'tests/old.legacy/g.spec.ts',
    ])
      put(root, path, '')
    expect(countTestFiles(root)).toBe(3)
  })
})

describe('任务池', () => {
  const tick = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  it('同时至多 limit 个，结果按输入顺序，与完成先后无关', async () => {
    let running = 0
    let peak = 0
    const finished: number[] = []
    const delays = [40, 5, 25, 1, 15]
    const results = await inPool(delays, 2, async delay => {
      running += 1
      peak = Math.max(peak, running)
      await tick(delay)
      running -= 1
      finished.push(delay)
      return delay * 10
    })
    expect(peak).toBe(2)
    expect(finished).not.toEqual(delays)
    expect(results).toEqual([400, 50, 250, 10, 150])
  })

  it('一个失败后不再开新任务，等已开始的结束，再抛出第一个错误', async () => {
    const started: string[] = []
    const settled: string[] = []
    const run = inPool(['slow', 'fails', 'never'], 2, async item => {
      started.push(item)
      await tick(item === 'slow' ? 30 : 1)
      settled.push(item)
      if (item === 'fails') throw new Error('first')
      return item
    })
    await expect(run).rejects.toThrow('first')
    expect(started).toEqual(['slow', 'fails'])
    expect(settled).toEqual(['fails', 'slow'])
  })

  it('空输入与 limit 大于任务数', async () => {
    expect(await inPool([], 4, async () => 1)).toEqual([])
    expect(await inPool([1, 2], 8, async n => n + 1)).toEqual([2, 3])
  })
})
