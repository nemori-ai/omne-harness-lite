// The way from an admission to a recorded start through the real runtime, ledger and driver: the
// preparation before the queue, the FIFO head and slot, the admission capacity, the start guard,
// the start fence and the repair of a crash between the call domain and the queue domain.
import { afterEach, describe, expect, it } from 'vitest'
import {
  admission,
  adoption,
  callId,
  failure,
  fixedOf,
  fixedRequestForNamedSourceGuard,
  functionDefinition,
  instanceId,
  ok,
  operationId,
  principalA,
  principalB,
  request,
  tenantA,
  tenantB,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  losingCommits,
  startHarness,
  toStarting,
  writeContext,
  type StartHarness,
} from './start-values.ts'

/** Whether a commit writes the operation record of `operation`: the commit of that operation. */
function putsOperation(operation: string) {
  return (input: Parameters<Parameters<typeof losingCommits>[1]>[0]) =>
    input.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'operation' &&
        write.record.operation.operation === operation,
    )
}

/** Whether a commit is a queue-domain commit that deletes the entry of `call`: its release. */
function releasesEntry(call: string) {
  return (input: Parameters<Parameters<typeof losingCommits>[1]>[0]) =>
    input.domain.kind === 'queue' &&
    input.writes.some(write => write.kind === 'delete' && write.key === `entry:${call}`)
}

// Every scenario ends with every queue entry accounted for by its call domain (SPEC 22).
afterEach(auditQueues)

async function admitAll(harness: StartHarness, ...calls: readonly string[]): Promise<void> {
  for (const call of calls) await admitCall(harness, call)
}

describe('20 preparation and queue (P02, P03)', () => {
  it('20 order: an admitted call takes its ordinal before admit answers, in the order of admission', async () => {
    const harness = startHarness()
    await admitAll(harness, 'c1', 'c2', 'c3')
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'preparing' },
      { call: 'c2', ordinal: '2', stage: 'preparing' },
      { call: 'c3', ordinal: '3', stage: 'preparing' },
    ])
  })

  it('20 preparation: the environment is prepared before the call enters the queue, and the binding gets that environment', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.environments.prepared).toEqual(['c1'])
    expect(harness.binding.executions).toEqual(['c1'])
    expect(harness.binding.environments).toEqual([{ preparedFor: 'c1' }])
    const state = await harness.state('c1')
    expect(state).toMatchObject({
      phase: 'running',
      instance: instanceId,
      execution: { kind: 'live', start: 'op-c1/start' },
      queue: { kind: 'held', ordinal: '1' },
      timing: { kind: 'running', segment: { operation: 'op-c1/start' } },
    })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.preparations.map(preparation => preparation.operation)).toEqual(['op-c1/plan'])
    expect(recovery.start).toMatchObject({ kind: 'start', operation: 'op-c1/start' })
    expect(recovery.tasks).toEqual([])
  })

  it('20 preparation: a rejected environment settles the call unavailable without a start, and never falls back to the host', async () => {
    const harness = startHarness({ environment: new Map([['c1', 'rejected']]) })
    await admitAll(harness, 'c1', 'c2')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(harness.authority.excluded).toEqual(['c1'])
    expect(await harness.state('c1')).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'unavailable', reason: 'environment: isolation cannot be confirmed' },
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
    })
    // The rejected call released its place, so the next call of the key starts.
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'preparing' }])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('20 preparation: an unavailable environment provider leaves the call preparing and starts nothing', async () => {
    const harness = startHarness({ environment: new Map([['c1', 'unavailable']]) })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(harness.authority.excluded).toEqual([])
    expect(await harness.state('c1')).toMatchObject({
      phase: 'preparing',
      execution: { kind: 'not-started' },
    })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.tasks.map(task => task.kind)).toEqual(['prepare'])
  })

  it('20 preparation: the plan takes only the initial purpose and the admitted request, and leaves nothing when it refuses', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    const commits = harness.memory.commits
    const resume = await harness.commands.planPreparation({
      ...(await writeContext(harness, 'c1', 'c1/plan')),
      request: fixedOf(harness.internalRequests, 'c1'),
      purpose: 'resume',
    })
    expect(failure(resume)).toMatchObject({ kind: 'unsupported' })
    const other = {
      ...fixedOf(harness.internalRequests, 'c1'),
      arguments: { original: '{"path":"b"}', effective: '{"path":"b"}', complete: true },
    }
    expect(
      failure(
        await harness.commands.planPreparation({
          ...(await writeContext(harness, 'c1', 'c1/plan')),
          request: other,
          purpose: 'initial',
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'request', reason: 'not-the-fixed-request' })
    expect(harness.memory.commits).toBe(commits)
  })

  it('20 preparation: prepared accepts only a preparation this call planned, once', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    const planned = ok(
      await harness.commands.planPreparation({
        ...(await writeContext(harness, 'c1', 'c1/plan')),
        request: fixedOf(harness.internalRequests, 'c1'),
        purpose: 'initial',
      }),
    )
    const resources = { owner: 'o', record: 'env', revision: '1', digest: 'd' }
    const foreign = { ...planned, operation: operationId('c9/plan') }
    expect(
      failure(
        await harness.commands.prepared({
          ...(await writeContext(harness, 'c1', 'c1/prepared')),
          preparation: foreign,
          resources,
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'preparation', reason: 'not-planned-for-this-call' })
    ok(
      await harness.commands.prepared({
        ...(await writeContext(harness, 'c1', 'c1/prepared')),
        preparation: planned,
        resources,
      }),
    )
    expect(
      failure(
        await harness.commands.prepared({
          ...(await writeContext(harness, 'c1', 'c1/prepared-again')),
          preparation: planned,
          resources,
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'call', reason: 'already-prepared' })
  })

  it('20 queue: with limit 1, three calls attempt their starts strictly in admission order, whatever order their drivers run in', async () => {
    const harness = startHarness()
    await admitAll(harness, 'c1', 'c2', 'c3')
    // The first two starts are refused by the fence, so each releases its slot to the next call.
    harness.authority.refuse('c1')
    harness.authority.refuse('c2')
    await harness.drive('c3', 'c2', 'c1')
    expect(harness.binding.attempts).toEqual(['c1', 'c2', 'c3'])
    expect(harness.binding.executions).toEqual(['c3'])
    expect((await harness.state('c1')).phase).toBe('settled')
    expect((await harness.state('c2')).phase).toBe('settled')
    expect((await harness.state('c3')).phase).toBe('running')
  })

  it('20 queue: a held slot keeps the next call waiting at the head, and the wait is no failure', async () => {
    const harness = startHarness()
    await admitAll(harness, 'c1', 'c2')
    await harness.drive('c1', 'c2')
    expect(harness.binding.executions).toEqual(['c1'])
    expect(await harness.state('c2')).toMatchObject({
      phase: 'queued',
      queue: { kind: 'waiting', ordinal: '2' },
    })
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
  })

  it('20 queue: an earlier call that is still preparing is not overtaken', async () => {
    const harness = startHarness()
    await admitAll(harness, 'c1', 'c2')
    // c2 waits behind c1, and its reconcile asks the host to run c1, which still owes a step:
    // c1 starts, and c2 never starts ahead of it.
    await harness.drive('c2')
    expect(harness.binding.attempts).toEqual(['c1'])
    expect((await harness.state('c2')).phase).toBe('queued')
    await harness.drive('c1')
    expect(harness.binding.executions).toEqual(['c1'])
    expect((await harness.state('c2')).phase).toBe('queued')
  })

  it('20 queue: a call that runs in the background keeps its slot', async () => {
    const harness = startHarness()
    const background = {
      mode: 'background' as const,
      availability: {
        kind: 'available' as const,
        definition: functionDefinition({ backgroundAllowed: true }),
        executor: adoption('exec'),
      },
    }
    await admitCall(harness, 'c1', background)
    await admitCall(harness, 'c2', { availability: background.availability })
    await harness.drive('c1', 'c2')
    expect(await harness.state('c1')).toMatchObject({
      phase: 'running',
      relation: 'background',
      queue: { kind: 'held' },
      timing: { kind: 'paused' },
    })
    // The queue domain still counts the background call's slot, so a later run of c2 still waits.
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c1'])
    expect((await harness.state('c2')).phase).toBe('queued')
  })

  it('20 queue: null concurrency is no limit, and still the FIFO order', async () => {
    const harness = startHarness()
    const unlimited = { limits: { concurrency: null, foregroundMs: null, backgroundAfterMs: null } }
    await admitCall(harness, 'c1', unlimited)
    await admitCall(harness, 'c2', unlimited)
    await harness.drive('c1', 'c2')
    expect([...harness.binding.executions].sort()).toEqual(['c1', 'c2'])
  })

  it('20 capacity: an admission over the queue capacity is unavailable and not committed; a release makes room', async () => {
    const harness = startHarness({ queueCapacity: 2, environment: new Map([['c1', 'rejected']]) })
    await admitAll(harness, 'c1', 'c2')
    const commits = harness.memory.commits
    expect(
      await harness.runtime.invoke({ principal: principalA, tenant: tenantA, request: request() }),
    ).toEqual({
      kind: 'rejected',
      failure: {
        kind: 'unavailable',
        dependency: 'tool-queue',
        diagnostic: 'the queue of this scope and tool holds 2 unreleased calls, its capacity',
      },
    })
    expect(harness.memory.commits).toBe(commits)
    await harness.drive('c1')
    const admitted = await harness.runtime.invoke({
      principal: principalA,
      tenant: tenantA,
      request: request(),
    })
    if (admitted.kind !== 'accepted')
      throw new Error(`expected accepted: ${JSON.stringify(admitted)}`)
    expect(admitted.state.phase).toBe('accepted')
  })

  it('20 capacity: a dummy is not counted and not refused', async () => {
    const harness = startHarness({ queueCapacity: 1 })
    await admitCall(harness, 'c1')
    const dummy = request({
      availability: { kind: 'known-unavailable', definition: functionDefinition(), reason: 'gone' },
    })
    expect((await admitCall(harness, 'c2', dummy)).phase).toBe('settled')
  })
})

describe('21 start intent and start fence (P04)', () => {
  it('21 guard: a call whose start permission was withdrawn after admission settles unavailable, never started', async () => {
    const refused = new Set<string>()
    const harness = startHarness({ startRefused: refused })
    await admitAll(harness, 'c1', 'c2')
    refused.add('c1')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(harness.authority.excluded).toEqual(['c1'])
    const state = await harness.state('c1')
    expect(state).toMatchObject({
      phase: 'settled',
      terminal: {
        kind: 'unavailable',
        reason: 'the start is not permitted now: programmatic invocation is no longer permitted',
      },
      effect: { kind: 'not-started' },
      queue: { kind: 'released', evidence: { record: 'call-excluded-c1' } },
      delivery: { kind: 'pending' },
    })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.startRejection).toMatchObject({ exclusion: { record: 'call-excluded-c1' } })
    expect(recovery.tasks.map(task => task.kind)).toEqual(['deliver'])
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'preparing' }])
  })

  it('21 guard: an unreadable start guard starts nothing and settles nothing', async () => {
    const harness = startHarness({ startUnavailable: 'permission store down' })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(harness.authority.excluded).toEqual([])
    expect((await harness.state('c1')).phase).toBe('queued')
  })

  it('21 fence: a start the fence rejects settles unavailable with effect not-started and releases the slot', async () => {
    const harness = startHarness()
    await admitAll(harness, 'c1', 'c2')
    harness.authority.refuse('c1')
    await harness.drive('c1', 'c2')
    expect(await harness.state('c1')).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'unavailable', reason: 'guard invalidated' },
      effect: { kind: 'not-started' },
      execution: { kind: 'not-started' },
      queue: { kind: 'released', ordinal: '1' },
    })
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('21 fence: a lost recordStart answer never invokes the executor a second time', async () => {
    for (const fault of ['dropped', 'applied'] as const) {
      const harness = startHarness({
        store: memory => losingCommits(memory, putsOperation('op-c1/started'), fault),
      })
      await admitCall(harness, 'c1')
      await harness.drive('c1')
      expect([fault, harness.binding.attempts]).toEqual([fault, ['c1']])
      expect(harness.authority.consumed).toEqual(['c1'])
      expect((await harness.state('c1')).phase).toBe('running')
    }
  })

  it('21 fence: after a crash that lost the recordStart answer, a new run records the start without starting again', async () => {
    const harness = startHarness({
      store: memory => losingCommits(memory, putsOperation('op-c1/started'), 'unavailable'),
    })
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    // The run stopped with the start accepted by the fence and not recorded by the ledger.
    expect((await harness.state('c1')).phase).toBe('starting')
    expect(harness.binding.attempts).toEqual(['c1'])
    // The store answers again; the next run learns the acceptance from the fence.
    await harness.host.driver().run({
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
      instance: await harness.host.instanceOf(callId('c1')),
      signal: new AbortController().signal,
    })
    expect(harness.binding.attempts).toEqual(['c1'])
    expect(harness.authority.consumed).toEqual(['c1'])
    expect((await harness.state('c1')).phase).toBe('running')
  })

  it('21 fence: an unknown start answer starts nothing and keeps the start task', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    harness.authority.uncertain('c1')
    await harness.drive('c1')
    expect(harness.binding.attempts).toEqual([])
    expect(await harness.state('c1')).toMatchObject({ phase: 'starting', queue: { kind: 'held' } })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.tasks.map(task => task.kind)).toEqual(['start'])
  })

  it('21 record: not-started and unknown answers keep the start record and its task, each under its own operation', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    const start = await toStarting(harness, 'c1')
    const unknown = ok(
      await harness.commands.recordStart({
        ...(await writeContext(harness, 'c1', 'op-c1/record-1')),
        invocation: start,
        outcome: { kind: 'unknown', diagnostic: 'no answer' },
      }),
    )
    expect(unknown).toMatchObject({ phase: 'starting', execution: { kind: 'unknown' } })
    const excluded = ok(
      await harness.commands.recordStart({
        ...(await writeContext(harness, 'c1', 'op-c1/record-2')),
        invocation: start,
        outcome: {
          kind: 'not-started',
          exclusion: { owner: 'o', record: 'x', revision: '1', digest: 'd' },
        },
      }),
    )
    expect(excluded).toMatchObject({ phase: 'starting', execution: { kind: 'starting' } })
    const recovery = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(recovery.start).toEqual(start)
    expect(recovery.tasks.map(task => task.kind)).toEqual(['start'])
    expect(
      failure(
        await harness.commands.recordStart({
          ...(await writeContext(harness, 'c1', 'op-c1/record-3')),
          invocation: { ...start, operation: operationId('op-c1/other') },
          outcome: { kind: 'unknown', diagnostic: 'x' },
        }),
      ),
    ).toEqual({ kind: 'invalid', field: 'invocation', reason: 'not-the-start-record' })
  })

  it('21 intent: prepareStart is refused for a call that is not queued', async () => {
    const harness = startHarness()
    const accepted = await admitCall(harness, 'c1')
    const context = {
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
      instance: instanceId,
      generation: '1',
      operation: operationId('op-c1/start'),
      expected: accepted.revision,
    }
    expect(failure(await harness.commands.prepareStart(context))).toEqual({
      kind: 'invalid',
      field: 'call',
      reason: 'phase:accepted',
    })
  })

  it('21 intent: rejectPending is refused once the call holds a start record', async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    const running = await harness.state('c1')
    const context = {
      principal: principalA,
      tenant: tenantA,
      call: callId('c1'),
      instance: instanceId,
      generation: '1',
      operation: operationId('op-c1/late-reject'),
      expected: running.revision,
    }
    const exclusion = { owner: 'o', record: 'r', revision: '1', digest: 'd' }
    expect(
      failure(await harness.commands.rejectPending({ ...context, reason: 'too late', exclusion })),
    ).toEqual({ kind: 'invalid', field: 'call', reason: 'has-start-record' })
  })
})

describe('22 cross-domain commits and their repair', () => {
  it('22 repair: a release the queue domain missed after a rejection is redone from the pending task', async () => {
    const refused = new Set<string>(['c1'])
    const harness = startHarness({
      startRefused: refused,
      store: memory => losingCommits(memory, releasesEntry('c1'), 'unavailable'),
    })
    await admitAll(harness, 'c1', 'c2')
    await harness.drive('c1')
    // The call domain settled; the queue domain still holds the entry, and the task says so.
    expect((await harness.state('c1')).phase).toBe('settled')
    const pending = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(pending.tasks.map(task => task.kind).sort()).toEqual(['deliver', 'queue'])
    expect((await harness.queue()).map(entry => entry.call)).toEqual(['c1', 'c2'])
    await harness.drive('c1')
    const repaired = ok(await harness.commands.loadRecovery(admission('c1', 'op-c1')))
    expect(repaired.tasks.map(task => task.kind)).toEqual(['deliver'])
    expect((await harness.queue()).map(entry => entry.call)).toEqual(['c2'])
    await harness.drive('c2')
    expect(harness.binding.executions).toEqual(['c2'])
  })

  it('22 repair: a start intent whose call-domain answer was lost holds one slot, not two', async () => {
    const harness = startHarness({
      store: memory => losingCommits(memory, putsOperation('op-c1/start'), 'dropped'),
    })
    await admitAll(harness, 'c1', 'c2')
    await harness.drive('c1', 'c2')
    expect(harness.binding.executions).toEqual(['c1'])
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'held' },
      { call: 'c2', ordinal: '2', stage: 'ready' },
    ])
  })

  it('22 repair: an ordinal the admission could not assign is assigned by the preparation plan', async () => {
    const harness = startHarness({
      store: memory => losingCommits(memory, input => input.domain.kind === 'queue', 'unavailable'),
    })
    const accepted = await admitCall(harness, 'c1')
    expect(accepted.phase).toBe('accepted')
    expect(await harness.queue()).toEqual([])
    await harness.drive('c1')
    expect(harness.binding.executions).toEqual(['c1'])
  })
})

describe('23 driver run', () => {
  it('23 steps: a run takes at most driverStepsPerRun steps, and a run that used its whole budget with work left asks the host to run it again at once', async () => {
    const harness = startHarness({ driverStepsPerRun: 2 })
    await admitCall(harness, 'c1')
    harness.host.scheduled.splice(0)
    // Plan and environment are the first two steps; the run then yields and asks to go on.
    await harness.runOnce('c1')
    expect((await harness.state('c1')).phase).toBe('preparing')
    expect(harness.binding.executions).toEqual([])
    expect(harness.host.scheduled).toEqual([{ tenant: tenantA, call: callId('c1') }])
    const runs = 1 + (await harness.host.runScheduled())
    expect([runs, harness.binding.executions]).toEqual([3, ['c1']])
    expect(harness.host.scheduled).toEqual([])
    const unset = startHarness()
    await admitCall(unset, 'c1')
    await unset.drive('c1')
    expect((await unset.state('c1')).phase).toBe('running')
  })
})

/** A write context as the driver passes it: the WriteContext fields and the principal. */
type Context = Parameters<StartHarness['commands']['enqueue']>[0]

describe('19 write commands: boundary and qualification', () => {
  const writes = (harness: StartHarness) =>
    ({
      planPreparation: (input: Context) =>
        harness.commands.planPreparation({
          ...input,
          request: fixedRequestForNamedSourceGuard(),
          purpose: 'initial',
        }),
      prepared: (input: Context) =>
        harness.commands.prepared({
          ...input,
          preparation: {
            tenant: tenantA,
            call: callId('c1'),
            operation: operationId('op-c1/plan'),
            adoption: request().environment,
            inputDigest: 'sha256:x',
            purpose: 'initial',
            request: fixedRequestForNamedSourceGuard(),
          },
          resources: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
        }),
      enqueue: (input: Context) => harness.commands.enqueue(input),
      prepareStart: (input: Context) => harness.commands.prepareStart(input),
      rejectPending: (input: Context) =>
        harness.commands.rejectPending({
          ...input,
          reason: 'withdrawn',
          exclusion: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
        }),
      recordStart: (input: Context) =>
        harness.commands.recordStart({
          ...input,
          invocation: {
            kind: 'start',
            operation: operationId('op-c1/start'),
            executor: request().environment,
            execution: {
              tenant: tenantA as never,
              call: callId('c1'),
              instance: instanceId,
              generation: '1',
            },
          },
          outcome: { kind: 'unknown', diagnostic: 'x' },
        }),
    }) satisfies Record<string, (input: Context) => Promise<unknown>>

  it('19 boundary: every write command denies a principal of another tenant, a missing tenant and a missing principal before it reads', async () => {
    const harness = startHarness()
    const accepted = await admitCall(harness, 'c1')
    const context = {
      call: callId('c1'),
      instance: instanceId,
      generation: '1',
      operation: operationId('op-c1/x'),
      expected: accepted.revision,
    }
    const reads = harness.memory.reads
    for (const [name, write] of Object.entries(writes(harness))) {
      const run = write as (input: object) => Promise<unknown>
      for (const [label, input] of [
        ['foreign principal', { ...context, principal: principalB, tenant: tenantA }],
        ['foreign tenant', { ...context, principal: principalA, tenant: tenantB }],
        ['missing tenant', { ...context, principal: principalA }],
        ['missing principal', { ...context, tenant: tenantA }],
      ] as const)
        expect([name, label, await run(input)]).toEqual([
          name,
          label,
          { failure: { kind: 'denied', action: 'write' } },
        ])
    }
    expect(harness.memory.reads).toBe(reads)
    expect(
      await harness.commands.loadRecovery({
        principal: principalB,
        tenant: tenantA,
        call: callId('c1'),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'recover' } })
  })

  it("19 boundary: a driver run for another tenant's principal changes nothing", async () => {
    const harness = startHarness()
    await admitCall(harness, 'c1')
    await harness.host.driver().run({
      principal: principalB,
      tenant: tenantA,
      call: callId('c1'),
      instance: await harness.host.instanceOf(callId('c1')),
      signal: new AbortController().signal,
    })
    expect((await harness.state('c1')).phase).toBe('accepted')
    expect(harness.environments.prepared).toEqual([])
  })
})
