// 有序关闭（s0-spec-r2 §9）：登记服务与关闭协调器。句柄是替身，时钟是注入的假时钟；
// 撤除与换代用例经真实 Cordis 4.0.4 的 fiber。
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  LifecycleRefusedError,
  LifecycleRegistry,
  S0AssemblyLifecycleService,
  S0_ASSEMBLY_LIFECYCLE_KEY,
} from '../src/lifecycle.ts'
import { runShutdown, type ShutdownClock, type ShutdownRecord } from '../src/shutdown.ts'
import type { LifecycleHandle, LifecyclePhase, RowId, StopResult } from '../src/types.ts'

const row = (id: string) => id as RowId
const DEADLINE_MS = 1000

const EXPECTED = new Map<RowId, LifecyclePhase>([
  [row('server-entry'), 'entry'],
  [row('agent-host'), 'business'],
  [row('session-storage'), 'composition'],
  [row('storage'), 'storage'],
])

/** 手动推进的单调时钟；`after(ms <= 0)` 在下一个宏任务触发，让同步可得的结果先到。 */
function fakeClock() {
  let current = 0
  const timers: { at: number; fire: () => void; live: boolean }[] = []
  const delays: number[] = [] // 每次 after 收到的参数
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
  const registry = new LifecycleRegistry({ expected: EXPECTED, clock, requestStop: () => {} })
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
    // 倒序登记，证明次序来自阶段而不是登记次序。
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

  it('同一阶段的句柄并发调用，阶段内全部结束才进入下一阶段', async () => {
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
    const registry = new LifecycleRegistry({ expected, clock, requestStop: () => {} })
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
    // 超时写入报告，不是只留在日志里。
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
    clock.advance(DEADLINE_MS) // 只推进一次：D 一到，之后各阶段的计时器都已过期
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
    const registry = new LifecycleRegistry({
      expected: EXPECTED,
      clock: fakeClock(),
      requestStop: () => {},
    })
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
    const registry = new LifecycleRegistry({ expected: EXPECTED, clock, requestStop: () => {} })
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
    // 撤除时 disposer 发起了一次停止，结果作诊断；协调者没有再调用它。
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

describe('N-7 登记准入', () => {
  const newRegistry = () =>
    new LifecycleRegistry({ expected: EXPECTED, clock: fakeClock(), requestStop: () => {} })
  const refusal = (fn: () => unknown) => {
    try {
      fn()
    } catch (error) {
      return error
    }
    return undefined
  }

  it('预期名单之外的行登记被拒', () => {
    const calls: Calls = []
    const error = refusal(() => newRegistry().add(handle(calls, 'intruder', 'business')))
    expect(error).toBeInstanceOf(LifecycleRefusedError)
    expect((error as LifecycleRefusedError).reason).toBe('unexpected-row')
  })

  it('阶段与预期不符的登记被拒', () => {
    const calls: Calls = []
    const error = refusal(() => newRegistry().add(handle(calls, 'agent-host', 'storage')))
    expect((error as LifecycleRefusedError).reason).toBe('phase-mismatch')
  })

  it('同一行已有在册句柄时再登记被拒', () => {
    const calls: Calls = []
    const registry = newRegistry()
    registry.add(handle(calls, 'agent-host', 'business'))
    const error = refusal(() => registry.add(handle(calls, 'agent-host', 'business')))
    expect((error as LifecycleRefusedError).reason).toBe('duplicate')
  })

  it('进入停止状态后新登记的句柄被拒，且不被调用', async () => {
    const calls: Calls = []
    const { registry, run } = setup(calls, [])
    await run()
    const late = handle(calls, 'agent-host', 'business')
    const error = refusal(() => registry.add(late))
    expect((error as LifecycleRefusedError).reason).toBe('stopping')
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
        ;(ctx.get(S0_ASSEMBLY_LIFECYCLE_KEY) as S0AssemblyLifecycleService).register(
          handle(calls, 'intruder', 'business'),
        )
      },
    })
    await expect(fiber).rejects.toBeDefined()
    expect(registry.liveRows()).toEqual([])
  })
})

describe('N-3 运行期换代视为计划停止', () => {
  it('启动后提供者换代使登记行重跑：进入停止，不重新调用 start', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const stopRequests: string[] = []
    const registry = new LifecycleRegistry({
      expected: EXPECTED,
      clock,
      requestStop: reason => void stopRequests.push(reason),
    })
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
    await root.plugin({
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

    await depFiber.dispose()
    await root.plugin(Dep)
    await flush()

    expect(generation).toBe(2) // 本行确实重跑过
    expect(starts).toEqual([1]) // 没有对新一代调用 start
    expect(stopRequests).toHaveLength(1)
    expect(registry.state).toBe('stopping')
    expect(registry.liveRows()).toEqual([])
  })

  it('启动前的重跑是正常装载：只留新句柄，不触发停止', async () => {
    const calls: Calls = []
    const stopRequests: string[] = []
    const registry = new LifecycleRegistry({
      expected: EXPECTED,
      clock: fakeClock(),
      requestStop: reason => void stopRequests.push(reason),
    })
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
    const registry = new LifecycleRegistry({
      expected: EXPECTED,
      clock,
      requestStop: reason => void stopRequests.push(reason),
    })
    const off = registry.add(handle(calls, 'server-entry', 'entry'))
    await registry.startAll()
    off()
    expect(stopRequests).toEqual([])
    expect(registry.state).toBe('running')
  })
})

describe('X-5 启动期的停止状态与失败（§9 步骤 1、N-3，Reduce R-1、R-2）', () => {
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
    const registry = new LifecycleRegistry({ expected: EXPECTED, clock, requestStop: () => {} })
    const stopNow = () => void runShutdown(registry, EXPECTED, DEADLINE_MS, clock)
    registry.add(startable(calls, 'server-entry', 'entry'))
    registry.add(startable(calls, 'agent-host', 'business'))
    registry.add(startable(calls, 'session-storage', 'composition'))
    registry.add(startable(calls, 'storage', 'storage', stopNow))
    await registry.startAll()
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
    const registry = new LifecycleRegistry({ expected, clock, requestStop: () => {} })
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

  it('阶段间启动次序是关闭次序的逆序，阶段内按登记次序', async () => {
    const calls: Calls = []
    const expected = new Map<RowId, LifecyclePhase>([
      [row('e1'), 'entry'],
      [row('e2'), 'entry'],
      [row('b1'), 'business'],
      [row('c1'), 'composition'],
      [row('s1'), 'storage'],
      [row('s2'), 'storage'],
    ])
    const registry = new LifecycleRegistry({ expected, clock: fakeClock(), requestStop: () => {} })
    const add = (id: string, phase: LifecyclePhase) => registry.add(startable(calls, id, phase))
    add('e2', 'entry') // 倒序登记混入：阶段内以登记次序为准，阶段间以阶段为准
    add('s1', 'storage')
    add('b1', 'business')
    add('s2', 'storage')
    add('c1', 'composition')
    add('e1', 'entry')
    await registry.startAll()
    expect(calls).toEqual(['s1', 's2', 'c1', 'b1', 'e2', 'e1'].map(id => `start:${id}`))
  })

  it('start 抛出：startAll 返回失败句柄，后续阶段不启动；关闭整套照走，该句柄报告 failed', async () => {
    const calls: Calls = []
    const clock = fakeClock()
    const registry = new LifecycleRegistry({ expected: EXPECTED, clock, requestStop: () => {} })
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
    const failure = await registry.startAll()
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
