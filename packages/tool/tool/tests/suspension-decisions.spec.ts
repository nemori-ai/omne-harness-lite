// The decisions of the suspension commands (P06, P07) on a call that really runs in the ledger: a
// suspension is planned on the start that saved an Ask wait, committed with the binding's proof,
// and the wait opens on its registration. Each refusal names the fact that was wrong and writes
// nothing; a resend under the same operation answers what the first answer was.
import { describe, expect, it } from 'vitest'
import type { DurableEvidence, ToolRevision } from '@omne-harness/tool-contract'
import type { Checkpoint, SuspensionRecord, ToolClock } from '@omne-harness/tool-contract/provider'
import { createToolLedger } from '@omne-harness/tool'
import { nextRevision } from '../src/evidence.ts'
import { admitCall, startHarness } from './start-values.ts'
import {
  adoption,
  callId,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  tenantA,
  testSettlementPorts,
} from './runtime-values.ts'

const wait = 'op-facts/start/wait'
const resume = evidence('resume')
const schema = adoption('state-codec')

function askFact(waitId: string) {
  const shape = { id: 'schema', revision: '1', digest: 'sha256:schema' }
  return {
    kind: 'wait',
    value: {
      kind: 'ask',
      wait: waitId,
      resume,
      request: evidence('request'),
      schemas: {
        contract: adoption('contract'),
        request: shape,
        response: shape,
        requestMaxBytes: 1024,
        responseMaxBytes: 2048,
        expiry: 'forbidden',
        source: evidence('schemas'),
      },
    },
  }
}

/** A running call whose first segment saved an Ask wait fact and has not been suspended yet. */
async function waiting(withWait = true, waitId: string = wait) {
  const harness = startHarness()
  await admitCall(harness, 'facts')
  await harness.drive('facts')
  const access = { principal: principalA, tenant: tenantA, call: callId('facts') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  const start = recovery.start
  if (start === null) throw new Error('the fixture did not start')
  if (withWait)
    ok(
      await Reflect.apply(harness.commands.receiveFacts, null, [
        {
          ...access,
          start,
          batch: {
            start,
            source: evidence('facts-source'),
            batch: 'first',
            after: null,
            cursor: 'opaque/end',
            events: [{ event: 'event-1', fact: askFact(waitId) }],
          },
        },
      ]),
    )
  const revision = async (): Promise<ToolRevision> => (await harness.state('facts')).revision
  const write = async (operation: string) => ({
    ...access,
    instance: start.execution.instance,
    generation: start.execution.generation,
    operation: operationId(operation),
    expected: await revision(),
  })
  const records = async () => {
    const read = await harness.memory.read({ kind: 'call', tenant: tenantA, call: callId('facts') })
    if (read.kind !== 'complete') throw new Error('unreadable fixture')
    return read.records
  }
  /** Rewrites the stored call record or adds records, the way a state this ledger cannot reach by itself would stand. */
  const forge = async (
    edit: (record: { kind: string; call?: { state: object } }) => unknown,
    extra: readonly unknown[] = [],
  ) => {
    const read = await harness.memory.read({ kind: 'call', tenant: tenantA, call: callId('facts') })
    if (read.kind !== 'complete') throw new Error('unreadable fixture')
    const writes = [
      ...read.records.flatMap(record => {
        const edited = edit(record)
        return edited === null ? [] : [{ kind: 'put', record: edited }]
      }),
      ...extra.map(record => ({ kind: 'put', record })),
    ]
    const committed = await harness.memory.commit({
      domain: { kind: 'call', tenant: tenantA, call: callId('facts') },
      expected: read.revision,
      revision: nextRevision(read.revision),
      writes: writes as never,
    })
    if (committed.kind !== 'committed')
      throw new Error(`the forged state did not land: ${committed.kind}`)
  }
  const withState = (changes: Record<string, unknown>) =>
    forge(record =>
      record.kind === 'call'
        ? { ...record, call: { ...record.call, state: { ...record.call?.state, ...changes } } }
        : null,
    )
  const plan = async (operation = 'op-facts/start/suspension') =>
    harness.commands.planSuspension({ ...(await write(operation)), start, schema })
  const checkpointOf = (changes: Partial<Checkpoint> = {}): Checkpoint => ({
    schema,
    payload: resume,
    start,
    consumedResponses: [],
    effectBoundary: evidence('boundary'),
    exclusion: evidence('exclusion'),
    ...changes,
  })
  const suspend = async (
    suspension: SuspensionRecord,
    checkpoint: Checkpoint,
    operation = 'op-facts/start/suspended',
  ) =>
    harness.commands.suspend({
      ...(await write(operation)),
      suspension,
      checkpoint,
    })
  return {
    harness,
    access,
    start,
    plan,
    suspend,
    checkpointOf,
    write,
    records,
    revision,
    forge,
    withState,
  }
}

describe('planning a suspension', () => {
  it('records the suspension and its checkpoint duty, and answers a resend the same suspension', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    expect(planned).toMatchObject({
      operation: 'op-facts/start/suspension',
      start: f.start,
      schema,
    })
    const duty = (await f.records()).filter(
      record => record.kind === 'task' && record.task.kind === 'suspend',
    )
    expect(duty).toMatchObject([{ task: { operation: planned.operation, state: 'pending' } }])
    const commits = f.harness.memory.commits
    // The same operation again: the first answer, nothing written. The stale revision of the
    // resend is not judged, because the operation is already answered.
    expect(ok(await f.plan())).toEqual(planned)
    expect(f.harness.memory.commits).toBe(commits)
  })

  it('refuses a start that is not the start of the running call', async () => {
    const f = await waiting()
    const other = { ...f.start, operation: operationId('op-other/start') }
    const answer = await f.harness.commands.planSuspension({
      ...(await f.write('op-facts/start/suspension')),
      start: other,
      schema,
    })
    expect(answer).toEqual({
      failure: { kind: 'invalid', field: 'start', reason: 'not-the-start-record' },
    })
  })

  it('refuses a call whose segment did not end with a saved Ask wait', async () => {
    const f = await waiting(false)
    expect(await f.plan()).toEqual({
      failure: { kind: 'invalid', field: 'start', reason: 'no-saved-ask-wait' },
    })
  })

  it('refuses a second plan for the same start under another operation, naming the first', async () => {
    const f = await waiting()
    const first = ok(await f.plan())
    expect(await f.plan('op-facts/start/suspension-again')).toEqual({
      failure: { kind: 'conflict', operation: first.operation },
    })
  })

  it('refuses a resend whose content changed under the same operation', async () => {
    const f = await waiting()
    ok(await f.plan())
    const changed = await f.harness.commands.planSuspension({
      ...(await f.write('op-facts/start/suspension')),
      start: f.start,
      schema: adoption('another-codec'),
    })
    expect(changed).toEqual({
      failure: { kind: 'conflict', operation: operationId('op-facts/start/suspension') },
    })
  })
})

describe('planning a suspension on a call that cannot suspend', () => {
  it('refuses a background call: only a foreground call opens a wait', async () => {
    const f = await waiting()
    await f.withState({
      relation: 'background',
      foreground: { kind: 'background', call: callId('facts'), source: { kind: 'launched' } },
    })
    expect(await f.plan()).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'background-cannot-wait' },
    })
  })

  it.each([
    [
      'planSuspension',
      (f: Awaited<ReturnType<typeof waiting>>, expected: ToolRevision) =>
        f.harness.commands.planSuspension({
          ...f.access,
          instance: f.start.execution.instance,
          generation: f.start.execution.generation,
          operation: operationId('op-facts/start/suspension'),
          expected,
          start: f.start,
          schema,
        }),
    ],
  ] as const)('refuses a stale revision for %s and writes nothing', async (_name, send) => {
    const f = await waiting()
    const current = await f.revision()
    const before = await f.records()
    const answer = await send(f, nextRevision(nextRevision(current)))
    expect(answer).toEqual({ failure: { kind: 'stale-revision', current } })
    expect(await f.records()).toEqual(before)
  })

  it('answers a resend under the same operation with a conflict when its start changed', async () => {
    const f = await waiting()
    ok(await f.plan())
    const answer = await f.harness.commands.planSuspension({
      ...(await f.write('op-facts/start/suspension')),
      start: { ...f.start, operation: operationId('op-other/start') },
      schema,
    })
    expect(answer).toEqual({
      failure: { kind: 'conflict', operation: operationId('op-facts/start/suspension') },
    })
  })
})

describe('the timing of a suspension', () => {
  /** The suspension of the planned call by a ledger over the same records whose clock answers `elapsed`. */
  async function suspendedBy(elapsed: ToolClock['elapsed']) {
    const f = await waiting()
    const planned = ok(await f.plan())
    const ports = testSettlementPorts()
    const ledger = createToolLedger(
      f.harness.memory,
      guards(),
      {
        now: () => '2026-10-17T00:00:00.000Z',
        begin: () => Promise.reject(new Error('the segment began with the start')),
        elapsed,
        waitUntil: () => Promise.reject(new Error('waitUntil belongs to timing')),
      },
      configurationOf({}),
      { content: null, custody: ports.custody, releaseInspection: ports.releaseInspection },
    )
    const state = ok(
      await ledger.commands.suspend({
        ...(await f.write('op-facts/start/suspended')),
        suspension: planned,
        checkpoint: f.checkpointOf(),
      }),
    )
    return { f, state }
  }
  const measured = (milliseconds: string) => () =>
    Promise.resolve({ ok: { milliseconds, evidence: evidence('elapsed') } })

  it('pauses the timing with the elapsed time of the committed segment added', async () => {
    const { state } = await suspendedBy(measured('25'))
    expect(state.timing).toEqual({ kind: 'paused', accumulatedMs: '25' })
  })

  it('adds the elapsed time as an exact integer, however large', async () => {
    const { state } = await suspendedBy(measured('9007199254740993'))
    expect(state.timing).toEqual({ kind: 'paused', accumulatedMs: '9007199254740993' })
  })

  it.each([
    [
      'an elapsed time the clock cannot answer',
      () =>
        Promise.resolve({
          failure: { kind: 'unavailable', dependency: 'clock', diagnostic: 'down' },
        }),
    ],
    ['an elapsed time that is negative', measured('-5')],
    ['an elapsed time with leading zeros', measured('025')],
    ['an elapsed time that is not a number', measured('soon')],
    ['an elapsed time that is empty', measured('')],
    ['a clock that throws', () => Promise.reject(new Error('clock down'))],
  ] as const)('leaves the timing unknown, with its segment, for %s', async (_name, elapsed) => {
    const { f, state } = await suspendedBy(elapsed as ToolClock['elapsed'])
    expect(state).toMatchObject({
      phase: 'suspended',
      timing: { kind: 'unknown', accumulatedMs: '0', segment: { marker: expect.anything() } },
    })
    const clockTasks = (await f.records()).flatMap(record =>
      record.kind === 'task' && record.task.kind === 'clock' ? [record.task] : [],
    )
    expect(clockTasks).toMatchObject([{ state: 'blocked' }])
  })

  it('writes no clock duty when the elapsed time is known', async () => {
    const { f } = await suspendedBy(measured('0'))
    const kinds = (await f.records()).flatMap(record =>
      record.kind === 'task' ? [record.task.kind] : [],
    )
    expect(kinds).not.toContain('clock')
  })
})

describe('committing a suspension whose wait cannot be registered', () => {
  it('refuses a wait whose registration operation is not an identity, and commits nothing', async () => {
    // The registration operation is the wait identity and `/ensure`: a wait at the length limit has none.
    const f = await waiting(true, 'w'.repeat(256))
    const planned = ok(await f.plan())
    const before = await f.records()
    expect(await f.suspend(planned, f.checkpointOf())).toEqual({
      failure: { kind: 'invalid', field: 'wait', reason: 'length' },
    })
    expect(await f.records()).toEqual(before)
  })
})

describe('committing a suspension', () => {
  it('suspends the call at the checkpoint, opens the wait and owes its registration and its park', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    const state = ok(await f.suspend(planned, f.checkpointOf()))
    expect(state).toMatchObject({
      phase: 'suspended',
      checkpoint: resume,
      execution: { kind: 'suspended', checkpoint: resume },
      wait: { kind: 'none' },
    })
    const records = await f.records()
    expect(records.filter(record => record.kind === 'wait')).toMatchObject([
      { wait: { record: { phase: 'opening', intent: { wait } } } },
    ])
    const owed = records.flatMap(record => (record.kind === 'task' ? [record.task] : []))
    expect(owed).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'wait-registration',
          action: 'ensure',
          state: 'pending',
          wait,
        }),
        expect.objectContaining({ kind: 'suspend', operation: 'op-facts/start/suspended' }),
      ]),
    )
    // The duty of the plan is replaced by the duty of the commit, and the facts duty is gone.
    expect(owed.filter(task => task.kind === 'suspend')).toHaveLength(1)
    expect(owed.map(task => task.kind)).not.toContain('facts')
    const commits = f.harness.memory.commits
    expect(ok(await f.suspend(planned, f.checkpointOf()))).toEqual(state)
    expect(f.harness.memory.commits).toBe(commits)
  })

  it('answers a resend under the same operation with a conflict when its checkpoint changed', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    ok(await f.suspend(planned, f.checkpointOf()))
    expect(
      await f.suspend(planned, f.checkpointOf({ effectBoundary: evidence('elsewhere') })),
    ).toEqual({
      failure: { kind: 'conflict', operation: operationId('op-facts/start/suspended') },
    })
  })

  it('refuses a suspension that was never planned for this call', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    const forged = { ...planned, inputDigest: 'sha256:forged' }
    expect(await f.suspend(forged, f.checkpointOf())).toEqual({
      failure: { kind: 'invalid', field: 'suspension', reason: 'not-planned-for-this-call' },
    })
    const unplanned = { ...planned, operation: operationId('op-facts/start/unplanned') }
    expect(await f.suspend(unplanned, f.checkpointOf())).toEqual({
      failure: { kind: 'invalid', field: 'suspension', reason: 'not-planned-for-this-call' },
    })
  })

  it.each([
    [
      'a checkpoint of another schema',
      { schema: adoption('elsewhere') },
      'checkpoint.schema',
      'not-the-planned-schema',
    ],
    [
      'a checkpoint of another start',
      { start: { ...({} as object), operation: operationId('op-other/start') } },
      'checkpoint.start',
      'not-the-planned-start',
    ],
    [
      'a response this call never accepted',
      { consumedResponses: [operationId('op-facts/never-accepted')] },
      'checkpoint.consumedResponses',
      'not-accepted-by-this-call',
    ],
    [
      'a payload where the wait does not resume',
      { payload: evidence('elsewhere') },
      'checkpoint.payload',
      'not-the-resume-of-the-wait',
    ],
  ] as const)('refuses %s and keeps the call running', async (_name, changes, field, reason) => {
    const f = await waiting()
    const planned = ok(await f.plan())
    const checkpoint = f.checkpointOf(
      field === 'checkpoint.start'
        ? { start: { ...f.start, operation: operationId('op-other/start') } }
        : (changes as Partial<Checkpoint>),
    )
    const before = await f.records()
    expect(await f.suspend(planned, checkpoint)).toEqual({
      failure: { kind: 'invalid', field, reason },
    })
    expect(await f.records()).toEqual(before)
    expect((await f.harness.state('facts')).phase).toBe('running')
  })

  it('refuses a wait identity that the call used before', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    const running = (await f.records()).find(record => record.kind === 'call')
    ok(await f.suspend(planned, f.checkpointOf()))
    // The call runs again with the saved wait of the first segment: its wait exists already.
    await f.forge(record => (record.kind === 'call' ? running : record))
    expect(await f.suspend(planned, f.checkpointOf(), 'op-facts/start/suspended-again')).toEqual({
      failure: { kind: 'invalid', field: 'wait', reason: 'wait-identity-used' },
    })
  })

  it('refuses to suspend a call that is not running any more', async () => {
    const f = await waiting()
    const planned = ok(await f.plan())
    ok(await f.suspend(planned, f.checkpointOf()))
    expect(await f.suspend(planned, f.checkpointOf(), 'op-facts/start/suspended-again')).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'phase:suspended' },
    })
  })
})

/** A suspended call whose wait is opening: the registration is owed and has not been attached. */
async function suspended() {
  const f = await waiting()
  const planned = ok(await f.plan())
  const running = (await f.records()).find(record => record.kind === 'call')
  ok(await f.suspend(planned, f.checkpointOf()))
  const registration = evidence('registration', 'test-decisions')
  const attach = async (operation = 'op-facts/attach', name: string = wait) =>
    f.harness.commands.attachRegistration({
      ...(await f.write(operation)),
      wait: name as never,
      registration,
    })
  const owed = async () => {
    const task = (await f.records()).flatMap(record =>
      record.kind === 'task' && record.task.kind === 'wait-registration' ? [record.task] : [],
    )[0]
    if (task === undefined) throw new Error('no registration is owed')
    return task
  }
  const block = async (resolution: unknown, operation = 'op-facts/block', task?: unknown) =>
    Reflect.apply(f.harness.commands.recordTask, null, [
      { ...(await f.write(operation)), task: task === undefined ? await owed() : task, resolution },
    ]) as Promise<{ ok: DurableEvidence } | { failure: { kind: string } }>
  return { ...f, registration, attach, owed, block, running }
}

describe('opening the wait on its registration', () => {
  it('opens the wait with the registration, clears the ensure duty and answers a resend the same wait', async () => {
    const f = await suspended()
    const opened = ok(await f.attach())
    expect(opened).toMatchObject({
      phase: 'open',
      intent: { wait },
      value: { kind: 'ask', wait, registration: f.registration, resume, decision: null },
    })
    expect(await f.harness.state('facts')).toMatchObject({
      phase: 'suspended',
      wait: { kind: 'ask', wait, registration: f.registration },
    })
    const duties = (await f.records()).filter(
      record => record.kind === 'task' && record.task.kind === 'wait-registration',
    )
    expect(duties).toEqual([])
    const commits = f.harness.memory.commits
    expect(ok(await f.attach())).toEqual(opened)
    expect(f.harness.memory.commits).toBe(commits)
  })

  it('keeps every duty that is not the ensure of this wait', async () => {
    const f = await suspended()
    const duty = await f.owed()
    await f.forge(
      () => null,
      [
        {
          kind: 'task',
          task: { ...duty, operation: operationId('op-other/ensure'), wait: 'op-other' },
        },
        {
          kind: 'task',
          task: { ...duty, operation: operationId('op-facts/invalidate'), action: 'invalidate' },
        },
      ],
    )
    ok(await f.attach())
    const kept = (await f.records()).flatMap(record =>
      record.kind === 'task' ? [`${record.task.kind}:${record.task.operation}`] : [],
    )
    expect(kept).toEqual(
      expect.arrayContaining([
        'wait-registration:op-other/ensure',
        'wait-registration:op-facts/invalidate',
        'suspend:op-facts/start/suspended',
      ]),
    )
    expect(kept).not.toContain(`wait-registration:${duty.operation}`)
  })

  it('refuses a stale revision, and a call that is not suspended', async () => {
    const f = await suspended()
    const current = await f.revision()
    expect(
      await f.harness.commands.attachRegistration({
        ...(await f.write('op-facts/attach-stale')),
        expected: nextRevision(nextRevision(current)),
        wait: wait as never,
        registration: f.registration,
      }),
    ).toEqual({ failure: { kind: 'stale-revision', current } })
    // The record of the running segment stands again, as a revision that lagged behind would leave it.
    await f.forge(record => (record.kind === 'call' ? f.running : record))
    expect(await f.attach('op-facts/attach-running')).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'phase:running' },
    })
  })

  it('refuses a wait the call does not have, and a wait that is open already', async () => {
    const f = await suspended()
    expect(await f.attach('op-facts/attach-other', 'op-facts/start/other-wait')).toEqual({
      failure: { kind: 'invalid', field: 'wait', reason: 'unknown-wait' },
    })
    ok(await f.attach())
    expect(await f.attach('op-facts/attach-again')).toEqual({
      failure: { kind: 'invalid', field: 'wait', reason: 'phase:open' },
    })
  })

  it('answers a resend under the same operation with a conflict when the wait changed', async () => {
    const f = await suspended()
    ok(await f.attach())
    expect(await f.attach('op-facts/attach', 'op-facts/start/other-wait')).toEqual({
      failure: { kind: 'conflict', operation: operationId('op-facts/attach') },
    })
  })
})

describe('blocking the registration of a wait that the decision owner refused', () => {
  it('keeps the duty with its reason and answers a resend the same evidence', async () => {
    const f = await suspended()
    const before = await f.owed()
    const evidenceOf = ok(await f.block({ kind: 'blocked', reason: 'denied' }))
    expect(await f.owed()).toEqual({ ...before, state: 'blocked', diagnostic: 'denied' })
    const commits = f.harness.memory.commits
    expect(
      ok(await f.block({ kind: 'blocked', reason: 'denied' }, 'op-facts/block', before)),
    ).toEqual(evidenceOf)
    expect(f.harness.memory.commits).toBe(commits)
  })

  it('refuses a duty that is not a pending registration of this call', async () => {
    const f = await suspended()
    const duty = await f.owed()
    const resolution = { kind: 'blocked', reason: 'denied' }
    expect(
      await f.block(resolution, 'op-facts/block', { ...duty, wait: 'op-facts/other' }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'task', reason: 'pending-registration-required' },
    })
    ok(await f.block(resolution))
    // A blocked duty is a verdict already: it is not blocked a second time.
    expect(await f.block(resolution, 'op-facts/block-again', await f.owed())).toEqual({
      failure: { kind: 'invalid', field: 'task', reason: 'pending-registration-required' },
    })
  })

  it.each([
    ['a text', 'blocked'],
    ['null', null],
    ['a resolution of another kind', { kind: 'retry', reason: 'denied' }],
    ['a reason that is not text', { kind: 'blocked', reason: 5 }],
    ['an empty reason', { kind: 'blocked', reason: '' }],
    ['a resolution with a field of its own', { kind: 'blocked', reason: 'denied', extra: 1 }],
    ['a resolution without a reason', { kind: 'blocked' }],
  ])('refuses %s as the resolution and keeps the duty pending', async (_name, resolution) => {
    const f = await suspended()
    const before = await f.records()
    expect(await f.block(resolution)).toEqual({
      failure: { kind: 'invalid', field: 'resolution', reason: 'blocked-with-reason-required' },
    })
    expect(await f.records()).toEqual(before)
  })

  it.each([null, 'text', 5])('does not take %s for a registration duty', async task => {
    const f = await suspended()
    const answer = await f.block({ kind: 'blocked', reason: 'denied' }, 'op-facts/block', task)
    // Only a registration duty goes to the blocking; another value is a task this ledger does not record.
    expect(answer).toMatchObject({ failure: { kind: 'unsupported' } })
  })
})
