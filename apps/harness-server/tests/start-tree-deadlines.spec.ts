import { Context, type Plugin } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { startTree, type EntryObject, type RowSpec, type StartResult } from '../src/loader.ts'
import { createTrust } from '../src/trust.ts'
import type { RowId, RowManifest, ServiceName, TreeRow } from '../src/types.ts'

const manifest: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }
const row = (id: string, plugin: Plugin): RowSpec => ({
  row: { id: id as RowId, plugin: id, config: {}, source: 'distribution' } satisfies TreeRow,
  manifest,
  plugin,
})
const never = new Promise<never>(() => {})
const hangs: Plugin = { name: 'hangs', apply: () => never }
const fails: Plugin = {
  name: 'fails',
  apply() {
    throw new Error('registration failed')
  },
}
const fine: Plugin = { name: 'fine', apply() {} }

const roots: Context[] = []
afterEach(() => {
  // A row that never settles keeps its root from disposing: the roots are dropped, not awaited.
  for (const root of roots.splice(0)) void root.fiber.dispose().catch(() => {})
})

async function start(
  options: Partial<Parameters<typeof startTree>[0]> & { rows: readonly RowSpec[] },
): Promise<{ result: StartResult; tookMs: number }> {
  const root = new Context()
  roots.push(root)
  const began = performance.now()
  const result = await startTree({
    root,
    trust: createTrust([], new Map()),
    entryObjects: [],
    readinessTimeoutMs: 60_000,
    barrier: () => {},
    ...options,
  })
  return { result, tookMs: performance.now() - began }
}
const reportOf = (result: StartResult) => {
  if (result.kind !== 'started') throw new Error(`not started: ${result.kind}`)
  return result.report
}

describe('一行启动失败：立刻收场，不等就绪的期限', () => {
  it('失败的行在卡住的行之前：结局是 failed，卡住的行被点名', async () => {
    const { result, tookMs } = await start({
      rows: [row('fine', fine), row('broken', fails), row('stuck', hangs), row('late', fine)],
    })
    const report = reportOf(result)
    expect(tookMs).toBeLessThan(5_000)
    expect(report.outcome).toBe('failed')
    expect(report.exitCode).toBe(3)
    expect(report.stuck).toEqual(['stuck'])
    expect(report.rows.map(each => [each.id, each.state])).toEqual([
      ['fine', 'ACTIVE'],
      ['broken', 'FAILED'],
      ['stuck', 'LOADING'],
      ['late', 'ACTIVE'],
    ])
  })

  it('卡住的行在失败的行之前：一样立刻收场', async () => {
    const later: Plugin = {
      name: 'later',
      apply: () => new Promise((_, reject) => setTimeout(() => reject(new Error('late')), 50)),
    }
    const { result, tookMs } = await start({ rows: [row('slow-fail', later), row('stuck', hangs)] })
    // The loader waits for a row before it loads the next: the stuck row is loaded once the first has failed.
    expect(tookMs).toBeLessThan(5_000)
    expect(reportOf(result)).toMatchObject({ outcome: 'failed', exitCode: 3, stuck: ['stuck'] })
  })

  it('没有失败的行：卡住的行等到期限，结局是 readiness-timeout', async () => {
    const { result, tookMs } = await start({
      rows: [row('fine', fine), row('stuck', hangs)],
      readinessTimeoutMs: 150,
    })
    expect(tookMs).toBeGreaterThanOrEqual(140)
    expect(reportOf(result)).toMatchObject({
      outcome: 'readiness-timeout',
      exitCode: 4,
      stuck: ['stuck'],
    })
  })
})

describe('装行之前的两步也在启动的期限之内', () => {
  it('准备目录不返回：到期限答 preparation-failed，写明是期限', async () => {
    const { result, tookMs } = await start({
      rows: [row('fine', fine)],
      prepare: () => never,
      readinessTimeoutMs: 120,
    })
    expect(tookMs).toBeLessThan(5_000)
    expect(result).toMatchObject({ kind: 'preparation-failed', exitCode: 3, deadline: true })
  })

  it('入口对象的安装不返回：到期限答 entry-failed，点名那个对象', async () => {
    const stuck: EntryObject = {
      name: 'stuckObject' as ServiceName,
      implementation: 'real',
      registersFor: [],
      install: () => never,
    }
    const { result } = await start({
      rows: [row('fine', fine)],
      entryObjects: [stuck],
      readinessTimeoutMs: 120,
    })
    expect(result).toMatchObject({
      kind: 'entry-failed',
      exitCode: 3,
      name: 'stuckObject',
      deadline: true,
    })
  })
})

describe('装载期间的停止请求', () => {
  it('一行还在装载时请求停止：不等它，结局是 stopped，后面的行不再装', async () => {
    const stop = new AbortController()
    setTimeout(() => stop.abort('SIGTERM'), 30)
    const { result, tookMs } = await start({
      rows: [row('fine', fine), row('stuck', hangs), row('never-loaded', fine)],
      stop: stop.signal,
    })
    expect(tookMs).toBeLessThan(5_000)
    const report = reportOf(result)
    expect(report).toMatchObject({ outcome: 'stopped', exitCode: 4, stuck: ['stuck'] })
    expect(report.rows.map(each => each.id)).toEqual(['fine', 'stuck'])
  })

  it('装载之前就请求了停止：一行都不装', async () => {
    const stop = new AbortController()
    stop.abort('SIGTERM')
    let prepared = false
    const { result } = await start({
      rows: [row('fine', fine)],
      stop: stop.signal,
      prepare: () => {
        prepared = true
      },
    })
    expect(prepared).toBe(false)
    expect(reportOf(result)).toMatchObject({ outcome: 'stopped', exitCode: 4, rows: [] })
  })

  it('全部行已经 ACTIVE 之后才到的停止请求：结局仍是 ready', async () => {
    const stop = new AbortController()
    const { result } = await start({ rows: [row('fine', fine)], stop: stop.signal })
    stop.abort('SIGTERM')
    expect(reportOf(result)).toMatchObject({ outcome: 'ready', exitCode: 0, stuck: [] })
  })
})
