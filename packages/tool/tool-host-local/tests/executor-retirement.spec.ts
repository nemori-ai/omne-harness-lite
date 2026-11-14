// R2-D164: the lockstep that hung C06, reproduced with controlled scheduling. A settled call whose
// delivery completes while one of its runs is in progress must retire when that run ends, and the
// retry interval must not reschedule a complete call. The host is scripted: it runs a call only
// when the test says so and records every reschedule. The ledger is real over the memory store.
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { LedgerPendingScan, ToolLedgerStore } from '@omne-harness/tool'
import type { ToolExecutionRef } from '@omne-harness/tool-contract'
import type { ToolDriver, ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import { createRuntimeExecutor } from '../src/runtime-executor.ts'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { evidence, instanceId, tenantB } from './coordinator-values.ts'
import { fixture } from './delivery/fixture.ts'

type ExecutorInput = Parameters<typeof createRuntimeExecutor>[0]
type Step = Parameters<ToolDriver<unknown>['run']>[0]
// Far beyond what vi.waitFor advances on the fake clock while it polls: only the explicit
// advances below fire the retry interval.
const RETRY_MS = 3_600_000

/** Holds the next call of a port until the test lets it go. */
function gate() {
  let pending: PromiseWithResolvers<void> | null = null
  return {
    hold: () => {
      pending = Promise.withResolvers<void>()
      return pending
    },
    async pass() {
      const held = pending
      pending = null
      if (held !== null) await held.promise
    },
  }
}

function controlledHost() {
  let driver: ToolDriver<unknown> | null = null
  const scheduled: string[] = []
  const host = {
    install: (active: ToolDriver<unknown>) => {
      driver = active
      return { release: async () => undefined }
    },
    schedule: async (wake: Readonly<{ call: string }>) => {
      scheduled.push(wake.call)
      return succeed({ queued: true as const })
    },
    publish: async () =>
      fail({ kind: 'unavailable' as const, dependency: 'test-host', diagnostic: 'not published' }),
    withdraw: async () => succeed({ removed: false }),
    directory: null,
  } as unknown as ToolInstanceHost<unknown>
  return {
    host,
    scheduled,
    run: (step: Step) => {
      if (driver === null) throw new Error('The executor installed no driver.')
      return driver.run(step)
    },
  }
}

/**
 * `execution`: the recovery reports an ended execution of this instance, so the executor publishes
 * the call through `ctx.plugin` and owns a fiber. `fiber` is what that plugin call returns.
 */
async function world(
  options: Readonly<{
    execution?: boolean
    fiber?: { dispose(): Promise<void> }
    receiver?: ExecutorInput['receiver']
    scan?: ExecutorInput['recovery']['scan']
    capacity?: number
    /** Replaces the answer of the n-th `loadRecovery` (from 1); `undefined` lets it through. */
    recoveryFault?: (count: number) => RecoveryAnswer | undefined
    /** Replaces the logger of the context. */
    logger?: Context['logger']
    /** Replaces the pending scan of the record store: the rescans read through it. */
    pending?: ToolLedgerStore['scanPending']
    /** The driver's retry interval; `RETRY_MS` by default. */
    retryMs?: number
    /**
     * The rescan period. `'default'` leaves it to the executor; by default it is beyond every
     * advance of the tests that are not about the rescan.
     */
    rescanMs?: number | 'default'
  }> = {},
) {
  const f = await fixture()
  const recovery = gate()
  let recovered = 0
  let asked = 0
  const logs: [name: string, level: string, message: string][] = []
  const execution: ToolExecutionRef = {
    tenant: f.access.tenant,
    call: f.access.call,
    instance: instanceId,
    generation: '1',
  }
  let foreign: Foreign | null = null
  const loadRecovery = vi.fn(
    async (input: Parameters<typeof f.ledger.commands.loadRecovery>[0]) => {
      await recovery.pass()
      asked += 1
      const fault = options.recoveryFault?.(asked)
      if (fault !== undefined) return fault
      const answer = await f.ledger.commands.loadRecovery(input)
      recovered += 1
      if ('ok' in answer && foreign !== null) {
        // Another instance holds the current segment, and that segment may still run there.
        const other = decodeToolInstanceId('instance-2')
        if ('failure' in other) throw new Error('fixture instance')
        const elsewhere = { ...execution, instance: other.ok }
        const refOf = (owner: 'other' | 'self') => (owner === 'other' ? elsewhere : execution)
        const start = answer.ok.start ?? {
          kind: 'start' as const,
          operation: f.access.call as never,
          executor: evidence('executor') as never,
          execution: elsewhere,
        }
        return succeed({
          ...answer.ok,
          execution: refOf(foreign.execution),
          start: { ...start, execution: refOf(foreign.start) },
          state: {
            ...answer.ok.state,
            execution:
              foreign.phase === 'ended'
                ? { kind: 'ended' as const, evidence: evidence('ended') }
                : { kind: foreign.phase, start: start.operation },
          },
        } as typeof answer.ok)
      }
      if ('failure' in answer || options.execution !== true) return answer
      return succeed({
        ...answer.ok,
        execution,
        state: {
          ...answer.ok.state,
          execution: { kind: 'ended' as const, evidence: evidence('ended') },
        },
      })
    },
  )
  const access = gate()
  const resolveAccess = vi.fn(async (input: Readonly<{ call: string }>) => {
    await access.pass()
    return succeed({ ...f.access, call: input.call })
  })
  const controlled = controlledHost()
  const executor = createRuntimeExecutor({
    ctx: {
      logger:
        options.logger ??
        ((name: string) => ({
          warn: (message: string) => void logs.push([name, 'warn', message]),
          info: (message: string) => void logs.push([name, 'info', message]),
        })),
      plugin: () => options.fiber ?? null,
    } as unknown as Context,
    settings: {
      store: options.pending === undefined ? f.store : { ...f.store, scanPending: options.pending },
      access: { guard: f.input.access },
      resolveAccess,
      sources: { releaseReceivedCopies: async () => 'released' as const },
      capacity: options.capacity ?? 4,
      observersPerCall: 1,
      observerQueueFrames: 4,
      observerResidenceMs: 1000,
      configuration: {
        observerBufferBytes: 4096,
        driverRetryDelayMs: options.retryMs ?? RETRY_MS,
        driverStepsPerRun: 4,
      },
      ...(options.rescanMs === 'default'
        ? {}
        : { recoveryRescanMs: options.rescanMs ?? RETRY_MS * 100 }),
    } as unknown as ExecutorInput['settings'],
    dependencies: {
      commands: { ...f.input.commands, loadRecovery },
      reads: f.input.reads,
      operationIdentities: f.input.identities,
      instances: controlled.host,
    } as unknown as ExecutorInput['dependencies'],
    resultDelivery: {
      read: input => f.ledger.delivery.read({ ...input, principal: f.access.principal }),
    },
    receiver:
      options.receiver ?? (f.input.position.receiver as unknown as ExecutorInput['receiver']),
    // Without a scripted scan, no old call waits for this executor.
    recovery: { scan: options.scan ?? (async () => succeed({ calls: [], next: null })) },
    instance: () => instanceId,
  })
  const step: Step = { ...f.access, instance: instanceId, signal: new AbortController().signal }
  return {
    f,
    executor,
    controlled,
    step,
    recovery,
    access,
    recovered: () => recovered,
    logs,
    /** The current segment as the recovery reports it from now on; another instance's live one by default. */
    foreignInstance: (as: Partial<Foreign> = {}) => {
      foreign = { phase: 'live', start: 'other', execution: 'other', ...as }
    },
    /** The recovery reports the call as it is again. */
    ownInstance: () => {
      foreign = null
    },
  }
}

type RecoveryAnswer = Awaited<ReturnType<ExecutorInput['dependencies']['commands']['loadRecovery']>>

/** Who holds the current segment in the recovery: by its start record, by the call's execution, and in which phase. */
type Foreign = Readonly<{
  phase: 'starting' | 'live' | 'unknown' | 'ended'
  start: 'other' | 'self'
  execution: 'other' | 'self'
}>

it('R2-D164 a complete call retires when the run in progress ends, and is not rescheduled', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const w = await world()
    const { call } = w.f.access
    expect(w.executor.remember(w.f.access)).toBe(true)
    // Round 1: the run issues the delivery. The delivery run is held before its first read.
    const delivery1 = w.access.hold()
    await w.controlled.run(w.step)
    // A live call is rescheduled by the interval.
    vi.advanceTimersByTime(RETRY_MS)
    expect(w.controlled.scheduled).toEqual([call])
    // Round 2 starts, like the immediate re-run of the host, and is held inside its first read.
    const run2Recovery = w.recovery.hold()
    const run2 = w.controlled.run(w.step)
    const recoveredBefore = w.recovered()
    // The delivery of round 1 completes while round 2 is in progress; the outcome is judged.
    delivery1.resolve()
    await vi.waitFor(() => expect(w.f.receiver.push).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(w.recovered()).toBe(recoveredBefore + 1))
    // Complete, but a run is in progress: still known, not rescheduled any more.
    expect(w.executor.knows(w.f.access)).toBe(true)
    expect(w.executor.diagnostics().completed).toBe(0)
    vi.advanceTimersByTime(RETRY_MS)
    expect(w.controlled.scheduled).toEqual([call])
    // Round 2 ends. Its own delivery run is held, so only the end of the run can retire the call.
    const delivery2 = w.access.hold()
    run2Recovery.resolve()
    await run2
    await vi.waitFor(() => expect(w.executor.diagnostics().completed).toBe(1))
    expect(w.executor.knows(w.f.access)).toBe(false)
    await w.executor.close()
    delivery2.resolve()
  } finally {
    vi.useRealTimers()
  }
})

it('R2-D186 a failed cleanup keeps the call, the interval wakes it, and it retires once', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const dispose = vi.fn(async () => undefined)
    dispose.mockRejectedValueOnce(new Error('cleanup failed'))
    const w = await world({ execution: true, fiber: { dispose } })
    const { call } = w.f.access
    expect(w.executor.remember(w.f.access)).toBe(true)
    // Round 1 publishes the call (a fiber) and delivers; the retirement's cleanup fails.
    await w.controlled.run(w.step)
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1))
    expect(w.executor.diagnostics().completed).toBe(0)
    expect(w.executor.knows(w.f.access)).toBe(true)
    // Not complete any more: the interval wakes the call again.
    vi.advanceTimersByTime(RETRY_MS)
    expect(w.controlled.scheduled).toEqual([call])
    // Round 2 judges the delivery outcome again; this time the cleanup succeeds.
    await w.controlled.run(w.step)
    await vi.waitFor(() => expect(w.executor.diagnostics().completed).toBe(1))
    expect(dispose).toHaveBeenCalledTimes(2)
    expect(w.executor.knows(w.f.access)).toBe(false)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

// F7 of #1218: a run that a port could not answer is the driver's to run again, after its own
// backoff. The interval does not reschedule it on every tick as well: one owner of a later run.
it('the interval does not reschedule a call whose last run the driver owns', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const busy = fail({
      kind: 'unavailable' as const,
      dependency: 'tool-ledger',
      diagnostic: 'busy',
    })
    // The executor's own read passes; the driver's read and every later one cannot answer.
    const w = await world({ recoveryFault: count => (count >= 2 ? busy : undefined) })
    expect(w.executor.remember(w.f.access)).toBe(true)
    await w.controlled.run(w.step)
    expect(w.executor.diagnostics().progress).toEqual(['failed/unavailable/tool-ledger'])
    vi.advanceTimersByTime(RETRY_MS * 5)
    expect(w.controlled.scheduled).toEqual([])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('a read before the run that cannot answer is handed to the driver, not to every tick', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  try {
    const busy = fail({
      kind: 'unavailable' as const,
      dependency: 'tool-ledger',
      diagnostic: 'busy',
    })
    const w = await world({ recoveryFault: () => busy })
    expect(w.executor.remember(w.f.access)).toBe(true)
    await w.controlled.run(w.step)
    expect(w.executor.diagnostics().progress).toEqual(['failed/unavailable/tool-ledger'])
    // Not the interval: the driver runs it again once, after its first delay.
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1)
    expect(w.controlled.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(w.controlled.scheduled).toEqual([w.f.access.call])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('R2-D327 the executor lets a call go and its pacing entries go with it', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const unavailable = async () =>
      fail({
        kind: 'unavailable' as const,
        dependency: 'tool-result-receiver',
        diagnostic: 'absent',
      })
    const w = await world({ receiver: unavailable as unknown as ExecutorInput['receiver'] })
    expect(w.executor.remember(w.f.access)).toBe(true)
    // The receiver is absent: the delivery stays owed and holds one pacing entry.
    await w.controlled.run(w.step)
    await vi.waitFor(() => expect(w.executor.diagnostics().pacedDeliveries).toBe(1))
    expect(w.executor.knows(w.f.access)).toBe(true)

    // Another instance owns the call now: this executor drops it, and the entry goes too.
    w.foreignInstance()
    await w.controlled.run(w.step)
    expect(w.executor.knows(w.f.access)).toBe(false)
    expect(w.executor.diagnostics().pacedDeliveries).toBe(0)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

type Scan = ExecutorInput['recovery']['scan']
type ScanAnswer = Awaited<ReturnType<Scan>>

/**
 * 按调用身份的键集分页的扫描替身，每页 `page` 个调用。`fault` 依次替换某一次扫描的答复，
 * `undefined` 表示照常答复。`seen` 记下每次扫描的 `after`。
 */
function pagedScan(
  tenant: TenantId,
  calls: readonly string[],
  page: number,
  faults: readonly (ScanAnswer | undefined)[] = [],
) {
  const seen: (string | null)[] = []
  let round = 0
  const scan: Scan = async input => {
    seen.push(input.after?.call ?? null)
    const fault = faults[round]
    round += 1
    if (fault !== undefined) return fault
    const rest = calls.filter(call => input.after === null || call > input.after.call)
    const listed = rest.slice(0, page).map(call => ({ tenant, call: call as never }))
    const last = listed.at(-1)
    return succeed({ calls: listed, next: rest.length > page && last !== undefined ? last : null })
  }
  return { scan, seen }
}

it('the startup scan remembers and schedules the old calls of every page, once', async () => {
  const f = await fixture()
  const paged = pagedScan(f.access.tenant, ['c-a', 'c-b', 'c-c'], 2)
  const w = await world({ scan: paged.scan })
  await vi.waitFor(() => expect(w.executor.diagnostics().recoveryScan).toBe('done'))
  expect(paged.seen).toEqual([null, 'c-b'])
  expect(w.controlled.scheduled).toEqual(['c-a', 'c-b', 'c-c'])
  for (const call of ['c-a', 'c-b', 'c-c'])
    expect(w.executor.knows({ tenant: f.access.tenant, call: call as never })).toBe(true)
  expect(w.executor.diagnostics().recoveredCalls).toBe(3)
  await w.executor.close()
})

/** Every timer the executor arms: the retry interval, the rescan period and the backoff waits. */
const TIMERS = ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] as const

/** Lets the work the fake clock started run to its next wait: a real turn of the event loop. */
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

/** Moves the fake clock by `ms`, then lets what it started run. */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

it('an unavailable scan goes on from its cursor after one second, and an unsupported one stops', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const f = await fixture()
    const unavailable = fail({
      kind: 'unavailable' as const,
      dependency: 'ledger-store',
      diagnostic: 'injected',
    })
    const paged = pagedScan(f.access.tenant, ['c-a', 'c-b'], 1, [undefined, unavailable])
    const w = await world({ scan: paged.scan })
    await settle()
    expect(paged.seen).toEqual([null, 'c-a'])
    expect(w.executor.diagnostics().recoveryScan).toBe('waiting')
    expect(w.controlled.scheduled).toEqual(['c-a'])
    await advance(999)
    expect(paged.seen).toEqual([null, 'c-a'])
    await advance(1)
    expect(w.executor.diagnostics().recoveryScan).toBe('done')
    expect(paged.seen).toEqual([null, 'c-a', 'c-a'])
    expect(w.controlled.scheduled).toContain('c-b')
    await w.executor.close()

    const refused = pagedScan(f.access.tenant, ['c-a'], 1, [
      fail({ kind: 'unsupported' as const, adoption: evidence('store') as never, reason: 'x' }),
    ])
    const v = await world({ scan: refused.scan })
    await settle()
    expect(v.executor.diagnostics().recoveryScan).toBe('unsupported')
    await advance(RETRY_MS)
    expect(refused.seen).toEqual([null])
    await v.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('a full executor stops the scan at its cursor and goes on when room is made', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    const f = await fixture()
    const paged = pagedScan(f.access.tenant, ['c-a', 'c-b', 'c-c'], 3)
    const w = await world({ scan: paged.scan, capacity: 2 })
    await vi.waitFor(() => expect(w.executor.diagnostics().recoveredCalls).toBe(2))
    expect(w.executor.diagnostics().recoveryScan).toBe('waiting')
    expect(w.controlled.scheduled).toEqual(['c-a', 'c-b'])
    // The first call never started: the executor lets it go, which makes room for one more.
    w.executor.rejectAdmission({ tenant: f.access.tenant, call: 'c-a' as never })
    vi.advanceTimersByTime(RETRY_MS)
    await vi.waitFor(() => expect(w.executor.diagnostics().recoveryScan).toBe('done'))
    expect(paged.seen).toEqual([null, 'c-b'])
    expect(w.executor.knows({ tenant: f.access.tenant, call: 'c-c' as never })).toBe(true)
    expect(w.executor.diagnostics().recoveredCalls).toBe(3)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

const SCAN_DOWN = fail({
  kind: 'unavailable' as const,
  dependency: 'ledger-store',
  diagnostic: 'injected',
})

/** The log lines of the executor whose message starts with `prefix`, as `[level, message]`. */
const linesOf = (w: Awaited<ReturnType<typeof world>>, prefix: string) =>
  w.logs
    .filter(([name, , message]) => name === 'tool-executor' && message.startsWith(prefix))
    .map(([, level, message]) => [level, message])

it('logs where a run stopped once per reason, and once more when the call goes on', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  try {
    // A run reads the recovery for the executor first, then for the driver: the second read fails.
    let failing = true
    let reads = 0
    const w = await world({
      recoveryFault: () => {
        reads += 1
        return failing && reads === 2 ? SCAN_DOWN : undefined
      },
    })
    const run = async () => {
      reads = 0
      await w.controlled.run(w.step)
    }
    const { call } = w.f.access
    const trouble = 'failed: unavailable dependency="ledger-store" diagnostic="injected"'
    expect(w.executor.remember(w.f.access)).toBe(true)
    await run()
    const stopped = [
      'warn',
      `Tool call ${call} stopped on ${trouble}; the driver runs it again when it can`,
    ]
    expect(linesOf(w, 'Tool call')).toEqual([stopped])
    expect(w.executor.diagnostics().progress).toEqual(['failed/unavailable/ledger-store'])
    // The same reason again says nothing new.
    await run()
    expect(linesOf(w, 'Tool call')).toEqual([stopped])
    failing = false
    await run()
    expect(linesOf(w, 'Tool call')).toEqual([
      stopped,
      ['info', `Tool call ${call} goes on; it had stopped on ${trouble}`],
    ])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('backs a scan that cannot read off by 1, 5 and 30 seconds, and logs the first failure and each one at the cap', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const f = await fixture()
    const paged = pagedScan(f.access.tenant, ['c-a', 'c-b'], 1, [
      SCAN_DOWN,
      SCAN_DOWN,
      SCAN_DOWN,
      SCAN_DOWN,
      undefined,
      SCAN_DOWN,
    ])
    const w = await world({ scan: paged.scan })
    const line = (ms: number) => [
      'warn',
      `The recovery scan is unavailable (injected); it goes on in ${ms} ms.`,
    ]
    await settle()
    expect(paged.seen).toHaveLength(1)
    expect(linesOf(w, 'The recovery scan')).toEqual([line(1000)])
    // Each wait is the next step of the ladder: not one millisecond sooner.
    for (const [wait, reads] of [
      [1000, 2],
      [5000, 3],
      [30_000, 4],
    ] as const) {
      await advance(wait - 1)
      expect(paged.seen).toHaveLength(reads - 1)
      await advance(1)
      expect(paged.seen).toHaveLength(reads)
    }
    // The second failure was silent; the third and the fourth wait at the cap and are logged.
    expect(linesOf(w, 'The recovery scan')).toEqual([line(1000), line(30_000), line(30_000)])
    // The fifth scan reads a page, the sixth fails: the ladder starts again from one second.
    await advance(30_000)
    expect(paged.seen).toHaveLength(6)
    expect(linesOf(w, 'The recovery scan')).toEqual([
      line(1000),
      line(30_000),
      line(30_000),
      line(1000),
    ])
    await advance(1000)
    expect(w.executor.diagnostics().recoveryScan).toBe('done')
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('logs an unsupported scan once, and a scan that throws without the text of its error', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const f = await fixture()
    const refused = pagedScan(f.access.tenant, ['c-a'], 1, [
      fail({ kind: 'unsupported' as const, adoption: evidence('store') as never, reason: 'x' }),
    ])
    const w = await world({ scan: refused.scan })
    await settle()
    expect(w.executor.diagnostics().recoveryScan).toBe('unsupported')
    expect(linesOf(w, 'The recovery scan')).toEqual([
      ['warn', 'The recovery scan is unsupported; old calls are not taken over.'],
    ])
    await w.executor.close()

    let thrown = 0
    const paged = pagedScan(f.access.tenant, ['c-a'], 1)
    const v = await world({
      scan: input => {
        thrown += 1
        if (thrown === 1) throw new Error('secret of the store')
        return paged.scan(input)
      },
    })
    await settle()
    expect(thrown).toBe(1)
    expect(v.executor.diagnostics().recoveryScan).toBe('waiting')
    expect(linesOf(v, 'The recovery scan')).toEqual([
      ['warn', 'The recovery scan failed; its error text is withheld. It goes on in 1000 ms.'],
    ])
    await advance(1000)
    expect(v.executor.diagnostics().recoveryScan).toBe('done')
    expect(v.controlled.scheduled).toEqual(['c-a'])
    await v.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('a full executor logs once and does not read again until a call retires', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const f = await fixture()
    const paged = pagedScan(f.access.tenant, ['c-a', 'c-b', 'c-c'], 3)
    const w = await world({ scan: paged.scan, capacity: 2 })
    const full = ['warn', 'The executor is full; the recovery scan goes on when a call retires.']
    await settle()
    expect(w.executor.diagnostics().recoveredCalls).toBe(2)
    expect(w.executor.diagnostics().recoveryScan).toBe('waiting')
    expect(linesOf(w, 'The executor is full')).toEqual([full])
    await advance(RETRY_MS * 3)
    expect(paged.seen).toHaveLength(1)
    expect(linesOf(w, 'The executor is full')).toEqual([full])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('goes on when the logger of an ended context throws', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const f = await fixture()
    const paged = pagedScan(f.access.tenant, ['c-a'], 1, [SCAN_DOWN])
    const w = await world({
      scan: paged.scan,
      logger: (() => {
        throw new Error('the context has ended')
      }) as never,
    })
    await settle()
    expect(paged.seen).toHaveLength(1)
    expect(w.executor.diagnostics().recoveryScan).toBe('waiting')
    await advance(1000)
    expect(w.executor.diagnostics().recoveryScan).toBe('done')
    expect(w.controlled.scheduled).toEqual(['c-a'])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

const textOf = (tenant: TenantId) => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant')
  return encoded.value
}

/**
 * The pending scan of the record store as the rescans see it: it records the tenant of each read
 * and answers `answer` for it (an empty page by default).
 */
function pendingReads(answer: (tenant: string) => LedgerPendingScan | undefined = () => undefined) {
  const read: string[] = []
  const pending: ToolLedgerStore['scanPending'] = async input => {
    if (input.tenant === null) throw new Error('a rescan reads one tenant')
    const tenant = textOf(input.tenant)
    read.push(tenant)
    return answer(tenant) ?? { kind: 'page', calls: [], more: false }
  }
  return { pending, read }
}

/** A startup scan that finds nothing, and counts how often it was asked. */
function emptyStartup() {
  let asked = 0
  const scan: Scan = async () => {
    asked += 1
    return succeed({ calls: [], next: null })
  }
  return { scan, asked: () => asked }
}

it('the rescan keeps its own period: with a 50 ms retry interval it still comes once a minute', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const reads = pendingReads()
    const w = await world({ retryMs: 50, rescanMs: 'default', pending: reads.pending })
    expect(w.executor.remember(w.f.access)).toBe(true)
    await advance(59_999)
    expect(reads.read).toEqual([])
    await advance(1)
    expect(reads.read).toEqual([textOf(w.f.access.tenant)])
    await advance(60_000)
    expect(reads.read).toHaveLength(2)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('after the startup scan the rescan reads only a tenant with a call in flight, and not after it settled', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const startup = emptyStartup()
    const reads = pendingReads()
    const w = await world({ scan: startup.scan, pending: reads.pending, rescanMs: 60_000 })
    await settle()
    expect(w.executor.diagnostics().recoveryScan).toBe('done')
    // Nothing in flight: no tenant is read, and the cross-tenant scan does not run again.
    await advance(60_000)
    expect(reads.read).toEqual([])
    expect(w.executor.diagnostics().owedTenants).toBe(0)
    // A call in flight makes its tenant owed, and only that tenant is read.
    expect(w.executor.remember(w.f.access)).toBe(true)
    await advance(60_000)
    expect(reads.read).toEqual([textOf(w.f.access.tenant)])
    // The call completes and retires: its tenant is not read again.
    await w.controlled.run(w.step)
    await vi.waitFor(() => expect(w.executor.diagnostics().completed).toBe(1))
    expect(w.executor.diagnostics().owedTenants).toBe(0)
    await advance(120_000)
    expect(reads.read).toEqual([textOf(w.f.access.tenant)])
    expect(startup.asked()).toBe(1)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('a call out of the table that a run reads as settled leaves the owed set', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    const reads = pendingReads()
    const w = await world({ pending: reads.pending, rescanMs: 60_000 })
    // The call runs to its end once, so the ledger holds it settled with no work.
    expect(w.executor.remember(w.f.access)).toBe(true)
    await w.controlled.run(w.step)
    await vi.waitFor(() => expect(w.executor.diagnostics().completed).toBe(1))
    // A late registration owes it again; another instance holds it, so the executor lets it go.
    expect(w.executor.remember(w.f.access)).toBe(true)
    w.foreignInstance()
    await w.controlled.run(w.step)
    expect(w.executor.knows(w.f.access)).toBe(false)
    expect(w.executor.diagnostics().owedTenants).toBe(1)
    // A later run reads the call as it is: settled, with no work.
    w.ownInstance()
    await w.controlled.run(w.step)
    expect(w.executor.knows(w.f.access)).toBe(false)
    expect(w.executor.diagnostics().owedTenants).toBe(0)
    await advance(60_000)
    expect(reads.read).toEqual([])
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it('a tenant whose rescan cannot read backs off 1, 5 and 30 seconds and does not hold the other tenant', async () => {
  vi.useFakeTimers({ toFake: [...TIMERS] })
  try {
    let down = true
    const f = await fixture()
    const a = textOf(f.access.tenant)
    const b = textOf(tenantB)
    const reads = pendingReads(tenant =>
      tenant === a && down ? { kind: 'unavailable', diagnostic: 'queue_timeout' } : undefined,
    )
    const w = await world({ pending: reads.pending, rescanMs: 60_000 })
    expect(w.executor.remember(w.f.access)).toBe(true)
    expect(w.executor.remember({ tenant: tenantB, call: 'c-b' as never })).toBe(true)
    const of = (tenant: string) => reads.read.filter(read => read === tenant).length
    // The round reads both: the tenant that cannot answer does not stop the other.
    await advance(60_000)
    expect([of(a), of(b)]).toEqual([1, 1])
    for (const [wait, count] of [
      [1000, 2],
      [5000, 3],
      [30_000, 4],
    ] as const) {
      await advance(wait - 1)
      expect(of(a)).toBe(count - 1)
      await advance(1)
      expect(of(a)).toBe(count)
    }
    const line = (ms: number) => [
      'warn',
      `The recovery scan of tenant ${a} is unavailable (queue_timeout); it goes on in ${ms} ms.`,
    ]
    expect(linesOf(w, 'The recovery scan of tenant')).toEqual([
      line(1000),
      line(30_000),
      line(30_000),
    ])
    // The next round reads the other tenant on time; the failing one stays in its backoff.
    expect(of(b)).toBe(1)
    await advance(120_000 - 96_000)
    expect([of(a), of(b)]).toEqual([4, 2])
    // It reads again at the cap and succeeds: the ladder starts again from one second.
    down = false
    await advance(6000)
    expect(of(a)).toBe(5)
    down = true
    await advance(54_000)
    expect(of(a)).toBe(6)
    await advance(999)
    expect(of(a)).toBe(6)
    await advance(1)
    expect(of(a)).toBe(7)
    await w.executor.close()
  } finally {
    vi.useRealTimers()
  }
})

it.each(['starting', 'live', 'unknown'] as const)(
  'lets go of a call whose current segment may still run in another instance: %s',
  async phase => {
    const w = await world()
    expect(w.executor.remember(w.f.access)).toBe(true)
    w.foreignInstance({ phase })
    await w.controlled.run(w.step)
    expect(w.executor.knows(w.f.access)).toBe(false)
    expect(w.executor.diagnostics().foreignExecutionRuns).toBe(1)
    await w.executor.close()
  },
)

it('keeps a call whose segment in another instance has ended: its pending work is this instance to do', async () => {
  const w = await world()
  expect(w.executor.remember(w.f.access)).toBe(true)
  w.foreignInstance({ phase: 'ended' })
  await w.controlled.run(w.step)
  expect(w.executor.diagnostics().foreignExecutionRuns).toBe(0)
  await w.executor.close()
})

it('takes the owner of the current segment from its start record, not from the first execution', async () => {
  // The segment that may run was started by another instance; the call was first run by this one.
  const elsewhere = await world()
  expect(elsewhere.executor.remember(elsewhere.f.access)).toBe(true)
  elsewhere.foreignInstance({ start: 'other', execution: 'self' })
  await elsewhere.controlled.run(elsewhere.step)
  expect(elsewhere.executor.knows(elsewhere.f.access)).toBe(false)
  expect(elsewhere.executor.diagnostics().foreignExecutionRuns).toBe(1)
  await elsewhere.executor.close()

  // The segment that may run was started by this instance; another instance first ran the call.
  const here = await world()
  expect(here.executor.remember(here.f.access)).toBe(true)
  here.foreignInstance({ start: 'self', execution: 'other' })
  await here.controlled.run(here.step)
  expect(here.executor.diagnostics().foreignExecutionRuns).toBe(0)
  await here.executor.close()
})
