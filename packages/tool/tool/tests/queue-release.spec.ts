// The queue domain's own memory of released calls, the basis a release needs, the operation that
// recalls an entry, and the reconcile of a waiting call (SPEC 22). A queue entry repeats a fact
// that its call domain owns, so these tests look at the queue domain itself: a released call
// holds no entry however the creation step and the settlement interleave, and nothing but a
// release basis in the call domain deletes an entry.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerCommitInput, ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  admission,
  callId,
  evidence,
  failure,
  interleaving,
  ok,
  principalA,
  request,
  tenantA,
  type Block,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  landingAfterRead,
  losingCommits,
  startHarness,
  writeContext,
  type StartHarness,
} from './start-values.ts'

// The driver arms timers when a run fails; fake ones keep a test from leaving any behind.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const resources = { owner: 'o', record: 'env', revision: '1', digest: 'd' }

type Commit = LedgerCommitInput<Block>

/** Whether a commit is a queue-domain commit that creates a queue entry. */
function createsEntry(input: Commit): boolean {
  return (
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'queue-entry')
  )
}

/** Whether a commit is a queue-domain commit that deletes the entry of `call`: its release. */
function releasesEntry(call: string) {
  return (input: Commit) =>
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'delete' && write.key === `entry:${call}`)
}

/** Whether a commit writes the operation record of `operation`: the commit of that operation. */
function putsOperation(operation: string) {
  return (input: Commit) =>
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'operation' &&
        write.record.operation.operation === operation,
    )
}

/** The call record of `call` as the call domain holds it, and its domain revision. */
async function callDomain(harness: StartHarness, call: string) {
  const read = await harness.memory.read({
    kind: 'call',
    tenant: tenantA as never,
    call: callId(call),
  })
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  const record = read.records.find(candidate => candidate.kind === 'call')
  if (record?.kind !== 'call') throw new Error('the call has no record')
  return { read, record: record.call }
}

/** Settles `c1` through rejectPending at its current revision, as another process would. */
async function settleElsewhere(harness: StartHarness): Promise<void> {
  ok(
    await harness.commands.rejectPending({
      ...(await writeContext(harness, 'c1', 'other/reject')),
      reason: 'the host excluded the invocation',
      exclusion: evidence('call-excluded-c1'),
    }),
  )
}

type Step = 'admit' | 'plan'
type Fault = 'applied' | 'delayed' | 'read-fails' | 'crash'

/**
 * A store in which `settle` runs right before the first commit that creates a queue entry, as a
 * process that settled the call after the creating step read it, and in which that creating
 * commit then meets `fault`. With the `plan` step the admission's own creation fails first, so
 * that planPreparation is the step that creates the entry.
 */
function windowStore(
  memory: MemoryToolLedgerStore<Block>,
  step: Step,
  fault: Fault,
  settle: () => Promise<void>,
  reads: { failing: number },
): ToolLedgerStore<Block> {
  let raced = false
  const racing: ToolLedgerStore<Block> = {
    durability: 'none',
    read: async domain => {
      if (reads.failing > 0 && domain.kind === 'call') {
        reads.failing -= 1
        return { kind: 'unavailable', diagnostic: 'the store is down' }
      }
      return memory.read(domain)
    },
    commit: async input => {
      if (!raced && createsEntry(input)) {
        raced = true
        await settle()
        if (fault === 'applied') memory.injectCommit('unknown-applied')
        if (fault === 'delayed') memory.injectCommit('unknown-delayed')
        if (fault === 'read-fails') reads.failing = 1
      }
      return memory.commit(input)
    },
  }
  return step === 'plan' ? losingCommits(racing, createsEntry, 'unavailable') : racing
}

describe('22 release memory: a released call never regains an entry', () => {
  const cases = (['admit', 'plan'] as const).flatMap(step =>
    (['applied', 'delayed', 'read-fails', 'crash'] as const).map(fault => [step, fault] as const),
  )

  it.each(cases)(
    '22 release memory: a call that settles before the %s step creates its entry keeps no entry when that commit meets %s, and the next call starts',
    async (step, fault) => {
      let settle: () => Promise<void> = () => Promise.resolve()
      const reads = { failing: 0 }
      const harness: StartHarness = startHarness({
        store: memory => windowStore(memory, step, fault, () => settle(), reads),
      })
      settle = () => settleElsewhere(harness)
      await admitCall(harness, 'c1')
      if (step === 'plan') {
        expect(await harness.queue()).toEqual([])
        // The plan read the call before the settlement, so the transaction refuses it as stale.
        const refused = await harness.commands.planPreparation({
          ...(await writeContext(harness, 'c1', 'op-c1/plan')),
          request: request(),
          purpose: 'initial',
        })
        // A creation commit that answers unknown makes the plan unknown; otherwise it is stale.
        const answers = { 'read-fails': 'unavailable', delayed: 'commit-unknown' } as const
        expect(failure(refused)).toMatchObject({
          kind: answers[fault as 'read-fails' | 'delayed'] ?? 'stale-revision',
        })
      }
      reads.failing = 0
      // The queue holds no entry for c1, and a commit that was held back cannot land one.
      expect(await harness.queue()).toEqual([])
      if (fault === 'delayed') expect(harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
      expect(await harness.queue()).toEqual([])
      expect(await harness.released()).toEqual(['c1'])
      // A recalled admission does not make one either.
      const again = await harness.runtime.admit(admission('c1', 'op-c1', request()))
      expect(ok(again).recovered).toBe(true)
      expect(await harness.queue()).toEqual([])
      await admitCall(harness, 'c2')
      await harness.drive('c2')
      expect(harness.binding.executions).toEqual(['c2'])
      expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '1', stage: 'held' }])
    },
  )

  it('22 release memory: the commit that deletes the entry writes the tombstone, with the exclusion as its basis', async () => {
    const commits: Commit[] = []
    const harness = startHarness({
      environment: new Map([['c1', 'rejected']]),
      store: memory => ({
        durability: 'none',
        read: domain => memory.read(domain),
        commit: input => {
          commits.push(input)
          return memory.commit(input)
        },
      }),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    const releases = commits.filter(releasesEntry('c1'))
    expect(releases).toHaveLength(1)
    expect(releases[0]?.writes).toContainEqual({
      kind: 'put',
      record: {
        kind: 'queue-release',
        release: {
          call: 'c1',
          basis: { kind: 'pre-start-rejection', exclusion: evidence('call-excluded-c1') },
        },
      },
    })
    expect(await harness.queue()).toEqual([])
    expect(await harness.released()).toEqual(['c1'])
  })

  it('22 release memory: a call that never got an entry is released with its tombstone, so its entry cannot appear later', async () => {
    const harness = startHarness({
      store: memory => losingCommits(memory, createsEntry, 'unavailable'),
    })
    await admitCall(harness, 'c1')
    expect(await harness.queue()).toEqual([])
    await settleElsewhere(harness)
    expect(await harness.released()).toEqual(['c1'])
    expect(await harness.queue()).toEqual([])
  })
})

describe('22 release basis: only a basis in the call domain releases a place', () => {
  /** Settles `call` with no start rejection: the logical end alone, which proves nothing. */
  async function settleWithoutBasis(harness: StartHarness, call: string): Promise<void> {
    const { read, record } = await callDomain(harness, call)
    const settled = { ...record, state: { ...record.state, phase: 'settled' } } as never
    const committed = await harness.memory.commit({
      domain: { kind: 'call', tenant: tenantA as never, call: callId(call) },
      expected: read.revision,
      revision: String(BigInt(read.revision) + 1n) as never,
      writes: [{ kind: 'put', record: { kind: 'call', call: settled } }],
    })
    expect(committed).toEqual({ kind: 'committed' })
  }

  it('22 release basis: a call that only settled keeps its entry through a reconcile, and no tombstone is written', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await settleWithoutBasis(harness, 'c1')
    expect((await callDomain(harness, 'c1')).record.state.phase).toBe('settled')
    const reconciled = ok(
      await harness.queues.reconcile({
        principal: principalA,
        tenant: tenantA,
        call: callId('c2'),
      }),
    )
    expect(reconciled.released).toEqual([])
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'preparing' },
      { call: 'c2', ordinal: '2', stage: 'preparing' },
    ])
    expect(await harness.released()).toEqual([])
  })

  it('22 release basis: a waiter removes the entry of a call whose start was rejected but whose release the queue missed, and starts', async () => {
    const harness = startHarness({
      environment: new Map([['c1', 'rejected']]),
      store: memory => losingCommits(memory, releasesEntry('c1'), 'unavailable'),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.runOnce('c1')
    // c1 settled; its release failed, so its entry and its queue task stay.
    expect((await harness.state('c1')).phase).toBe('settled')
    expect((await harness.queue()).map(entry => entry.call)).toEqual(['c1', 'c2'])
    // c2 waits behind c1's entry; its reconcile removes the entry and the host runs c2 again.
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
    expect(await harness.released()).toEqual(['c1'])
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'held' }])
    // The reconcile also asked the host to run c1, and that run closed its queue task.
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.tasks.map(task => task.kind)).toEqual(['deliver'])
  })
})

describe('22 reconcile: an entry on a basis goes whether or not its call owes a step', () => {
  it('22 reconcile: an entry whose call holds a basis and owes no queue step is removed, and the waiters of the key are woken', async () => {
    const harness = startHarness({
      environment: new Map([['c1', 'rejected']]),
      store: memory => losingCommits(memory, releasesEntry('c1'), 'unavailable'),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.runOnce('c1')
    // Close c1's queue task by hand: no run is left to repair its release, and no run to wake c2.
    const { read } = await callDomain(harness, 'c1')
    const task = read.records.find(record => record.kind === 'task' && record.task.kind === 'queue')
    if (task?.kind !== 'task') throw new Error('the settled call owes a queue task')
    expect(
      await harness.memory.commit({
        domain: { kind: 'call', tenant: tenantA as never, call: callId('c1') },
        expected: read.revision,
        revision: String(BigInt(read.revision) + 1n) as never,
        writes: [{ kind: 'delete', key: `task:queue:${task.task.operation}` }],
      }),
    ).toEqual({ kind: 'committed' })
    await harness.drive('c2')
    expect(await harness.released()).toEqual(['c1'])
    expect(harness.binding.executions).toEqual(['c2'])
  })
})

describe('22 queue step: the operation that moved an entry recalls it', () => {
  /** Admits `c1` and takes it through plan and environment, to the state that enqueue expects. */
  async function prepared(harness: StartHarness): Promise<void> {
    await admitCall(harness, 'c1')
    const preparation = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: request(),
        purpose: 'initial',
      }),
    )
    ok(
      await harness.commands.prepared({
        ...(await writeContext(harness, 'c1', 'c1/prepared')),
        preparation,
        resources,
      }),
    )
  }

  it('22 queue step: enqueue by another operation, after the entry was moved by the first and before its call commit, answers conflict', async () => {
    let second: Awaited<ReturnType<StartHarness['commands']['enqueue']>> | null = null
    const harness: StartHarness = startHarness({
      store: memory =>
        interleaving(memory, putsOperation('A/enqueue'), async () => {
          second = await harness.commands.enqueue(await writeContext(harness, 'c1', 'B/enqueue'))
        }),
    })
    await prepared(harness)
    const first = ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'A/enqueue')))
    expect(first.phase).toBe('queued')
    expect(failure(second as NonNullable<typeof second>)).toEqual({
      kind: 'conflict',
      operation: 'B/enqueue',
    })
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'ready' }])
  })

  it('22 queue step: prepareStart by another operation, after the entry was held by the first and before its call commit, answers conflict', async () => {
    let second: Awaited<ReturnType<StartHarness['commands']['prepareStart']>> | null = null
    const harness: StartHarness = startHarness({
      store: memory =>
        interleaving(memory, putsOperation('A/start'), async () => {
          second = await harness.commands.prepareStart(await writeContext(harness, 'c1', 'B/start'))
        }),
    })
    await prepared(harness)
    ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue')))
    const first = ok(
      await harness.commands.prepareStart(await writeContext(harness, 'c1', 'A/start')),
    )
    expect(first.state.phase).toBe('starting')
    expect(failure(second as NonNullable<typeof second>)).toEqual({
      kind: 'conflict',
      operation: 'B/start',
    })
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
  })

  it('22 queue step: a plan by another operation, after the first plan moved the entry past preparing, answers conflict and leaves the entry', async () => {
    const memory = createMemoryToolLedgerStore<Block>()
    const landing = landingAfterRead(memory, async () => {
      const preparation = ok(
        await harness.commands.planPreparation({
          ...(await writeContext(harness, 'c1', 'A/plan')),
          request: request(),
          purpose: 'initial',
        }),
      )
      ok(
        await harness.commands.prepared({
          ...(await writeContext(harness, 'c1', 'A/prepared')),
          preparation,
          resources,
        }),
      )
      ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'A/enqueue')))
    })
    const harness: StartHarness = startHarness({ memory, store: () => landing.store })
    await admitCall(harness, 'c1')
    const second = await writeContext(harness, 'c1', 'B/plan')
    // The first plan and its enqueue land after B read the call domain and before B's queue step.
    landing.arm(1)
    const reply = await harness.commands.planPreparation({
      ...second,
      request: request(),
      purpose: 'initial',
    })
    expect(failure(reply)).toEqual({ kind: 'conflict', operation: 'B/plan' })
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'ready' }])
  })

  it('22 queue step: the same operation recalls the held entry after its call commit was lost, and holds one slot', async () => {
    const harness = startHarness({
      store: memory => losingCommits(memory, putsOperation('A/start'), 'dropped'),
    })
    await prepared(harness)
    ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue')))
    const lost = await harness.commands.prepareStart(await writeContext(harness, 'c1', 'A/start'))
    expect(failure(lost)).toEqual({ kind: 'commit-unknown', operation: 'A/start' })
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
    const redone = ok(
      await harness.commands.prepareStart(await writeContext(harness, 'c1', 'A/start')),
    )
    expect(redone.state.phase).toBe('starting')
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
  })
})

describe('22 reconcile: the waiter repairs only what the call domain proves', () => {
  /**
   * c1 holds its slot in the queue and its start intent is about to commit when c2's reconcile
   * runs: the queue step of c1 landed, the call-domain commit has not. The window is the one a
   * redo of the owner leaves open.
   */
  async function reconcileInTheHoldWindow() {
    let reconciled: Awaited<ReturnType<StartHarness['queues']['reconcile']>> | null = null
    const harness: StartHarness = startHarness({
      store: memory =>
        interleaving(memory, putsOperation('op-c1/start'), async () => {
          reconciled = await harness.queues.reconcile({
            principal: principalA,
            tenant: tenantA,
            call: callId('c2'),
          })
        }),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    const preparation = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: request(),
        purpose: 'initial',
      }),
    )
    ok(
      await harness.commands.prepared({
        ...(await writeContext(harness, 'c1', 'c1/prepared')),
        preparation,
        resources,
      }),
    )
    ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue')))
    const started = await harness.commands.prepareStart(
      await writeContext(harness, 'c1', 'op-c1/start'),
    )
    return { harness, started, reconciled: reconciled as NonNullable<typeof reconciled> }
  }

  it('22 reconcile: a held entry is never moved back to ready from outside, so a start that lands after the reconcile stays held', async () => {
    const { harness, started, reconciled } = await reconcileInTheHoldWindow()
    expect(ok(started).state).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'preparing' },
    ])
    // The reconcile saw an owner that still owes a step and asked for it; it released nothing.
    expect(ok(reconciled)).toEqual({ released: [], redrive: ['c1'] })
  })

  it('22 reconcile: reads the call domains without a fence, so the in-flight redo of the owner is not excluded', async () => {
    const { harness, started } = await reconcileInTheHoldWindow()
    expect(started).toHaveProperty('ok')
    const { read } = await callDomain(harness, 'c1')
    expect(read.records.filter(record => record.kind === 'exclusion')).toEqual([])
  })
})
