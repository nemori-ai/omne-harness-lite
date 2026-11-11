// R2-D164: the lockstep that hung C06, reproduced with controlled scheduling. A settled call whose
// delivery completes while one of its runs is in progress must retire when that run ends, and the
// retry interval must not reschedule a complete call. The host is scripted: it runs a call only
// when the test says so and records every reschedule. The ledger is real over the memory store.
import type { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolExecutionRef } from '@omne-harness/tool-contract'
import type { ToolDriver, ToolInstanceHost } from '@omne-harness/tool-contract/provider'
import { createRuntimeExecutor } from '../src/runtime-executor.ts'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import { evidence, instanceId } from './coordinator-values.ts'
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
  }> = {},
) {
  const f = await fixture()
  const recovery = gate()
  let recovered = 0
  const execution: ToolExecutionRef = {
    tenant: f.access.tenant,
    call: f.access.call,
    instance: instanceId,
    generation: '1',
  }
  let foreign = false
  const loadRecovery = vi.fn(
    async (input: Parameters<typeof f.ledger.commands.loadRecovery>[0]) => {
      await recovery.pass()
      const answer = await f.ledger.commands.loadRecovery(input)
      recovered += 1
      if ('ok' in answer && foreign) {
        const other = decodeToolInstanceId('instance-2')
        if ('failure' in other) throw new Error('fixture instance')
        return succeed({ ...answer.ok, execution: { ...execution, instance: other.ok } })
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
      logger: () => ({ warn: () => undefined }),
      plugin: () => options.fiber ?? null,
    } as unknown as Context,
    settings: {
      store: f.store,
      access: { guard: f.input.access },
      resolveAccess,
      sources: { releaseReceivedCopies: async () => 'released' as const },
      capacity: 4,
      observersPerCall: 1,
      observerQueueFrames: 4,
      observerResidenceMs: 1000,
      configuration: {
        observerBufferBytes: 4096,
        driverRetryDelayMs: RETRY_MS,
        driverStepsPerRun: 4,
      },
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
    foreignInstance: () => {
      foreign = true
    },
  }
}

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
