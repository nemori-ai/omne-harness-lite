import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerCommitInput, ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore, type MemoryToolLedgerStore } from '@omne-harness/tool/testing'
import {
  adoption,
  admission,
  fixedOf,
  callId,
  evidence,
  failure,
  interleaving,
  ok,
  principalA,
  tenantA,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  landingAfterRead,
  losingCommits,
  queueKey,
  startHarness,
  writeContext,
  type StartHarness,
} from './start-values.ts'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const resources = { owner: 'o', record: 'env', revision: '1', digest: 'd' }

type Commit = LedgerCommitInput

function createsEntry(input: Commit): boolean {
  return (
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'queue-entry')
  )
}

function releasesEntry(call: string) {
  return (input: Commit) =>
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'delete' && write.key === `entry:${call}`)
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

function windowStore(
  memory: MemoryToolLedgerStore,
  step: Step,
  fault: Fault,
  settle: () => Promise<void>,
  reads: { failing: number },
): ToolLedgerStore {
  let raced = false
  const racing: ToolLedgerStore = {
    durability: 'none',
    scanPending: input => memory.scanPending(input),
    readRecord: memory.readRecord,
    due: memory.due,
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

describe('22 release: a released call never regains an entry', () => {
  const cases = (['admit', 'plan'] as const).flatMap(step =>
    (['applied', 'delayed', 'read-fails', 'crash'] as const).map(fault => [step, fault] as const),
  )

  it.each(cases)(
    '22 release: a call that settles before the %s step creates its entry keeps no entry when that commit meets %s, and the next call starts',
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
        const refused = await harness.commands.planPreparation({
          ...(await writeContext(harness, 'c1', 'op-c1/plan')),
          request: fixedOf(harness.internalRequests, 'c1'),
          purpose: 'initial',
          environmentAdoption: adoption('environment'),
        })
        const answers = { 'read-fails': 'unavailable', delayed: 'commit-unknown' } as const
        expect(failure(refused)).toMatchObject({
          kind: answers[fault as 'read-fails' | 'delayed'] ?? 'stale-revision',
        })
      }
      reads.failing = 0
      expect(await harness.queue()).toEqual([])
      if (fault === 'delayed') expect(harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
      expect(await harness.queue()).toEqual([])
      expect(await harness.released('c1')).toBe(true)
      const again = await harness.ledger.admissions.admit(
        admission('c1', 'op-c1', fixedOf(harness.internalRequests, 'c1')),
      )
      expect(ok(again).recovered).toBe(true)
      expect(await harness.queue()).toEqual([])
      await admitCall(harness, 'c2')
      await harness.drive('c2')
      expect(harness.binding.executions).toEqual(['c2'])
      expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '1', stage: 'held' }])
    },
  )

  it('22 release: the release commit deletes the entry and writes nothing else', async () => {
    const commits: Commit[] = []
    const harness = startHarness({
      environment: new Map([['c1', 'rejected']]),
      store: memory => ({
        durability: 'none',
        scanPending: input => memory.scanPending(input),
        readRecord: memory.readRecord,
        due: memory.due,
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
    expect(releases[0]?.writes).toEqual([{ kind: 'delete', key: 'entry:c1' }])
    expect(await harness.queue()).toEqual([])
    expect(await harness.released('c1')).toBe(true)
  })

  it('22 release: a call that never got an entry is released without a queue commit, and a late plan for it makes no entry', async () => {
    const commits: Commit[] = []
    const harness = startHarness({
      store: memory =>
        losingCommits(
          {
            ...memory,
            commit: input => {
              commits.push(input)
              return memory.commit(input)
            },
          },
          createsEntry,
          'unavailable',
        ),
    })
    await admitCall(harness, 'c1')
    expect(await harness.queue()).toEqual([])
    const plan = await writeContext(harness, 'c1', 'op-c1/plan')
    await settleElsewhere(harness)
    expect(commits.filter(input => input.domain.kind === 'queue')).toEqual([])
    expect(await harness.released('c1')).toBe(true)
    const refused = await harness.commands.planPreparation({
      ...plan,
      request: fixedOf(harness.internalRequests, 'c1'),
      purpose: 'initial',
      environmentAdoption: adoption('environment'),
    })
    expect(failure(refused)).toMatchObject({ kind: 'stale-revision' })
    expect(await harness.queue()).toEqual([])
  })

  it('22 release: the queue domain holds its counter and nothing else after many released calls', async () => {
    const calls = ['c1', 'c2', 'c3', 'c4', 'c5']
    const harness = startHarness({
      environment: new Map(calls.map(call => [call, 'rejected'] as const)),
    })
    for (const call of calls) await admitCall(harness, call)
    await harness.drive(...calls)
    for (const call of calls) expect(await harness.released(call)).toBe(true)
    const read = await harness.memory.read({ kind: 'queue', tenant: tenantA, key: queueKey() })
    if (read.kind !== 'complete') throw new Error('the queue domain is unreadable')
    expect(read.records).toEqual([{ kind: 'queue-counter', counter: { next: '6' } }])
  })
})

describe('22 release basis: only a basis in the call domain releases a place', () => {
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

  it('22 release basis: a call that only settled keeps its entry through a reconcile', async () => {
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
    expect(await harness.released('c1')).toBe(false)
  })

  it('22 release basis: a waiter removes the entry of a call whose start was rejected but whose release the queue missed, and starts', async () => {
    const harness = startHarness({
      environment: new Map([['c1', 'rejected']]),
      store: memory => losingCommits(memory, releasesEntry('c1'), 'unavailable'),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.runOnce('c1')
    expect((await harness.state('c1')).phase).toBe('settled')
    expect((await harness.queue()).map(entry => entry.call)).toEqual(['c1', 'c2'])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
    expect(await harness.released('c1')).toBe(true)
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'held' }])
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
    expect(await harness.released('c1')).toBe(true)
    expect(harness.binding.executions).toEqual(['c2'])
  })
})

describe('22 queue step: the operation that moved an entry recalls it', () => {
  async function prepared(harness: StartHarness): Promise<void> {
    await admitCall(harness, 'c1')
    const preparation = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: fixedOf(harness.internalRequests, 'c1'),
        purpose: 'initial',
        environmentAdoption: adoption('environment'),
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
    const memory = createMemoryToolLedgerStore()
    const landing = landingAfterRead(memory, async () => {
      const preparation = ok(
        await harness.commands.planPreparation({
          ...(await writeContext(harness, 'c1', 'A/plan')),
          request: fixedOf(harness.internalRequests, 'c1'),
          purpose: 'initial',
          environmentAdoption: adoption('environment'),
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
    landing.arm(1)
    const reply = await harness.commands.planPreparation({
      ...second,
      request: fixedOf(harness.internalRequests, 'c1'),
      purpose: 'initial',
      environmentAdoption: adoption('environment'),
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
        request: fixedOf(harness.internalRequests, 'c1'),
        purpose: 'initial',
        environmentAdoption: adoption('environment'),
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
    expect(ok(reconciled)).toEqual({ released: [], redrive: ['c1'] })
  })

  it('22 reconcile: reads the call domains without a fence, so the in-flight redo of the owner is not excluded', async () => {
    const { harness, started } = await reconcileInTheHoldWindow()
    expect(started).toHaveProperty('ok')
    const { read } = await callDomain(harness, 'c1')
    expect(read.records.filter(record => record.kind === 'exclusion')).toEqual([])
  })
})
