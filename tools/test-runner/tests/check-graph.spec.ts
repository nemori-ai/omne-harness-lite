// 步骤图运行器：依赖顺序、轻步骤并发上限、一步失败其余终止、日志与退出码；逐步表与关键路径是纯函数。
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  checkGraph,
  runGraph,
  type CheckStep,
  type StepResult,
} from '../src/testing/check-graph.ts'
import { criticalPath, lightConcurrency, stepsTable } from '../src/testing/check.ts'

let dir: string
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'omne-check-graph-')))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 一步：睡 `ms` 毫秒、打印名字、以 `code` 退出。 */
const step = (
  name: string,
  ms: number,
  code = 0,
  after: string[] = [],
  heavy = false,
): CheckStep => ({
  name,
  command: [
    process.execPath,
    '-e',
    `setTimeout(() => { console.log(${JSON.stringify(name)}); process.exit(${code}) }, ${ms})`,
  ],
  after,
  heavy,
})

const options = (lightConcurrencyLimit = 8) => ({
  root: dir,
  logDir: join(dir, 'logs'),
  env: process.env,
  lightConcurrency: lightConcurrencyLimit,
})

describe('步骤图核对', () => {
  it('名字重复、依赖不存在、有环都报错', () => {
    expect(() => checkGraph([step('a', 0), step('a', 0)])).toThrow('重复')
    expect(() => checkGraph([step('a', 0, 0, ['b'])])).toThrow('不存在')
    expect(() => checkGraph([step('a', 0, 0, ['b']), step('b', 0, 0, ['a'])])).toThrow('有环')
  })
})

describe('运行', () => {
  it('没有依赖的同时跑，有依赖的等依赖结束；每步的输出落自己的日志', async () => {
    const run = await runGraph([step('a', 200), step('b', 50, 0, ['a']), step('c', 50)], options())
    const by = new Map(run.results.map(result => [result.name, result]))
    const a = by.get('a')
    const b = by.get('b')
    const c = by.get('c')
    expect(c?.startedMs).toBeLessThan(a?.endedMs ?? 0)
    expect(b?.startedMs).toBeGreaterThanOrEqual(a?.endedMs ?? Infinity)
    expect(run.results.every(result => result.exitCode === 0)).toBe(true)
    expect(run.skipped).toEqual([])
    expect(readFileSync(join(dir, 'logs', 'b.log'), 'utf8')).toContain('b')
  })

  it('轻步骤受并发上限限制，重步骤不受', async () => {
    const light = await runGraph([step('x', 150), step('y', 150), step('z', 150)], options(1))
    const starts = light.results.map(result => result.startedMs).sort((a, b) => a - b)
    const ends = light.results.map(result => result.endedMs).sort((a, b) => a - b)
    expect(starts[1]).toBeGreaterThanOrEqual(ends[0] ?? Infinity)
    expect(starts[2]).toBeGreaterThanOrEqual(ends[1] ?? Infinity)

    const heavy = await runGraph(
      [step('x', 150, 0, [], true), step('y', 150, 0, [], true)],
      options(1),
    )
    const heavyStarts = heavy.results.map(result => result.startedMs)
    expect(Math.max(...heavyStarts)).toBeLessThan(
      Math.min(...heavy.results.map(result => result.endedMs)),
    )
  })

  it('一步失败：依赖它的不开始，正在跑的被终止，退出码留在结果里', async () => {
    const run = await runGraph(
      [step('fails', 50, 3), step('after', 10, 0, ['fails']), step('long', 5000)],
      options(),
    )
    const by = new Map(run.results.map(result => [result.name, result]))
    expect(by.get('fails')?.exitCode).toBe(3)
    expect(by.get('fails')?.cancelled).toBe(false)
    expect(run.skipped).toEqual(['after'])
    expect(by.get('long')?.cancelled).toBe(true)
    expect(by.get('long')?.exitCode).not.toBe(0)
    expect(run.wallMs).toBeLessThan(4000)
    expect(existsSync(join(dir, 'logs', 'fails.log'))).toBe(true)
  })

  it('keepGoing：失败后其余照跑，依赖失败的仍不开始', async () => {
    const run = await runGraph(
      [step('fails', 50, 3), step('after', 10, 0, ['fails']), step('other', 300)],
      { ...options(), keepGoing: true },
    )
    const by = new Map(run.results.map(result => [result.name, result]))
    expect(by.get('other')?.exitCode).toBe(0)
    expect(by.get('other')?.cancelled).toBe(false)
    expect(run.skipped).toEqual(['after'])
  })

  it('起不来的命令记 -1，不抛', async () => {
    const run = await runGraph(
      [{ name: 'missing', command: [join(dir, 'no-such-binary')], after: [], heavy: false }],
      options(),
    )
    expect(run.results[0]?.exitCode).toBe(-1)
  })
})

describe('逐步表与关键路径', () => {
  const result = (name: string, startedMs: number, endedMs: number, exitCode = 0): StepResult => ({
    name,
    exitCode,
    startedMs,
    endedMs,
    logPath: `${name}.log`,
    cancelled: false,
  })

  it('逐步表按开始顺序，没开始的标 skipped', () => {
    const table = stepsTable([result('b', 1000, 2500), result('a', 0, 1000)], ['c'])
    expect(table).toEqual([
      'step\texit\tseconds\tstart\tend',
      'a\t0\t1.0\t0.0\t1.0',
      'b\t0\t1.5\t1.0\t2.5',
      'c\tskipped\t\t\t',
    ])
  })

  it('关键路径从最后结束的步骤沿最晚结束的依赖回溯', () => {
    const steps: CheckStep[] = [
      { name: 'build', command: [], after: [], heavy: true },
      { name: 'docs', command: [], after: [], heavy: false },
      { name: 'test', command: [], after: ['build'], heavy: true },
      { name: 'loop', command: [], after: ['build', 'docs', 'test'], heavy: false },
    ]
    const results = [
      result('build', 0, 10),
      result('docs', 0, 30),
      result('test', 10, 50),
      result('loop', 50, 60),
    ]
    expect(criticalPath(steps, results)).toEqual(['build', 'test', 'loop'])
  })

  it('轻步骤并发：核的三分之一，至少 2', () => {
    expect(lightConcurrency(2)).toBe(2)
    expect(lightConcurrency(8)).toBe(2)
    expect(lightConcurrency(24)).toBe(8)
  })
})
