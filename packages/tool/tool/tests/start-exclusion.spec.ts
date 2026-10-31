import { adoption } from './runtime-values.ts'
// The commands of the way to a start under a negative answer given in flight (SPEC 14), and the
// queue entries they leave (SPEC 22): a negative answer excludes a command from its first read on,
// whatever it did between that read and its transaction; a call that settled never keeps or gets
// a queue entry; and the driver redoes a start intent that was excluded while the queue held its
// slot, after which the slot is owned by a committed start (what runs it again: driver-retrigger).
import { afterEach, describe, expect, it } from 'vitest'
import {
  callId,
  fixedOf,
  evidence,
  failure,
  interleaving,
  ok,
  operationId,
  principalA,
  tenantA,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  landingAfterRead,
  losingCommits,
  startHarness,
  toStarting,
  writeContext,
  type StartHarness,
} from './start-values.ts'

// Every scenario ends with every queue entry accounted for by its call domain (SPEC 22).
afterEach(auditQueues)

const excludedOf = (operation: string) => ({
  kind: 'unavailable',
  dependency: 'ledger-store',
  diagnostic: `operation ${operation} was excluded by a negative answer; resubmit with the same identity`,
})

const resources = { owner: 'o', record: 'env', revision: '1', digest: 'd' }

/** Whether a commit is a queue-domain commit that creates a queue entry. */
function createsEntry(input: Parameters<Parameters<typeof losingCommits>[1]>[0]): boolean {
  return (
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'queue-entry')
  )
}

/** Whether a commit is a queue-domain commit that gives a slot to an entry. */
function holdsSlot(input: Parameters<Parameters<typeof losingCommits>[1]>[0]): boolean {
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

/** The operations the call domain of `call` committed, as the records hold them. */
async function committedOperations(harness: StartHarness, call: string): Promise<string[]> {
  const read = await harness.memory.read({
    kind: 'call',
    tenant: tenantA as never,
    call: callId(call),
  })
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  return read.records.flatMap(record =>
    record.kind === 'operation' ? [record.operation.operation as string] : [],
  )
}

/** The domain revision of the call domain of `call`. */
async function revisionOf(harness: StartHarness, call: string): Promise<bigint> {
  const read = await harness.memory.read({
    kind: 'call',
    tenant: tenantA as never,
    call: callId(call),
  })
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  return BigInt(read.revision)
}

/**
 * A harness whose store lets a negative answer about one operation land after the n-th read of a
 * call domain that follows `arm`. `answers` collects what the negative answers said.
 */
function windowed() {
  const answers: unknown[] = []
  let operation = ''
  let landing: ReturnType<typeof landingAfterRead> | null = null
  const harness = startHarness({
    store: memory => {
      landing = landingAfterRead(memory, async () => {
        answers.push(
          await harness.ledger.reads.operation({
            principal: principalA,
            tenant: tenantA,
            call: callId('c1'),
            operation: operationId(operation),
          }),
        )
      })
      return landing.store
    },
  })
  return {
    harness,
    answers,
    arm: (afterReads: number, about: string) => {
      operation = about
      landing?.arm(afterReads)
    },
  }
}

/** Admits `c1` and takes it through the commands up to the phase named. */
async function stage(harness: StartHarness, until: 'accepted' | 'prepared' | 'queued') {
  await admitCall(harness, 'c1')
  if (until === 'accepted') return
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
  if (until === 'queued')
    ok(await harness.commands.enqueue(await writeContext(harness, 'c1', 'c1/enqueue')))
}

/** Admits `c1` and takes it through the commands to `starting`; answers its start record. */
async function stageStarting(harness: StartHarness) {
  await admitCall(harness, 'c1')
  return toStarting(harness, 'c1')
}

describe('14 exclusion of the commands on the way to a start', () => {
  it('14 exclusion: a negative answer given after planPreparation read the call stops it, and the same identity then lands', async () => {
    const { harness, answers, arm } = windowed()
    await stage(harness, 'accepted')
    const before = await harness.state('c1')
    const input = {
      ...(await writeContext(harness, 'c1', 'op-c1/plan')),
      request: fixedOf(harness.internalRequests, 'c1'),
      purpose: 'initial' as const,
      environmentAdoption: adoption('environment'),
    }
    arm(1, 'op-c1/plan')
    expect(failure(await harness.commands.planPreparation(input))).toEqual(excludedOf('op-c1/plan'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/plan')
    expect(await harness.state('c1')).toEqual(before)
    expect(ok(await harness.commands.planPreparation(input)).purpose).toBe('initial')
    expect((await harness.state('c1')).phase).toBe('preparing')
  })

  it('14 exclusion: a negative answer given after enqueue read the call stops it, and the same identity then lands', async () => {
    const { harness, answers, arm } = windowed()
    await stage(harness, 'prepared')
    const before = await harness.state('c1')
    const input = await writeContext(harness, 'c1', 'op-c1/enqueue')
    arm(1, 'op-c1/enqueue')
    expect(failure(await harness.commands.enqueue(input))).toEqual(excludedOf('op-c1/enqueue'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/enqueue')
    expect(await harness.state('c1')).toEqual(before)
    expect(ok(await harness.commands.enqueue(input)).phase).toBe('queued')
  })

  it('14 exclusion: a negative answer given after prepareStart read the call stops it, and the same identity then lands on the slot the first try left', async () => {
    const { harness, answers, arm } = windowed()
    await stage(harness, 'queued')
    const before = await harness.state('c1')
    const input = await writeContext(harness, 'c1', 'op-c1/start')
    arm(1, 'op-c1/start')
    expect(failure(await harness.commands.prepareStart(input))).toEqual(excludedOf('op-c1/start'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/start')
    expect(await harness.state('c1')).toEqual(before)
    // The queue step of the stopped command is kept, and the redo recalls it (SPEC 22).
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
    expect(ok(await harness.commands.prepareStart(input)).state.phase).toBe('starting')
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'held' }])
    expect(harness.binding.attempts).toEqual([])
  })

  it('14 exclusion: a negative answer given after rejectPending read the call stops it, and the same identity then settles the call', async () => {
    const { harness, answers, arm } = windowed()
    await stage(harness, 'accepted')
    const before = await harness.state('c1')
    const input = {
      ...(await writeContext(harness, 'c1', 'op-c1/reject')),
      reason: 'the host excluded the invocation',
      exclusion: evidence('call-excluded-c1'),
    }
    arm(1, 'op-c1/reject')
    expect(failure(await harness.commands.rejectPending(input))).toEqual(excludedOf('op-c1/reject'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/reject')
    expect(await harness.state('c1')).toEqual(before)
    expect(ok(await harness.commands.rejectPending(input)).phase).toBe('settled')
    expect(await harness.queue()).toEqual([])
  })

  it('14 exclusion: a negative answer given before the clock is asked stops recordStart without a timing segment', async () => {
    const { harness, answers, arm } = windowed()
    const start = await stageStarting(harness)
    const before = await harness.state('c1')
    const input = {
      ...(await writeContext(harness, 'c1', 'op-c1/started')),
      invocation: start,
      outcome: { kind: 'started' as const, acceptance: evidence('accepted-c1') },
    }
    arm(1, 'op-c1/started')
    expect(failure(await harness.commands.recordStart(input))).toEqual(excludedOf('op-c1/started'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(harness.begun).toEqual([])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/started')
    expect(await harness.state('c1')).toEqual(before)
    expect(ok(await harness.commands.recordStart(input)).phase).toBe('running')
    expect(harness.begun).toEqual(['c1'])
  })

  it('14 exclusion: a negative answer given after the clock was asked stops recordStart, and nothing lands', async () => {
    const { harness, answers, arm } = windowed()
    const start = await stageStarting(harness)
    const before = await harness.state('c1')
    const input = {
      ...(await writeContext(harness, 'c1', 'op-c1/started')),
      invocation: start,
      outcome: { kind: 'started' as const, acceptance: evidence('accepted-c1') },
    }
    // Reads of the call domain: the first read, the read before the clock, the transaction.
    arm(2, 'op-c1/started')
    expect(failure(await harness.commands.recordStart(input))).toEqual(excludedOf('op-c1/started'))
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    expect(await committedOperations(harness, 'c1')).not.toContain('op-c1/started')
    expect(await harness.state('c1')).toEqual(before)
    expect(ok(await harness.commands.recordStart(input)).phase).toBe('running')
  })

  it('14 exclusion: a start intent excluded while the queue held its slot is redone by the driver, and its one slot is then owned by a committed start', async () => {
    const answers: unknown[] = []
    const replies: unknown[] = []
    let fence = 0n
    const harness: StartHarness = startHarness({
      commands: base => ({
        ...base,
        prepareStart: async input => {
          const reply = await base.prepareStart(input)
          if (input.call === callId('c1')) replies.push('ok' in reply ? 'started' : reply.failure)
          return reply
        },
      }),
      store: memory =>
        interleaving(memory, holdsSlot, async () => {
          answers.push(
            await harness.ledger.reads.operation({
              principal: principalA,
              tenant: tenantA,
              call: callId('c1'),
              operation: operationId('op-c1/start'),
            }),
          )
          fence = await revisionOf(harness, 'c1')
        }),
    })
    await admitCall(harness, 'c1')
    await admitCall(harness, 'c2')
    await harness.drive('c1', 'c2')
    expect(answers).toEqual([{ ok: { kind: 'not-committed' } }])
    // The first submission was excluded; the driver submitted the same identity again.
    expect(replies).toEqual([excludedOf('op-c1/start'), 'started'])
    expect(harness.binding.executions).toEqual(['c1'])
    expect((await harness.state('c1')).phase).toBe('running')
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
    // The start committed after the negative answer, as a new submission of the same identity.
    const resolved = ok(
      await harness.ledger.reads.operation({
        principal: principalA,
        tenant: tenantA,
        call: callId('c1'),
        operation: operationId('op-c1/start'),
      }),
    )
    expect(resolved).toMatchObject({ kind: 'committed' })
    expect(BigInt((resolved as { revision: string }).revision)).toBeGreaterThan(fence)
  })
})

describe('22 queue entries of calls that settled', () => {
  it('22 redo: after the call settles and its entry is released, resending admit leaves no entry for it and the next same-key call starts', async () => {
    const harness = startHarness({ environment: new Map([['c1', 'rejected']]) })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(await harness.queue()).toEqual([])
    const again = await harness.ledger.admissions.admit({
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
      operation: operationId('op-c1'),
      request: fixedOf(harness.internalRequests, 'c1'),
    })
    expect(ok(again).recovered).toBe(true)
    expect(await harness.queue()).toEqual([])
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
    expect((await harness.state('c2')).phase).toBe('running')
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'held' }])
  })

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

  it('22 redo: a call that settles between the admission and its queue step keeps no entry, and the next call starts', async () => {
    let settle: () => Promise<void> = () => Promise.resolve()
    const harness: StartHarness = startHarness({
      store: memory => interleaving(memory, createsEntry, () => settle()),
    })
    settle = () => settleElsewhere(harness)
    await admitCall(harness, 'c1')
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(await harness.queue()).toEqual([])
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('22 redo: a call that settles between planPreparation read it and its queue step keeps no entry, and the stale plan is refused', async () => {
    let armed = false
    let settle: () => Promise<void> = () => Promise.resolve()
    const harness: StartHarness = startHarness({
      store: memory =>
        interleaving(
          // The admission's queue step fails, so the plan is the step that creates the entry.
          losingCommits(memory, createsEntry, 'unavailable'),
          input => armed && createsEntry(input),
          () => settle(),
        ),
    })
    settle = () => settleElsewhere(harness)
    await admitCall(harness, 'c1')
    expect(await harness.queue()).toEqual([])
    armed = true
    const refused = await harness.commands.planPreparation({
      ...(await writeContext(harness, 'c1', 'op-c1/plan')),
      request: fixedOf(harness.internalRequests, 'c1'),
      purpose: 'initial',
      environmentAdoption: adoption('environment'),
    })
    // The settlement moved the state revision on, so the transaction refuses the stale plan.
    expect(failure(refused)).toMatchObject({ kind: 'stale-revision' })
    expect(await harness.queue()).toEqual([])
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })
})
