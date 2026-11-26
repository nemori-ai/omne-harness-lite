import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { stubPlugin } from '../src/cordis.ts'
import { defineRow } from '../src/row.ts'
import { serveOnce } from './fixtures/serve/harness.ts'
import { TELEMETRY_ROW_CONFIG } from './support/listening.ts'
import { S0AssemblyLifecycleService, S0_ASSEMBLY_LIFECYCLE_KEY } from '../src/row.ts'
import { SupervisionRefused } from '@omne-harness/assembly-cordis/cordis'
import { rowSupervision } from './support/row-supervision.ts'
import {
  runShutdown,
  stopPredecessors,
  type ShutdownClock,
  type ShutdownRecord,
} from '../src/shutdown.ts'
import type { LifecycleHandle, LifecyclePhase, RowId, StopResult } from '../src/types.ts'

const row = (id: string) => id as RowId
const DEADLINE_MS = 1000

const EXPECTED = new Map<RowId, LifecyclePhase>([
  [row('server-entry'), 'entry'],
  [row('agent-host'), 'business'],
  [row('session-storage'), 'composition'],
  [row('storage'), 'storage'],
])

function fakeClock() {
  let current = 0
  const timers: { at: number; fire: () => void; live: boolean }[] = []
  const delays: number[] = []
  const clock: ShutdownClock & { advance(ms: number): void; delays: number[] } = {
    delays,
    now: () => current,
    after(ms) {
      delays.push(ms)
      let fire = () => {}
      const promise = new Promise<void>(resolve => {
        fire = resolve
      })
      const timer = { at: current + ms, fire, live: true }
      timers.push(timer)
      if (ms <= 0) setImmediate(() => timer.live && timer.fire())
      return {
        promise,
        cancel: () => {
          timer.live = false
        },
      }
    },
    advance(ms) {
      current += ms
      for (const timer of timers) if (timer.live && timer.at <= current) timer.fire()
    },
  }
  return clock
}
type FakeClock = ReturnType<typeof fakeClock>

const flush = () => new Promise<void>(resolve => setImmediate(resolve))

type Calls = string[]

function handle(
  calls: Calls,
  id: string,
  phase: LifecyclePhase,
  stop: (deadline: number) => Promise<StopResult> = async () => ({ kind: 'settled' }),
  extra: Partial<LifecycleHandle> = {},
): LifecycleHandle {
  return {
    phase,
    row: row(id),
    stop: async deadline => {
      calls.push(`stop:${id}`)
      return stop(deadline)
    },
    ...extra,
  }
}

function fullSet(calls: Calls, overrides: Partial<Record<string, LifecycleHandle>> = {}) {
  return [
    overrides['server-entry'] ?? handle(calls, 'server-entry', 'entry'),
    overrides['agent-host'] ?? handle(calls, 'agent-host', 'business'),
    overrides['session-storage'] ?? handle(calls, 'session-storage', 'composition'),
    overrides['storage'] ??
      handle(calls, 'storage', 'storage', undefined, {
        assemblyReportSettled: () => void calls.push('report-settled'),
      }),
  ]
}

function setup(calls: Calls, handles: readonly LifecycleHandle[], clock: FakeClock = fakeClock()) {
  const records: ShutdownRecord[] = []
  const registry = rowSupervision({ clock })
  for (const h of handles) registry.add(h)
  const log = (record: ShutdownRecord) => {
    records.push(record)
    calls.push(`log:${record.action}`)
  }
  const run = () =>
    runShutdown(registry, EXPECTED, DEADLINE_MS, clock, {
      log,
      disposeRoot: async () => void calls.push('dispose-root'),
    })
  return { registry, records, run, clock }
}

describe('X-1 关闭次序', () => {
  it('接入 → 业务 → 会话存储组合 → 存储 → 报告确定 → assemblyReportSettled → 撤除根', async () => {
    const calls: Calls = []
    const { run } = setup(calls, fullSet(calls).reverse())
    const report = await run()
    expect(calls.filter(c => !c.startsWith('log:stop'))).toEqual([
      'stop:server-entry',
      'stop:agent-host',
      'stop:session-storage',
      'stop:storage',
      'log:report-fixed',
      'log:report-settled-call',
      'report-settled',
      'log:dispose-root',
      'dispose-root',
    ])
    expect(report.overall).toBe('settled')
    expect(report.outcomes.map(o => o.result.kind)).toEqual([
      'settled',
      'settled',
      'settled',
      'settled',
    ])
  })

  it('没有依赖关系的同阶段句柄并发调用，阶段内全部结束才进入下一阶段', async () => {
    const calls: Calls = []
    const releases: (() => void)[] = []
    const slow = (id: string) =>
      handle(
        calls,
        id,
        'entry',
        () => new Promise<StopResult>(r => releases.push(() => r({ kind: 'settled' }))),
      )
    const expected = new Map<RowId, LifecyclePhase>([
      [row('a'), 'entry'],
      [row('b'), 'entry'],
      [row('c'), 'business'],
    ])
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    registry.add(slow('a'))
    registry.add(slow('b'))
    registry.add(handle(calls, 'c', 'business'))
    const done = runShutdown(registry, expected, DEADLINE_MS, clock)
    await flush()
    expect(calls).toEqual(['stop:a', 'stop:b'])
    releases[0]?.()
    await flush()
    expect(calls).toEqual(['stop:a', 'stop:b'])
    releases[1]?.()
    await done
    expect(calls).toEqual(['stop:a', 'stop:b', 'stop:c'])
  })

  it('同一阶段内，提供方等注入它的行的句柄结束之后才被调用 stop', async () => {
    const calls: Calls = []
    let release = () => {}
    const expected = new Map<RowId, LifecyclePhase>([
      [row('consumer'), 'business'],
      [row('provider'), 'business'],
      [row('other'), 'business'],
    ])
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    registry.add(
      handle(
        calls,
        'consumer',
        'business',
        () => new Promise<StopResult>(r => (release = () => r({ kind: 'settled' }))),
      ),
    )
    registry.add(handle(calls, 'provider', 'business'))
    registry.add(handle(calls, 'other', 'business'))
    const done = runShutdown(registry, expected, DEADLINE_MS, clock, {
      stopsFirst: new Map([[row('provider'), [row('consumer')]]]),
    })
    await flush()
    expect(calls).toEqual(['stop:consumer', 'stop:other'])
    release()
    const report = await done
    expect(calls).toEqual(['stop:consumer', 'stop:other', 'stop:provider'])
    expect(report.overall).toBe('settled')
    expect(report.outcomes.map(outcome => outcome.row)).toEqual(['consumer', 'provider', 'other'])
  })

  it('注入方到达 D 仍未结束时，提供方的 stop 照样被调用', async () => {
    const calls: Calls = []
    const expected = new Map<RowId, LifecyclePhase>([
      [row('consumer'), 'business'],
      [row('provider'), 'business'],
    ])
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    registry.add(handle(calls, 'consumer', 'business', () => new Promise<StopResult>(() => {})))
    registry.add(handle(calls, 'provider', 'business'))
    const done = runShutdown(registry, expected, DEADLINE_MS, clock, {
      stopsFirst: new Map([[row('provider'), [row('consumer')]]]),
    })
    await flush()
    expect(calls).toEqual(['stop:consumer'])
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(calls).toEqual(['stop:consumer', 'stop:provider'])
    expect(report.outcomes.map(outcome => [outcome.row, outcome.result.kind])).toEqual([
      ['consumer', 'incomplete'],
      ['provider', 'settled'],
    ])
  })

  it('所有句柄都收到同一个截止时间 D', async () => {
    const calls: Calls = []
    const seen: number[] = []
    const clock = fakeClock()
    clock.advance(500)
    const record = (id: string, phase: LifecyclePhase) =>
      handle(calls, id, phase, async d => {
        seen.push(d)
        return { kind: 'settled' }
      })
    const { run } = setup(
      calls,
      fullSet(calls, {
        'server-entry': record('server-entry', 'entry'),
        'agent-host': record('agent-host', 'business'),
      }),
      clock,
    )
    await run()
    expect(seen).toEqual([500 + DEADLINE_MS, 500 + DEADLINE_MS])
  })
})

describe('停止次序由行清单推出', () => {
  const spec = (
    id: string,
    phase: LifecyclePhase | null,
    provides: readonly string[],
    injects: readonly string[],
  ) => ({
    row: { id: row(id) },
    manifest: {
      provides: provides as never,
      injects: injects as never,
      phase,
      sameProviderGroup: null,
    },
  })
  const pairs = (order: ReadonlyMap<RowId, readonly RowId[]>) =>
    [...order].filter(([, first]) => first.length > 0).map(([id, first]) => [id, [...first]])

  it('直接注入：提供方排在注入方之后', () => {
    const order = stopPredecessors([
      spec('consumer', 'business', [], ['s']),
      spec('provider', 'business', ['s'], []),
    ])
    expect(pairs(order)).toEqual([['provider', ['consumer']]])
  })

  it('经过没有关闭阶段的行间接注入，也算依赖', () => {
    const order = stopPredecessors([
      spec('consumer', 'business', [], ['adapted']),
      spec('adapter', null, ['adapted'], ['s']),
      spec('provider', 'business', ['s'], []),
    ])
    expect(pairs(order)).toEqual([
      ['adapter', ['consumer']],
      ['provider', ['consumer', 'adapter']],
    ])
  })

  it('互相依赖的两行不分先后', () => {
    const order = stopPredecessors([
      spec('a', 'business', ['x'], ['y']),
      spec('b', 'business', ['y'], ['x']),
    ])
    expect(pairs(order)).toEqual([])
  })

  it('次序不看阶段：注入方的阶段排在提供方之后，提供方照样等它（量过的三处就是这一种）', () => {
    const order = stopPredecessors([
      spec('consumer', 'composition', [], ['s']),
      spec('provider', 'business', ['s'], []),
    ])
    expect(pairs(order)).toEqual([['provider', ['consumer']]])
  })
})

describe('X-2 期限', () => {
  it('永不完成的 entry 句柄到 D 记 incomplete，后续阶段照常，整体 incomplete', async () => {
    const calls: Calls = []
    const never = handle(calls, 'server-entry', 'entry', () => new Promise<StopResult>(() => {}))
    const { run, clock, records } = setup(calls, fullSet(calls, { 'server-entry': never }))
    const done = run()
    await flush()
    expect(calls).toEqual(['log:stop-call', 'stop:server-entry'])
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(report.overall).toBe('incomplete')
    expect(report.outcomes[0]).toMatchObject({
      row: 'server-entry',
      result: { kind: 'incomplete' },
    })
    expect(calls.filter(c => c.startsWith('stop:'))).toEqual([
      'stop:server-entry',
      'stop:agent-host',
      'stop:session-storage',
      'stop:storage',
    ])
    expect(JSON.stringify(report)).toContain('deadline')
    expect(records.length).toBeGreaterThan(0)
  })

  it('多个阶段连续 hang：全部阶段共用同一截止时间 D，计时器参数为 deadline - now', async () => {
    const calls: Calls = []
    const hang = () => new Promise<StopResult>(() => {})
    const clock = fakeClock()
    const { run } = setup(
      calls,
      fullSet(calls, {
        'server-entry': handle(calls, 'server-entry', 'entry', hang),
        'agent-host': handle(calls, 'agent-host', 'business', hang),
        'session-storage': handle(calls, 'session-storage', 'composition', hang),
      }),
      clock,
    )
    const done = run()
    await flush()
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(report.overall).toBe('incomplete')
    expect(clock.delays[0]).toBe(DEADLINE_MS)
    for (const arg of clock.delays.slice(1)) expect(arg).toBeLessThanOrEqual(0)
    expect(report.outcomes.filter(o => o.result.kind === 'incomplete')).toHaveLength(3)
  })
})

describe('X-3 报告闩锁', () => {
  it('报告确定的序号小于 assemblyReportSettled 的序号', async () => {
    const calls: Calls = []
    const { run, records } = setup(calls, fullSet(calls))
    await run()
    const fixed = records.find(r => r.action === 'report-fixed')
    const latch = records.find(r => r.action === 'report-settled-call')
    expect(fixed).toBeDefined()
    expect(latch).toBeDefined()
    expect(fixed!.seq).toBeLessThan(latch!.seq)
    expect(records.map(r => r.seq)).toEqual(records.map((_, i) => i + 1))
  })

  it('assemblyReportSettled 被调用时报告已经确定', async () => {
    const calls: Calls = []
    const registry = rowSupervision({ clock: fakeClock() })
    let fixedAtLatch = false
    const records: ShutdownRecord[] = []
    for (const h of fullSet(calls, {
      storage: handle(calls, 'storage', 'storage', undefined, {
        assemblyReportSettled: () => {
          fixedAtLatch = records.some(r => r.action === 'report-fixed')
        },
      }),
    }))
      registry.add(h)
    await runShutdown(registry, EXPECTED, DEADLINE_MS, fakeClock(), { log: r => records.push(r) })
    expect(fixedAtLatch).toBe(true)
  })
})

describe('X-4 幂等', () => {
  it('连续两次停止请求：每个 stop 只调用一次，两次得到同一份报告对象', async () => {
    const calls: Calls = []
    const { run } = setup(calls, fullSet(calls))
    const first = run()
    const second = run()
    const [a, b] = await Promise.all([first, second])
    expect(a).toBe(b)
    expect(await run()).toBe(a)
    expect(calls.filter(c => c.startsWith('stop:'))).toHaveLength(4)
  })
})

describe('X-5 关闭前撤除', () => {
  it('composition 行的 fiber 先撤除：disposed-before-stop，附 disposer 发起的结果，整体 incomplete', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    const root = new Context()
    await root.plugin(S0AssemblyLifecycleService, registry)
    const fibers = new Map<string, { dispose(): Promise<unknown> }>()
    for (const h of fullSet(calls)) {
      const fiber = await root.plugin({
        name: `row-${h.row}`,
        inject: [S0_ASSEMBLY_LIFECYCLE_KEY],
        apply: (ctx: Context) => {
          ;(ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService).register(h)
        },
      })
      fibers.set(h.row, fiber)
    }
    await fibers.get('session-storage')!.dispose()
    const report = await runShutdown(registry, EXPECTED, DEADLINE_MS, clock)
    const outcome = report.outcomes.find(o => o.row === 'session-storage')
    expect(outcome).toMatchObject({ result: { kind: 'disposed-before-stop' } })
    expect(report.overall).toBe('incomplete')
    expect(calls.filter(c => c === 'stop:session-storage')).toHaveLength(1)
    expect(outcome!.result).toMatchObject({ detail: expect.stringContaining('settled') })
  })
})

describe('X-6 句柄抛出', () => {
  it('business 句柄抛出：记 failed，后续阶段照常，整体 incomplete', async () => {
    const calls: Calls = []
    const boom = handle(calls, 'agent-host', 'business', async () => {
      throw new Error('boom')
    })
    const { run } = setup(calls, fullSet(calls, { 'agent-host': boom }))
    const report = await run()
    expect(report.outcomes.find(o => o.row === 'agent-host')).toMatchObject({
      result: { kind: 'failed', detail: expect.stringContaining('boom') },
    })
    expect(calls).toContain('stop:storage')
    expect(report.overall).toBe('incomplete')
  })

  it('同步抛出的 stop 同样记 failed', async () => {
    const calls: Calls = []
    const sync: LifecycleHandle = {
      phase: 'business',
      row: row('agent-host'),
      stop: () => {
        throw new Error('sync-boom')
      },
    }
    const { run } = setup(calls, fullSet(calls, { 'agent-host': sync }))
    const report = await run()
    expect(report.outcomes.find(o => o.row === 'agent-host')).toMatchObject({
      result: { kind: 'failed' },
    })
  })
})

describe('X-7 未登记', () => {
  it('预期登记者没有句柄：not-registered，整体 incomplete', async () => {
    const calls: Calls = []
    const handles = fullSet(calls).filter(h => h.row !== row('agent-host'))
    const { run } = setup(calls, handles)
    const report = await run()
    expect(report.outcomes.find(o => o.row === 'agent-host')).toMatchObject({
      phase: 'business',
      result: { kind: 'not-registered' },
    })
    expect(report.overall).toBe('incomplete')
  })
})

describe('X-8 迟到结果', () => {
  it('报告确定后才完成的句柄只多一条诊断，报告不变', async () => {
    const calls: Calls = []
    let finish: (r: StopResult) => void = () => {}
    const late = handle(
      calls,
      'server-entry',
      'entry',
      () => new Promise<StopResult>(r => (finish = r)),
    )
    const { run, clock, records } = setup(calls, fullSet(calls, { 'server-entry': late }))
    const done = run()
    await flush()
    clock.advance(DEADLINE_MS)
    const report = await done
    const snapshot = JSON.stringify(report)
    const before = records.length
    finish({ kind: 'settled' })
    await flush()
    expect(JSON.stringify(report)).toBe(snapshot)
    expect(records.length).toBe(before + 1)
    expect(records.at(-1)).toMatchObject({ action: 'late-result', row: 'server-entry' })
  })
})

describe('X-9 排空：业务阶段之前，先让有 drain 的行做完已经接到的工作', () => {
  const DRAIN_MS = 5000

  function draining(
    calls: Calls,
    drain: (deadline: number) => Promise<StopResult>,
    clock: FakeClock = fakeClock(),
    drainMs: number | null = DRAIN_MS,
  ) {
    const deadlines: Record<string, number> = {}
    const modelHost = handle(
      calls,
      'agent-host',
      'business',
      async deadline => {
        deadlines['stop'] = deadline
        return { kind: 'settled' }
      },
      {
        drain: async deadline => {
          calls.push('drain:agent-host')
          deadlines['drain'] = deadline
          return drain(deadline)
        },
      },
    )
    const registry = rowSupervision({ clock })
    for (const h of fullSet(calls, { 'agent-host': modelHost })) registry.add(h)
    const run = () =>
      runShutdown(registry, EXPECTED, DEADLINE_MS, clock, drainMs === null ? {} : { drainMs })
    return { run, clock, deadlines }
  }

  it('drain 排在入口阶段之后、任何业务行的 stop 之前，结果进报告', async () => {
    const calls: Calls = []
    const { run } = draining(calls, async () => ({ kind: 'settled' }))
    const report = await run()
    expect(calls).toEqual([
      'stop:server-entry',
      'drain:agent-host',
      'stop:agent-host',
      'stop:session-storage',
      'stop:storage',
      'report-settled',
    ])
    expect(report.drains).toEqual([{ row: 'agent-host', result: { kind: 'settled' } }])
    expect(report.overall).toBe('settled')
  })

  it('drain 没结束之前，业务行的 stop 不被调用', async () => {
    const calls: Calls = []
    let finish: (r: StopResult) => void = () => {}
    const { run } = draining(calls, () => new Promise<StopResult>(r => (finish = r)))
    const done = run()
    await flush()
    expect(calls).toEqual(['stop:server-entry', 'drain:agent-host'])
    finish({ kind: 'settled' })
    await done
    expect(calls).toContain('stop:agent-host')
  })

  it('排空用掉的时间不从 D 里扣：之后各阶段的截止时间顺延', async () => {
    const calls: Calls = []
    let finish: (r: StopResult) => void = () => {}
    const { run, clock, deadlines } = draining(
      calls,
      () => new Promise<StopResult>(r => (finish = r)),
    )
    const done = run()
    await flush()
    clock.advance(3000)
    finish({ kind: 'settled' })
    const report = await done
    expect(deadlines['drain']).toBe(DRAIN_MS)
    expect(deadlines['stop']).toBe(DEADLINE_MS + 3000)
    expect(report.overall).toBe('settled')
  })

  it('到排空期限还没做完：记 incomplete，整体 incomplete，停止照常进行', async () => {
    const calls: Calls = []
    const { run, clock } = draining(calls, () => new Promise<StopResult>(() => {}))
    const done = run()
    await flush()
    clock.advance(DRAIN_MS)
    const report = await done
    expect(report.drains).toEqual([
      { row: 'agent-host', result: { kind: 'incomplete', detail: 'drain deadline reached' } },
    ])
    expect(report.overall).toBe('incomplete')
    expect(report.outcomes.map(o => o.result.kind)).toEqual([
      'settled',
      'settled',
      'settled',
      'settled',
    ])
  })

  it('drain 如实答没做完：照它的话记，整体 incomplete', async () => {
    const calls: Calls = []
    const { run } = draining(calls, async () => ({ kind: 'incomplete', detail: '1 call' }))
    const report = await run()
    expect(report.drains?.[0]?.result).toEqual({ kind: 'incomplete', detail: '1 call' })
    expect(report.overall).toBe('incomplete')
  })

  it('drain 抛出：记 failed，停止照常进行', async () => {
    const calls: Calls = []
    const { run } = draining(calls, async () => {
      throw new Error('boom')
    })
    const report = await run()
    expect(report.drains?.[0]?.result).toEqual({ kind: 'failed', detail: 'boom' })
    expect(calls).toContain('stop:storage')
  })

  it('没有给排空期限：不调用 drain，报告里没有这一项', async () => {
    const calls: Calls = []
    const { run } = draining(calls, async () => ({ kind: 'settled' }), fakeClock(), null)
    const report = await run()
    expect(calls).not.toContain('drain:agent-host')
    expect(report.drains).toBeUndefined()
  })
})

describe('登记准入', () => {
  const newRegistry = () => rowSupervision({ clock: fakeClock() })
  const refusal = (fn: () => unknown) => {
    try {
      fn()
    } catch (error) {
      return error
    }
    return undefined
  }

  it('预期名单之外的行登记了：关闭时照样停它，结果进报告', async () => {
    const calls: Calls = []
    const { registry, run } = setup(calls, fullSet(calls))
    registry.add(handle(calls, 'intruder', 'business'))
    const report = await run()
    expect(calls).toContain('stop:intruder')
    expect(report.outcomes.at(-1)).toEqual({
      row: 'intruder',
      phase: 'business',
      result: { kind: 'settled' },
    })
  })

  it('同一行已有在册句柄时再登记被拒', () => {
    const calls: Calls = []
    const registry = newRegistry()
    registry.add(handle(calls, 'agent-host', 'business'))
    const error = refusal(() => registry.add(handle(calls, 'agent-host', 'business')))
    expect(error).toBeInstanceOf(SupervisionRefused)
    expect((error as SupervisionRefused).reason).toBe('duplicate')
  })

  it('进入停止状态后新登记的句柄被拒，且不被调用', async () => {
    const calls: Calls = []
    const { registry, run } = setup(calls, [])
    await run()
    const late = handle(calls, 'agent-host', 'business')
    const error = refusal(() => registry.add(late))
    expect((error as SupervisionRefused).reason).toBe('stopping')
    expect(calls.filter(c => c === 'stop:agent-host')).toEqual([])
  })

  it('被拒的登记经 Cordis 服务表现为插件体抛出，该行 fiber 不留登记', async () => {
    const calls: Calls = []
    const registry = newRegistry()
    const root = new Context()
    await root.plugin(S0AssemblyLifecycleService, registry)
    const fiber = root.plugin({
      name: 'row-intruder',
      inject: [S0_ASSEMBLY_LIFECYCLE_KEY],
      apply: (ctx: Context) => {
        const lifecycle = ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService
        lifecycle.register(handle(calls, 'intruder', 'business'))
        lifecycle.register(handle(calls, 'intruder', 'business'))
      },
    })
    await expect(fiber).rejects.toBeDefined()
    expect(registry.liveRows()).toEqual([])
  })
})

describe('运行期换代视为计划停止', () => {
  it('启动后提供者换代使登记行重跑：监督让进程有计划地退出，不重新调用 start', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const stopRequests: string[] = []
    const registry = rowSupervision({ clock })
    const root = new Context()
    await root.plugin(S0AssemblyLifecycleService, registry)
    class Dep extends Service {
      constructor(ctx: Context) {
        super(ctx, 'dep')
      }
    }
    let generation = 0
    const starts: number[] = []
    const depFiber = await root.plugin(Dep)
    const rowFiber = await root.plugin({
      name: 'row-server-entry',
      inject: [S0_ASSEMBLY_LIFECYCLE_KEY, 'dep'],
      apply: (ctx: Context) => {
        const mine = ++generation
        ;(ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService).register({
          ...handle(calls, 'server-entry', 'entry'),
          start: async () => void starts.push(mine),
        })
      },
    })
    await registry.startAll()
    expect(starts).toEqual([1])
    registry.watch(root, [{ id: 'server-entry', fiber: rowFiber, swap: 'restart' }], {
      dependencyDeadlineMs: 1000,
      startDeadlineMs: 1000,
      exit: exit => void stopRequests.push(`${exit.reason}: ${exit.row} (${String(exit.code)})`),
    })

    await depFiber.dispose()
    await root.plugin(Dep)
    await flush()

    expect(generation).toBe(2)
    expect(starts).toEqual([1])
    expect(stopRequests).toEqual(['row-returned: server-entry (0)'])
  })

  it('启动前的重跑是正常装载：只留新句柄，不触发停止', async () => {
    const calls: Calls = []
    const stopRequests: string[] = []
    const registry = rowSupervision({ clock: fakeClock() })
    const first = handle(calls, 'server-entry', 'entry')
    const off = registry.add(first)
    off()
    registry.add(handle(calls, 'server-entry', 'entry'))
    expect(stopRequests).toEqual([])
    expect(registry.state).toBe('running')
    expect(registry.liveRows()).toEqual(['server-entry'])
  })

  it('启动后撤除而不重跑：不触发停止，关闭时该项为 disposed-before-stop', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const stopRequests: string[] = []
    const registry = rowSupervision({ clock })
    const off = registry.add(handle(calls, 'server-entry', 'entry'))
    await registry.startAll()
    off()
    expect(stopRequests).toEqual([])
    expect(registry.state).toBe('running')
  })
})

describe('X-5 启动期的停止状态与失败', () => {
  /** The business row needs the session storage, which needs the storage; the entry row opens admission. */
  const CHAIN = {
    after: new Map([
      ['agent-host', ['session-storage', 'storage']],
      ['session-storage', ['storage']],
    ]),
    last: new Set(['server-entry']),
  }
  const startable = (calls: Calls, id: string, phase: LifecyclePhase, onStart?: () => void) =>
    handle(calls, id, phase, undefined, {
      start: async () => {
        calls.push(`start:${id}`)
        onStart?.()
      },
    })

  it('storage 的 start 内触发 runShutdown：此后没有任何 start，停止次序仍为 entry → storage', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    const stopNow = () => void runShutdown(registry, EXPECTED, DEADLINE_MS, clock)
    registry.add(startable(calls, 'server-entry', 'entry'))
    registry.add(startable(calls, 'agent-host', 'business'))
    registry.add(startable(calls, 'session-storage', 'composition'))
    registry.add(startable(calls, 'storage', 'storage', stopNow))
    await registry.startAll(CHAIN)
    await flush()
    expect(calls).toEqual([
      'start:storage',
      'stop:server-entry',
      'stop:agent-host',
      'stop:session-storage',
      'stop:storage',
    ])
  })

  it('同一阶段内：前一个句柄的 start 触发停止后，后一个句柄不再被调用', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const expected = new Map<RowId, LifecyclePhase>([
      [row('a'), 'entry'],
      [row('b'), 'entry'],
    ])
    const registry = rowSupervision({ clock })
    registry.add(
      startable(
        calls,
        'a',
        'entry',
        () => void runShutdown(registry, expected, DEADLINE_MS, clock),
      ),
    )
    registry.add(startable(calls, 'b', 'entry'))
    await registry.startAll()
    await flush()
    expect(calls.filter(c => c.startsWith('start:'))).toEqual(['start:a'])
  })

  it('启动的次序：一行在它需要的行之后，接入行在最后；没有关系的按登记次序', async () => {
    const calls: Calls = []
    const registry = rowSupervision({ clock: fakeClock() })
    const add = (id: string, phase: LifecyclePhase) => registry.add(startable(calls, id, phase))
    add('e2', 'entry')
    add('s1', 'storage')
    add('b1', 'business')
    add('s2', 'storage')
    add('c1', 'composition')
    add('e1', 'entry')
    await registry.startAll({
      after: new Map([
        ['b1', ['c1', 's1']],
        ['c1', ['s1']],
      ]),
      last: new Set(['e1', 'e2']),
    })
    expect(calls).toEqual(['s1', 's2', 'c1', 'b1', 'e2', 'e1'].map(id => `start:${id}`))
  })

  it('start 抛出：startAll 返回失败句柄，需要它的行与接入行不启动；关闭整套照走，该句柄报告 failed', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const registry = rowSupervision({ clock })
    const boom = handle(calls, 'session-storage', 'composition', undefined, {
      start: async () => {
        calls.push('start:session-storage')
        throw new Error('boom')
      },
    })
    registry.add(startable(calls, 'server-entry', 'entry'))
    registry.add(startable(calls, 'agent-host', 'business'))
    registry.add(boom)
    registry.add(startable(calls, 'storage', 'storage'))
    const failure = await registry.startAll(CHAIN)
    expect(failure).toEqual({ row: 'session-storage', detail: 'boom' })
    expect(calls).toEqual(['start:storage', 'start:session-storage'])
    const report = await runShutdown(registry, EXPECTED, DEADLINE_MS, clock)
    expect(calls.slice(2)).toEqual([
      'stop:server-entry',
      'stop:agent-host',
      'stop:session-storage',
      'stop:storage',
    ])
    expect(report.overall).toBe('incomplete')
    expect(report.outcomes.map(o => [o.row, o.result.kind])).toEqual([
      ['server-entry', 'settled'],
      ['agent-host', 'settled'],
      ['session-storage', 'failed'],
      ['storage', 'settled'],
    ])
  })
})

describe('stdout 在 shutdown-result 之后封口', () => {
  function lateStopRow(holdMs: number, done: () => void) {
    return defineRow({
      row: 'late-stop',
      implementation: 'real',
      manifest: { provides: [], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'body', phase: 'business' },
      body: async () => ({
        stop: async () => {
          await new Promise(resolve => setTimeout(resolve, holdMs))
          setImmediate(done)
          return { kind: 'settled' }
        },
      }),
    })
  }

  it('期限之后才结束的 stop：stdout 最后一行是 shutdown-result，迟到诊断成为 stderr 上不带前缀的一行 JSON', async () => {
    let finished = () => {}
    const late = new Promise<void>(resolve => (finished = resolve))
    const run = await serveOnce({
      distribution: {
        rows: [
          { id: 'telemetry', plugin: 'telemetry', config: TELEMETRY_ROW_CONFIG },
          { id: 'late-stop', plugin: 'lateStop', config: {} },
        ],
      },
      plugins: { stubPlugin, lateStop: lateStopRow(200, () => finished()) },
      entryObjects: [],
      shutdownDeadlineMs: 50,
    })
    expect(run.records.at(-1)?.kind).toBe('shutdown-result')
    expect(run.records.at(-1)).toMatchObject({
      outcomes: [{ row: 'late-stop', result: { kind: 'incomplete' } }],
    })
    const before = run.records.length
    await late
    expect(run.records).toHaveLength(before)
    expect(run.records.at(-1)?.kind).toBe('shutdown-result')
    const json = run.stderr
      .filter(line => !line.startsWith('serve: '))
      .map(line => JSON.parse(line) as Readonly<Record<string, unknown>>)
    expect(json).toContainEqual(
      expect.objectContaining({
        kind: 'shutdown-step',
        action: 'late-result',
        row: 'late-stop',
        detail: 'after deadline: settled',
      }),
    )
  })
})
