// 变异运行中看得见的两件事：Stryker 的进度行从成员日志转到命令的标准输出（带成员路径），
// 以及启动时工作进程预算偏小的告警。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { progressLine } from '../src/mutation/stryker.ts'
import { workerWarning } from '../src/mutation/schedule.ts'
import type { Budget } from '../src/testing/parallelism.ts'
import { spawnLogged } from '../src/testing/run.ts'
import { temporary } from './fixtures/mutation.ts'

// 子进程在两条输出上交替写，最后一行没有换行符；Windows 风格的 `\r\n` 也在内。
const CHILD = [
  "process.stdout.write('第一行\\r\\nMutation testing 50% (elapsed: <1m) 1/2 tested\\n')",
  "process.stderr.write('错误输出\\n')",
  "process.stdout.write('没有换行的最后一行')",
].join(';')

describe('spawnLogged 的逐行回调', () => {
  it('给了回调时输出照样全进日志，每一行（含没有换行的最后一行）去掉行尾 \\r 交给回调', async () => {
    const logPath = join(temporary('spawn-logged-'), 'child.log')
    const lines: string[] = []
    const result = await spawnLogged(process.execPath, ['-e', CHILD], {
      cwd: process.cwd(),
      env: process.env,
      logPath,
      onLine: line => lines.push(line),
    })
    expect(result.exitCode).toBe(0)
    const log = readFileSync(logPath, 'utf8')
    for (const text of [
      '第一行\r\nMutation testing 50% (elapsed: <1m) 1/2 tested\n',
      '错误输出\n',
      '没有换行的最后一行',
    ])
      expect(log).toContain(text)
    expect(log).toHaveLength(
      '第一行\r\nMutation testing 50% (elapsed: <1m) 1/2 tested\n错误输出\n没有换行的最后一行'
        .length,
    )
    expect(lines.toSorted()).toEqual(
      [
        '第一行',
        'Mutation testing 50% (elapsed: <1m) 1/2 tested',
        '错误输出',
        '没有换行的最后一行',
      ].toSorted(),
    )
  })

  it('不给回调时子进程直接写日志，退出码照传', async () => {
    const logPath = join(temporary('spawn-logged-'), 'child.log')
    const result = await spawnLogged(
      process.execPath,
      ['-e', "process.stdout.write('甲\\n');process.stderr.write('乙\\n');process.exit(3)"],
      { cwd: process.cwd(), env: process.env, logPath },
    )
    expect(result.exitCode).toBe(3)
    expect(readFileSync(logPath, 'utf8')).toBe('甲\n乙\n')
  })

  it('给了回调而命令起不来时记为 -1，不抛', async () => {
    const logPath = join(temporary('spawn-logged-'), 'child.log')
    const lines: string[] = []
    const result = await spawnLogged('omne-no-such-command', [], {
      cwd: process.cwd(),
      env: process.env,
      logPath,
      onLine: line => lines.push(line),
    })
    expect(result.exitCode).toBe(-1)
    expect(lines).toEqual([])
  })
})

describe('Stryker 进度行的转发', () => {
  it('只转 progress-append-only 的进度行，行首加成员路径，复核另标', () => {
    const progress =
      'Mutation testing 45% (elapsed: <1m, remaining: ~1m) 10/22 tested (3 survived, 0 timed out)'
    expect(progressLine('packages/core/a', progress, false)).toBe(`packages/core/a ${progress}`)
    expect(progressLine('packages/core/a', progress, true)).toBe(
      `packages/core/a（复核） ${progress}`,
    )
    for (const other of [
      'INFO ProjectReader Found 1 of 3 file(s) to be mutated.',
      'Ran 1.00 tests per mutant on average.',
      'All tests/ Mutation testing 45%',
    ])
      expect(progressLine('packages/core/a', other, false)).toBeUndefined()
  })
})

describe('进程数告警', () => {
  const sampled = (workers: number, cores: number, idleFraction: number, freeMemoryMiB = 65_536) =>
    ({
      workers,
      machine: { cores, idleFraction, freeMemoryMiB },
      source: 'sampled',
    }) satisfies Budget

  it('预算不到核数一半、又没设 VITEST_MAX_WORKERS 时告警：写明空闲比例与重启命令', () => {
    const warning = workerWarning(sampled(3, 24, 0.15), {}, ['--since', 'HEAD~1', '--out', 'a b'])
    expect(warning).toContain('只分到 3 个工作进程，不到本机 24 核的一半')
    expect(warning).toContain('取样时空闲 15%')
    expect(warning).toContain(
      "`VITEST_MAX_WORKERS=12 pnpm run mutation --since HEAD~1 --out 'a b'`",
    )
    expect(warning).not.toContain('受空闲内存所限')
    expect(workerWarning(sampled(3, 7, 0.4), {}, [])).toContain(
      'VITEST_MAX_WORKERS=4 pnpm run mutation`',
    )
  })

  it('预算受空闲内存所限时写明', () => {
    expect(workerWarning(sampled(2, 24, 0.9, 1024), {}, [])).toContain('预算受空闲内存所限')
  })

  it('预算由 OMNE_WORKER_BUDGET 给定时写明来历，不报没取过的空闲比例', () => {
    const warning = workerWarning({ ...sampled(2, 24, 1), source: 'env' }, {}, [])
    expect(warning).toContain('预算由环境变量 OMNE_WORKER_BUDGET 给定，没有取样')
    expect(warning).not.toContain('空闲 100%')
  })

  it('设了 VITEST_MAX_WORKERS，或预算够核数一半时不告警', () => {
    expect(workerWarning(sampled(3, 24, 0.15), { VITEST_MAX_WORKERS: '3' }, [])).toBeUndefined()
    expect(workerWarning(sampled(12, 24, 0.5), {}, [])).toBeUndefined()
    expect(workerWarning(sampled(3, 24, 0.15), { VITEST_MAX_WORKERS: '' }, [])).toBeDefined()
  })
})
