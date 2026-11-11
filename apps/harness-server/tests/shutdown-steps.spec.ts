// 关闭协调器的各个步骤各自对外留下的事实：启动失败的报告详情、宿主文件维护的三种结局、
// 存储阶段之后的遥测关闭步骤、assemblyReportSettled 与撤除根的失败只进诊断、迟到结果的详情。时钟是注入的假时钟。
import { describe, expect, it } from 'vitest'
import { LifecycleRegistry } from '../src/lifecycle.ts'
import { runShutdown, type ShutdownClock, type ShutdownRecord } from '../src/shutdown.ts'
import type {
  HostFilesReport,
  LifecycleHandle,
  LifecyclePhase,
  RowId,
  StopResult,
  TelemetryShutdownReport,
} from '../src/types.ts'

const row = (id: string) => id as RowId
const DEADLINE_MS = 1000
const EXPECTED = new Map<RowId, LifecyclePhase>([
  [row('server-entry'), 'entry'],
  [row('agent-host'), 'business'],
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

const flush = () => new Promise<void>(resolve => setImmediate(resolve))

function handle(
  id: string,
  phase: LifecyclePhase,
  stop: () => Promise<StopResult> = async () => ({ kind: 'settled' }),
  extra: Partial<LifecycleHandle> = {},
): LifecycleHandle {
  return { phase, row: row(id), stop, ...extra }
}

function setup(
  handles: readonly LifecycleHandle[],
  options: Parameters<typeof runShutdown>[4] = {},
) {
  const clock = fakeClock()
  const records: ShutdownRecord[] = []
  const registry = new LifecycleRegistry({ expected: EXPECTED, clock, requestStop: () => {} })
  for (const h of handles) registry.add(h)
  const run = () =>
    runShutdown(registry, EXPECTED, DEADLINE_MS, clock, {
      log: record => records.push(record),
      ...options,
    })
  return { registry, records, clock, run }
}
const allSettled = () => [
  handle('server-entry', 'entry'),
  handle('agent-host', 'business'),
  handle('storage', 'storage'),
]

describe('step log records', () => {
  it('numbers the records from 1 and leaves out `detail` when a step has none', async () => {
    const { run, records } = setup(allSettled())
    await run()
    expect(records.map(r => r.seq)).toEqual(records.map((_, index) => index + 1))
    const stopCall = records.find(r => r.action === 'stop-call')
    expect(stopCall).toBeDefined()
    expect(stopCall).not.toHaveProperty('detail')
    expect(records.find(r => r.action === 'report-fixed')).toMatchObject({ detail: 'settled' })
  })
})

describe('a handle whose start threw', () => {
  const failing = (stop: () => Promise<StopResult>) =>
    handle('agent-host', 'business', stop, {
      start: async () => {
        throw new Error('boom')
      },
    })

  it('reports failed with the start detail only, when its stop settled', async () => {
    const { registry, run } = setup([
      handle('server-entry', 'entry'),
      failing(async () => ({ kind: 'settled' })),
      handle('storage', 'storage'),
    ])
    await registry.startAll()
    const report = await run()
    expect(report.outcomes.find(o => o.row === 'agent-host')?.result).toEqual({
      kind: 'failed',
      detail: 'start failed: boom',
    })
  })

  it('keeps the kind of an unsettled stop in the detail', async () => {
    const { registry, run } = setup([
      handle('server-entry', 'entry'),
      failing(async () => ({ kind: 'failed', detail: 'stop broke' })),
      handle('storage', 'storage'),
    ])
    await registry.startAll()
    const report = await run()
    expect(report.outcomes.find(o => o.row === 'agent-host')?.result).toEqual({
      kind: 'failed',
      detail: 'start failed: boom; stop failed',
    })
  })
})

describe('host-files maintenance after the business phase', () => {
  const settled: HostFilesReport = { kind: 'settled', count: 0 }

  it('has no host-files entry in the report when there is no maintenance', async () => {
    const { run } = setup(allSettled())
    expect('hostFiles' in (await run())).toBe(false)
  })

  it('reports what maintenance returned and runs it only after the business stop', async () => {
    const order: string[] = []
    const stops = allSettled().map(h => ({
      ...h,
      stop: async (): Promise<StopResult> => {
        order.push(`stop:${h.row}`)
        return { kind: 'settled' }
      },
    }))
    const { run } = setup(stops, {
      afterBusiness: async () => {
        order.push('maintenance')
        return settled
      },
    })
    const report = await run()
    expect(report.hostFiles).toEqual(settled)
    expect(order).toEqual(['stop:server-entry', 'stop:agent-host', 'maintenance', 'stop:storage'])
  })

  it('turns a failing maintenance into unavailable and a diagnostic, and goes on', async () => {
    const { run, records } = setup(allSettled(), {
      afterBusiness: async () => {
        throw new Error('maintenance broke')
      },
    })
    const report = await run()
    expect(report.hostFiles).toEqual({ kind: 'unavailable', diagnostic: 'maintenance-failed' })
    expect(records).toContainEqual(
      expect.objectContaining({
        action: 'diagnostic',
        phase: 'business',
        row: null,
        detail: 'host-files maintenance failed',
      }),
    )
    expect(report.outcomes.map(o => o.row)).toEqual(['server-entry', 'agent-host', 'storage'])
  })

  it('bounds maintenance by the one deadline D and notes a late completion', async () => {
    let finish: (report: HostFilesReport) => void = () => {}
    const { run, clock, records } = setup(allSettled(), {
      afterBusiness: () => new Promise<HostFilesReport>(resolve => (finish = resolve)),
    })
    clock.advance(300)
    const done = run()
    await flush()
    // D is 1300 on this clock and the stops take no time, so the maintenance timer is D minus now.
    expect(clock.delays.at(-1)).toBe(DEADLINE_MS)
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(report.hostFiles).toEqual({ kind: 'unavailable', diagnostic: 'deadline' })
    const before = records.length
    finish(settled)
    await flush()
    expect(records.length).toBe(before + 1)
    expect(records.at(-1)).toMatchObject({
      action: 'late-result',
      phase: 'business',
      row: null,
      detail: 'host-files maintenance completed after deadline',
    })
  })
})

describe('the telemetry close after the storage phase', () => {
  const closed: TelemetryShutdownReport = {
    kind: 'closed',
    generation: '1',
    admission: 'closed',
    admitted: 2,
    dropped: 0,
    droppedBy: {},
    pending: 0,
    flush: 'completed-to-boundary',
    boundary: 'local-sink',
    transport: 'closed',
    bootstrapOverflow: 0,
    afterClose: 0,
    formatFailures: 0,
    writeFailures: 0,
  }

  it('has no telemetry entry and no telemetry step when the entry gave no close', async () => {
    const { run, records } = setup(allSettled())
    const report = await run()
    expect('telemetry' in report).toBe(false)
    expect(records.map(r => r.action)).not.toContain('telemetry-close')
  })

  it('runs the close after the storage stop and before the report is fixed, with the one deadline D', async () => {
    const order: string[] = []
    const deadlines: number[] = []
    const stops = allSettled().map(h => ({
      ...h,
      stop: async (): Promise<StopResult> => {
        order.push(`stop:${h.row}`)
        return { kind: 'settled' }
      },
    }))
    const { run, records, clock } = setup(stops, {
      afterStorage: async deadline => {
        order.push('telemetry')
        deadlines.push(deadline)
        return closed
      },
    })
    clock.advance(300)
    const report = await run()
    expect(report.telemetry).toEqual(closed)
    expect(report.overall).toBe('settled')
    expect(order).toEqual(['stop:server-entry', 'stop:agent-host', 'stop:storage', 'telemetry'])
    expect(deadlines).toEqual([300 + DEADLINE_MS])
    const actions = records.map(r => r.action)
    const step = actions.indexOf('telemetry-close')
    expect(step).toBeGreaterThan(actions.lastIndexOf('stop-call'))
    expect(step).toBeLessThan(actions.indexOf('report-fixed'))
    expect(records[step]).toMatchObject({ phase: null, row: null })
  })

  it('turns a throwing close into unavailable and a diagnostic, and still fixes the report', async () => {
    const { run, records } = setup(allSettled(), {
      afterStorage: async () => {
        throw new Error('close broke')
      },
    })
    const report = await run()
    expect(report.telemetry).toEqual({ kind: 'unavailable', diagnostic: 'close-failed' })
    expect(report.overall).toBe('settled')
    expect(records).toContainEqual(
      expect.objectContaining({
        action: 'diagnostic',
        phase: null,
        row: null,
        detail: 'telemetry close failed',
      }),
    )
    expect(JSON.stringify(records)).not.toContain('close broke')
  })

  it('bounds the close by the one deadline D and notes a late completion', async () => {
    let finish: (report: TelemetryShutdownReport) => void = () => {}
    const { run, clock, records } = setup(allSettled(), {
      afterStorage: () => new Promise<TelemetryShutdownReport>(resolve => (finish = resolve)),
    })
    const done = run()
    await flush()
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(report.telemetry).toEqual({ kind: 'unavailable', diagnostic: 'deadline' })
    const before = records.length
    finish(closed)
    await flush()
    expect(records.length).toBe(before + 1)
    expect(records.at(-1)).toMatchObject({
      action: 'late-result',
      phase: null,
      row: null,
      detail: 'telemetry close completed after deadline',
    })
  })
})

describe('failures after the report is fixed', () => {
  it('records a throwing assemblyReportSettled and still calls the other handles', async () => {
    const called: string[] = []
    const { run, records } = setup([
      handle('server-entry', 'entry', undefined, {
        assemblyReportSettled: () => {
          throw new Error('latch broke')
        },
      }),
      handle('agent-host', 'business'),
      handle('storage', 'storage', undefined, {
        assemblyReportSettled: () => void called.push('storage'),
      }),
    ])
    const report = await run()
    expect(report.overall).toBe('settled')
    expect(called).toEqual(['storage'])
    expect(records).toContainEqual(
      expect.objectContaining({
        action: 'diagnostic',
        phase: 'entry',
        row: 'server-entry',
        detail: 'assemblyReportSettled threw: latch broke',
      }),
    )
  })

  it('records a failing root disposal as a diagnostic and still returns the report', async () => {
    const { run, records } = setup(allSettled(), {
      disposeRoot: async () => {
        throw new Error('root broke')
      },
    })
    const report = await run()
    expect(report.overall).toBe('settled')
    const actions = records.map(r => r.action)
    expect(actions.at(-2)).toBe('dispose-root')
    expect(records.at(-1)).toMatchObject({
      action: 'diagnostic',
      row: null,
      phase: null,
      detail: 'root disposal failed: root broke',
    })
  })

  it('writes no dispose-root step when the entry gave no root disposer', async () => {
    const { run, records } = setup(allSettled())
    await run()
    expect(records.map(r => r.action)).not.toContain('dispose-root')
  })
})

describe('a stop that settles after D', () => {
  it('writes the late kind into the diagnostic', async () => {
    let finish: (r: StopResult) => void = () => {}
    const { run, clock, records } = setup([
      handle('server-entry', 'entry', () => new Promise<StopResult>(r => (finish = r))),
      handle('agent-host', 'business'),
      handle('storage', 'storage'),
    ])
    const done = run()
    await flush()
    clock.advance(DEADLINE_MS)
    const report = await done
    expect(report.outcomes[0]?.result).toEqual({
      kind: 'incomplete',
      detail: `deadline reached before stop settled (D=${DEADLINE_MS})`,
    })
    finish({ kind: 'settled' })
    await flush()
    expect(records.at(-1)).toMatchObject({
      action: 'late-result',
      detail: 'after deadline: settled',
    })
  })
})
