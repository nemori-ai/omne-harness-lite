import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { LedgerCommitInput, ToolLedgerStore } from '@omne-harness/tool'
import type { MemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  admission,
  fixedOf,
  callId,
  interleaving,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  losingCommits,
  startHarness,
  type StartHarness,
} from './start-values.ts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

type Commit = LedgerCommitInput

function holdsSlot(input: Commit): boolean {
  return (
    input.domain.kind === 'queue' &&
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'queue-entry' &&
        write.record.entry.stage === 'held',
    )
  )
}

function putsOperation(operation: string) {
  return (input: Commit) =>
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'operation' &&
        write.record.operation.operation === operation,
    )
}

async function negativeAnswerAboutStart(harness: StartHarness): Promise<void> {
  ok(
    await harness.ledger.reads.operation({
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
      operation: operationId('op-c1/start'),
    }),
  )
}

const wake = (call: string) => ({ tenant: tenantA, call: callId(call) })

const excludedStart =
  'operation op-c1/start was excluded by a negative answer; resubmit with the same identity'

function prepareStartReplies(replies: string[]) {
  return (base: StartHarness['commands']): StartHarness['commands'] => ({
    ...base,
    prepareStart: async input => {
      const reply = await base.prepareStart(input)
      if (input.call === callId('c1'))
        replies.push(
          'ok' in reply
            ? 'started'
            : reply.failure.kind === 'unavailable'
              ? reply.failure.diagnostic
              : reply.failure.kind,
        )
      return reply
    },
  })
}

async function expectStarted(harness: StartHarness): Promise<void> {
  expect((await harness.state('c1')).phase).toBe('running')
  expect(harness.binding.executions).toEqual(['c1'])
  expect((await harness.queue()).find(entry => entry.call === 'c1')).toMatchObject({
    stage: 'held',
  })
}

async function orphanedByAbort(): Promise<StartHarness> {
  const controller = new AbortController()
  const harness: StartHarness = startHarness({
    store: memory =>
      interleaving(memory, holdsSlot, async () => {
        await negativeAnswerAboutStart(harness)
        controller.abort()
      }),
  })
  await admitCall(harness, 'c1')
  await admitCall(harness, 'c2')
  harness.host.scheduled.splice(0)
  await harness.runOnce('c1', controller.signal)
  expect((await harness.state('c1')).phase).toBe('queued')
  expect(await harness.queue()).toEqual([
    { call: 'c1', ordinal: '1', stage: 'held' },
    { call: 'c2', ordinal: '2', stage: 'preparing' },
  ])
  await vi.advanceTimersByTimeAsync(3_600_000)
  expect(harness.host.scheduled).toEqual([])
  return harness
}

describe('23 retrigger: a held slot whose start intent was excluded is redone by a trigger', () => {
  it('23 retrigger: with no other call and a whole budget, the run redoes the excluded start intent itself', async () => {
    const replies: string[] = []
    const harness: StartHarness = startHarness({
      commands: prepareStartReplies(replies),
      store: memory => interleaving(memory, holdsSlot, () => negativeAnswerAboutStart(harness)),
    })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.runOnce('c1')
    expect(replies).toEqual([excludedStart, 'started'])
    expect(harness.host.scheduled).toEqual([])
    await expectStarted(harness)
  })

  it('23 retrigger: with one step per run every committed step schedules the next run, and the excluded start is redone', async () => {
    const replies: string[] = []
    const harness: StartHarness = startHarness({
      driverStepsPerRun: 1,
      commands: prepareStartReplies(replies),
      store: memory => interleaving(memory, holdsSlot, () => negativeAnswerAboutStart(harness)),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.drive('c1', 'c2')
    expect(replies).toEqual([excludedStart, 'started'])
    await expectStarted(harness)
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
  })

  it('23 retrigger: a run that failed to read after the hold is run again after the retry delay, and not before', async () => {
    let armed = true
    let failing = 0
    const harness: StartHarness = startHarness({
      store: memory => ({
        durability: 'none',
        scanPending: input => memory.scanPending(input),
        readRecord: memory.readRecord,
        due: memory.due,
        read: async domain => {
          if (failing > 0 && domain.kind === 'call') {
            failing -= 1
            if (failing === 0) return { kind: 'unavailable', diagnostic: 'the store is down' }
          }
          return memory.read(domain)
        },
        commit: async input => {
          if (armed && holdsSlot(input)) {
            armed = false
            await negativeAnswerAboutStart(harness)
            failing = 2
          }
          return memory.commit(input)
        },
      }),
    })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.runOnce('c1')
    expect((await harness.state('c1')).phase).toBe('queued')
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
    await vi.advanceTimersByTimeAsync(999)
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.host.scheduled).toEqual([wake('c1')])
    await harness.host.runScheduled()
    await expectStarted(harness)
  })

  it('23 retrigger: a waiter that is blocked by an orphaned held slot asks the host to run the owner, after the owner run was aborted', async () => {
    const harness = await orphanedByAbort()
    await harness.drive('c2')
    await expectStarted(harness)
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
    expect((await harness.state('c2')).phase).toBe('queued')
  })

  it('23 retrigger: a new driver over the same records, with no waiting table, completes the orphaned start when the trusted host wakes it after an internal admission recall', async () => {
    const first = await orphanedByAbort()
    const second = startHarness({ memory: first.memory })
    second.host.scheduled.splice(0)
    expect(
      ok(
        await second.ledger.admissions.admit(
          admission('c1', 'op-c1', fixedOf(first.internalRequests, 'c1')),
        ),
      ).recovered,
    ).toBe(true)
    await second.host.schedule(wake('c1'))
    expect(second.host.scheduled).toEqual([wake('c1')])
    await second.host.runScheduled()
    await expectStarted(second)
  })

  it('23 retrigger: a new driver over the same records finds the orphaned slot through the reconcile of a waiter', async () => {
    const first = await orphanedByAbort()
    const second = startHarness({ memory: first.memory })
    await second.drive('c2')
    await expectStarted(second)
  })
})

describe('23 retrigger: when a failed run is run again', () => {
  it('23 retrigger: a run that ended because a port was unavailable is run again after driverRetryDelayMs, then after twice that', async () => {
    const harness = startHarness({
      environment: new Map([['c1', 'unavailable']]),
      driverRetryDelayMs: 250,
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(249)
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.host.scheduled).toEqual([wake('c1')])
    await harness.host.runScheduled()
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(499)
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.host.scheduled).toEqual([wake('c1')])
  })

  it('23 retrigger: a verdict is not repeated: a run that ended on a denial is not run again', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.host.driver().run({
      principal: principalB,
      tenant: tenantA,
      call: callId('c1'),
      instance: await harness.host.instanceOf(callId('c1')),
      signal: new AbortController().signal,
    })
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(harness.host.scheduled).toEqual([])
  })

  it('23 retrigger: a run that met only unknown commits waits the retry delay instead of asking to run at once', async () => {
    const harness = startHarness({
      driverRetryDelayMs: 500,
      store: (memory: MemoryToolLedgerStore): ToolLedgerStore =>
        losingCommits(memory, putsOperation('op-c1/plan'), 'dropped', 1_000_000),
    })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.runOnce('c1')
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(500)
    expect(harness.host.scheduled).toEqual([wake('c1')])
  })

  it('23 retrigger: a run whose every step was excluded by a negative answer is no progress, so it waits the delay and does not spin', async () => {
    let polling = false
    const harness: StartHarness = startHarness({
      driverStepsPerRun: 3,
      driverRetryDelayMs: 60_000,
      store: memory => ({
        durability: 'none',
        scanPending: input => memory.scanPending(input),
        readRecord: memory.readRecord,
        due: memory.due,
        read: async domain => {
          const read = await memory.read(domain)
          if (polling && domain.kind === 'queue') await negativeAnswerAboutStart(harness)
          return read
        },
        commit: input => memory.commit(input),
      }),
    })
    await admitCall(harness, 'c1')
    await harness.runOnce('c1')
    expect((await harness.state('c1')).phase).toBe('queued')
    harness.host.scheduled.splice(0)
    polling = true
    await harness.runOnce('c1')
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(59_999)
    expect(await harness.host.runScheduled()).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.host.scheduled).toEqual([wake('c1')])
    expect(await harness.host.runScheduled()).toBe(1)
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(59_999)
    expect(harness.host.scheduled).toEqual([])
    polling = false
    await vi.advanceTimersByTimeAsync(1)
    await harness.host.runScheduled()
    await expectStarted(harness)
  })

  it('23 retrigger: a run whose every step found a stale revision is no progress either', async () => {
    const harness = startHarness({
      driverStepsPerRun: 3,
      commands: base => ({
        ...base,
        planPreparation: () =>
          Promise.resolve(fail({ kind: 'stale-revision', current: '9' as never })),
      }),
    })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.runOnce('c1')
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(999)
    expect(harness.host.scheduled).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(harness.host.scheduled).toEqual([wake('c1')])
  })

  it('23 retrigger: a run that the host aborted is not run again, even when it ended on a failure that would be', async () => {
    const controller = new AbortController()
    const harness = startHarness({
      store: memory => ({
        durability: 'none',
        scanPending: input => memory.scanPending(input),
        readRecord: memory.readRecord,
        due: memory.due,
        read: domain => memory.read(domain),
        commit: async input => {
          if (!putsOperation('op-c1/plan')(input)) return memory.commit(input)
          controller.abort()
          return { kind: 'unavailable', diagnostic: 'the store is down' }
        },
      }),
    })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    await harness.runOnce('c1', controller.signal)
    expect((await harness.state('c1')).phase).toBe('accepted')
    await vi.advanceTimersByTimeAsync(3_600_000)
    expect(harness.host.scheduled).toEqual([])
  })

  it.each(['pending', 'unknown'] as const)(
    '23 retrigger: an environment that answers %s is read again after the retry delay, not asked again',
    async answer => {
      const harness = startHarness({
        driverRetryDelayMs: 400,
        environment: new Map([['c1', answer]]),
      })
      await admitCall(harness, 'c1')
      harness.host.scheduled.splice(0)
      await harness.runOnce('c1')
      expect((await harness.state('c1')).phase).toBe('preparing')
      expect(harness.environments.prepared).toEqual(['c1'])
      expect(harness.host.scheduled).toEqual([])
      await vi.advanceTimersByTimeAsync(399)
      expect(harness.host.scheduled).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(harness.host.scheduled).toEqual([wake('c1')])
      await harness.host.runScheduled()
      expect(harness.environments.inspected).toEqual(['c1'])
      expect(harness.host.scheduled).toEqual([])
      await vi.advanceTimersByTimeAsync(799)
      expect(harness.host.scheduled).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(harness.host.scheduled).toEqual([wake('c1')])
      harness.environments.answer('c1', 'prepared')
      await harness.host.runScheduled()
      expect(harness.environments.prepared).toEqual(['c1'])
      expect(harness.environments.inspected).toEqual(['c1', 'c1'])
      await expectStarted(harness)
    },
  )
})
