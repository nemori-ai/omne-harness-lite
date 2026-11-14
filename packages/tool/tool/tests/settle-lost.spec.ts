import { afterEach, describe, expect, it } from 'vitest'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence, ToolFailure, ToolState } from '@omne-harness/tool-contract'
import { invalidationOperation } from '../src/ledger-control.ts'
import { decideSettleLost, settleLostWith } from '../src/ledger-lost.ts'
import { settleLostExecution } from '../src/lost-execution.ts'
import {
  committed,
  continued,
  FIRST,
  invalidOf,
  mintOf,
  putsOf,
  replied,
  snapshotOfCall,
  suspendedCall,
  withState,
  withWait,
  type CallSnapshot,
} from './resumption-decider-values.ts'
import {
  adoption,
  callId,
  evidence,
  functionDefinition,
  ok,
  operationId,
  principalA,
  tenantA,
  textFactory,
  type Principal,
} from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  toStarting,
  writeContext,
  type StartHarness,
} from './start-values.ts'

afterEach(auditQueues)

const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }
const CONTINUITY = evidence('state-lock')
const LOST = operationId('op-c1/start/lost')
const LOST_TERMINAL = { kind: 'failed', cause: 'runtime-lost' } as const
const LOST_EFFECT = { kind: 'unknown' } as const

const settle = (
  harness: StartHarness,
  continuity: DurableEvidence = CONTINUITY,
  operation = LOST,
) => harness.commands.settleLost({ ...ACCESS, operation, continuity })

const recovery = async (harness: StartHarness) => ok(await harness.commands.loadRecovery(ACCESS))

async function starting() {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  const start = await toStarting(harness, 'c1')
  return { harness, start }
}

async function live() {
  const harness = startHarness()
  await admitCall(harness, 'c1')
  await harness.drive('c1')
  return harness
}

async function unknown() {
  const { harness, start } = await starting()
  ok(
    await harness.commands.recordStart({
      ...(await writeContext(harness, 'c1', 'op-c1/started')),
      invocation: start,
      outcome: { kind: 'unknown', diagnostic: 'the start answer was lost' },
    }),
  )
  return harness
}

async function background() {
  const harness = startHarness()
  await admitCall(harness, 'c1', {
    mode: 'background',
    availability: {
      kind: 'available',
      definition: functionDefinition({ backgroundAllowed: true }),
      executor: adoption('exec'),
      layer: { kind: 'official' },
    },
  })
  await harness.drive('c1')
  return harness
}

const COMMAND = { ...ACCESS, operation: LOST, continuity: CONTINUITY, inputDigest: 'digest' }

function preparedFor(need: unknown, operation = LOST, original: unknown = { kind: 'none' }) {
  const made = ok(textFactory().text('lost'))
  return {
    id: operationId('prepared-lost-c1'),
    operation,
    inputDigest: 'digest',
    need,
    basis: evidence('prepared-lost'),
    policy: null as never,
    state: { kind: 'prepared', value: { ...made, original } },
  }
}

function decideLost(
  snapshot: CallSnapshot,
  command: Readonly<Record<string, unknown>> = COMMAND,
  prepare: (need: unknown) => unknown = need => preparedFor(need),
) {
  const first = decideSettleLost(snapshot, command as never, null, mintOf(snapshot))
  if (first.kind !== 'prepare-synthetic') return first
  const decided = decideSettleLost(
    snapshot,
    command as never,
    prepare(first.need) as never,
    mintOf(snapshot),
  )
  if (decided.kind === 'prepare-synthetic') throw new Error('the decider asked to prepare twice')
  return decided
}

const tasksOf = (writes: readonly unknown[]) =>
  putsOf(writes as never, 'task').map(record => record['task'] as Readonly<Record<string, unknown>>)

function expectLost(state: ToolState) {
  expect(state).toMatchObject({
    phase: 'settled',
    terminal: LOST_TERMINAL,
    effect: LOST_EFFECT,
    execution: { kind: 'lost', evidence: CONTINUITY },
    delivery: { kind: 'pending' },
    wait: { kind: 'none' },
  })
  expect(state.queue.kind === 'released' ? state.queue.evidence : null).toEqual(CONTINUITY)
}

describe('settleLost: an execution that started and whose continuity is lost', () => {
  it.each([
    ['starting', async () => (await starting()).harness],
    ['live', live],
    ['unknown', unknown],
  ] as const)(
    'a call whose execution is %s settles failed, runtime-lost, effect unknown, and is not run again',
    async (kind, build) => {
      const harness = await build()
      expect((await recovery(harness)).state.execution.kind).toBe(kind)
      const attempts = harness.binding.attempts.length
      expectLost(ok(await settle(harness)))
      const after = await recovery(harness)
      expectLost(after.state)
      expect(after.tasks.map(task => task.kind).sort()).toEqual(
        after.state.timing.kind === 'unknown'
          ? ['clock', 'deliver', 'queue']
          : ['deliver', 'queue'],
      )
      expect(after.result).not.toBeNull()
      await harness.drive('c1')
      expect(await harness.released('c1')).toBe(true)
      expect(harness.binding.attempts).toHaveLength(attempts)
      if (after.state.phase !== 'settled') throw new Error('not settled')
      const page = ok(
        await harness.ledger.reads.result({ ...ACCESS, result: after.state.result, after: null }),
      )
      expect(page).toMatchObject({
        terminal: LOST_TERMINAL,
        effect: LOST_EFFECT,
        actualTerminal: null,
        relation: 'original',
      })
    },
  )

  it('the same operation with the same continuity answers the original state, and writes nothing more', async () => {
    const harness = await live()
    const first = ok(await settle(harness))
    const revision = (await recovery(harness)).state.revision
    expect(ok(await settle(harness))).toEqual(first)
    expect((await recovery(harness)).state.revision).toBe(revision)
  })

  it('the same operation with another continuity is a conflict', async () => {
    const harness = await live()
    ok(await settle(harness))
    expect(await settle(harness, evidence('another-lock'))).toEqual({
      failure: { kind: 'conflict', operation: LOST },
    })
  })

  it('a settled call answers a conflict that names the operation that settled it', async () => {
    const harness = await live()
    ok(await settle(harness))
    expect(await settle(harness, CONTINUITY, operationId('op-c1/start/lost-again'))).toEqual({
      failure: { kind: 'conflict', operation: LOST },
    })
  })

  it('a call that never started is refused, and stays as it was', async () => {
    const harness = startHarness()
    const admitted = await admitCall(harness, 'c1')
    expect(await settle(harness)).toEqual({
      failure: { kind: 'invalid', field: 'execution', reason: 'started-execution-required' },
    })
    expect((await recovery(harness)).state).toEqual(admitted)
  })

  it('a call the ledger does not hold is refused', async () => {
    const harness = startHarness()
    expect(await settle(harness)).toMatchObject({ failure: { kind: 'invalid', field: 'call' } })
  })

  it('a continuity that is no evidence is refused at the boundary', async () => {
    const harness = await live()
    expect(await settle(harness, { owner: 'o' } as never)).toMatchObject({
      failure: { kind: 'invalid', field: 'continuity.record' },
    })
    expect((await recovery(harness)).state.phase).toBe('running')
  })

  it('a call that is suspended on a wait is refused: no execution of it can be lost', async () => {
    const { harness } = await suspendedCall()
    expect((await recovery(harness)).state.execution.kind).toBe('suspended')
    expect(await settle(harness)).toEqual({
      failure: { kind: 'invalid', field: 'execution', reason: 'started-execution-required' },
    })
    expect((await recovery(harness)).state.phase).toBe('suspended')
  })

  it('a stop that was never dispatched to the lost execution is dropped with it, and its control is closed as already-ended in the same commit', async () => {
    const harness = await live()
    const stop = operationId('stop-c1')
    ok(await harness.commands.control({ ...ACCESS, operation: stop, intent: { kind: 'stop' } }))
    const before = await recovery(harness)
    expect(before.tasks.map(task => task.kind)).toContain('stop')
    expect(before.state.controls.map(control => control.progress.kind)).toEqual(['pending'])
    const settled = ok(await settle(harness))
    expectLost(settled)
    expect(settled.controls).toEqual([
      {
        ...before.state.controls[0],
        progress: { kind: 'already-ended', evidence: CONTINUITY },
      },
    ])
    const after = await recovery(harness)
    expect(after.tasks.map(task => task.kind)).not.toContain('stop')
    expect(after.state.controls).toEqual(settled.controls)
    expect(after.state.revision).toBe(settled.revision)
  })

  it('a lost resume segment closes the wait it was answering and owes the invalidation of its registration', async () => {
    const built = await suspendedCall({ resume: () => new Promise(() => {}) })
    const { snapshot } = await continued(built, { kind: 'declined' })
    expect(snapshot.call?.state.execution.kind).toBe('live')
    expect(snapshot.waits.get(FIRST)?.record.phase).toBe('responding')
    const command = { ...ACCESS, operation: LOST, continuity: CONTINUITY, inputDigest: 'digest' }
    const first = decideSettleLost(snapshot, command as never, null, mintOf(snapshot))
    if (first.kind !== 'prepare-synthetic') throw new Error('the decider did not ask for a result')
    expect(first.need).toMatchObject({ terminal: LOST_TERMINAL })
    const made = ok(textFactory().text('lost'))
    const prepared = {
      id: operationId('prepared-lost-c1'),
      operation: LOST,
      inputDigest: 'digest',
      need: first.need,
      basis: evidence('prepared-lost'),
      policy: null as never,
      state: { kind: 'prepared', value: { ...made, original: { kind: 'none' } } },
    }
    const decided = decideSettleLost(
      snapshot,
      command as never,
      prepared as never,
      mintOf(snapshot),
    )
    if (decided.kind === 'prepare-synthetic') throw new Error('the decider asked to prepare twice')
    const { writes, value } = committed(decided)
    expectLost(value)
    expect(putsOf(writes, 'wait')).toEqual([
      expect.objectContaining({
        wait: expect.objectContaining({
          record: expect.objectContaining({
            phase: 'closed',
            cause: 'terminal',
            evidence: value.source,
          }),
        }),
      }),
    ])
    expect(putsOf(writes, 'task').map(record => record['task'])).toContainEqual(
      expect.objectContaining({
        kind: 'wait-registration',
        action: 'invalidate',
        wait: FIRST,
        operation: invalidationOperation(FIRST),
        state: 'pending',
        evidence: value.source,
      }),
    )
  })

  it('the caller derives the operation from the start record of the lost execution', async () => {
    const harness = await live()
    const { start } = await recovery(harness)
    if (start === null) throw new Error('no start record')
    expectLost(ok(await settleLostExecution(harness.commands, ACCESS, start, CONTINUITY)))
    expect(ok(await settle(harness))).toMatchObject({ phase: 'settled' })
  })
})

describe('decideSettleLost: the records of the lost execution after the commit', () => {
  it('a running timing becomes unknown with execution-end-clock-marker-unavailable and keeps its other fields; a blocked clock task carries the same diagnostic', async () => {
    const snapshot = await snapshotOfCall(await live())
    const before = snapshot.call?.state.timing
    expect(before?.kind).toBe('running')
    const { writes, value } = committed(decideLost(snapshot))
    expect(value.timing).toEqual({
      ...before,
      kind: 'unknown',
      diagnostic: 'execution-end-clock-marker-unavailable',
    })
    expect(tasksOf(writes).filter(task => task['kind'] === 'clock')).toEqual([
      {
        kind: 'clock',
        operation: LOST,
        state: 'blocked',
        diagnostic: 'execution-end-clock-marker-unavailable',
        basis: value.source,
      },
    ])
  })

  it('a timing that is already unknown stays as it was, and the blocked clock task carries its own diagnostic', async () => {
    const live_ = await snapshotOfCall(await live())
    const running = live_.call?.state.timing
    const timing = {
      ...running,
      kind: 'unknown',
      diagnostic: 'original-clock-observation-unavailable',
    }
    const { writes, value } = committed(decideLost(withState(live_, { timing })))
    expect(value.timing).toEqual(timing)
    expect(tasksOf(writes).filter(task => task['kind'] === 'clock')).toEqual([
      expect.objectContaining({
        state: 'blocked',
        diagnostic: 'original-clock-observation-unavailable',
      }),
    ])
  })

  it('a paused timing is closed with its accumulated time, and no clock task is written', async () => {
    const snapshot = await snapshotOfCall((await starting()).harness)
    const before = snapshot.call?.state.timing
    expect(before?.kind).toBe('paused')
    const { writes, value } = committed(decideLost(snapshot))
    expect(value.timing).toEqual({
      kind: 'closed',
      accumulatedMs: before?.kind === 'paused' ? before.accumulatedMs : null,
    })
    expect(tasksOf(writes).map(task => task['kind'])).not.toContain('clock')
  })

  it('the tasks owed to the lost execution and the ensure of a wait registration are deleted; every other task stays', async () => {
    const snapshot = await snapshotOfCall(await live())
    const task = (kind: string, action?: string) => ({
      kind,
      operation: operationId(`other/${kind}${action === undefined ? '' : `/${action}`}`),
      state: 'pending',
      diagnostic: null,
      ...(action === undefined ? {} : { action }),
    })
    const superseded = [
      'queue',
      'prepare',
      'start',
      'answer',
      'stop',
      'suspend',
      'settle',
      'facts',
      'fact-ack',
    ].map(kind => task(kind))
    const ensure = task('wait-registration', 'ensure')
    const kept = [
      task('wait-registration', 'invalidate'),
      task('resource-wait', 'ensure'),
      task('clock'),
      task('deliver'),
      task('release'),
      task('account'),
    ]
    const withTasks = {
      ...snapshot,
      tasks: [...snapshot.tasks, ...superseded, ensure, ...kept] as never,
    }
    const { writes } = committed(decideLost(withTasks))
    const key = (owed: Readonly<{ kind: string; operation: string }>) =>
      `task:${owed.kind}:${owed.operation}`
    expect(writes.filter(write => write.kind !== 'put')).toEqual(
      [...snapshot.tasks, ...superseded, ensure].map(owed => ({ kind: 'delete', key: key(owed) })),
    )
  })

  it('a wait that is already closed is left as it was: no wait is written and no invalidation is owed', async () => {
    const built = await suspendedCall({ resume: () => new Promise(() => {}) })
    await continued(built, { kind: 'declined' })
    const snapshot = await snapshotOfCall(built.harness)
    expect(snapshot.call?.state.execution.kind).toBe('live')
    expect(snapshot.waits.get(FIRST)?.record.phase).toBe('closed')
    const { writes } = committed(decideLost(snapshot))
    expect(putsOf(writes, 'wait')).toEqual([])
    expect(tasksOf(writes).map(task => task['kind'])).not.toContain('wait-registration')
  })

  it('an open wait from which no invalidation operation derives refuses the settlement with wait, no-invalidation-operation, and nothing is committed', async () => {
    const built = await suspendedCall({ resume: () => new Promise(() => {}) })
    const { snapshot } = await continued(built, { kind: 'declined' })
    const unnamed = 'w'.repeat(250)
    expect(invalidationOperation(unnamed)).toBeNull()
    const edited = withWait(snapshot, FIRST, found => {
      const record = found['record'] as Readonly<Record<string, Readonly<Record<string, unknown>>>>
      return { ...found, record: { ...record, intent: { ...record['intent'], wait: unnamed } } }
    })
    expect(replied(decideLost(edited))).toEqual(invalidOf('wait', 'no-invalidation-operation'))
  })

  it('an operation that the ledger recorded for another command answers the conflict of the recall, and nothing is committed', async () => {
    const snapshot = await snapshotOfCall(await live())
    const admission = operationId('op-c1')
    expect(snapshot.operations.get(admission)?.receipt.kind).not.toBe('settle-lost')
    const decided = decideLost(snapshot, { ...COMMAND, operation: admission }, need =>
      preparedFor(need, admission),
    )
    expect(replied(decided)).toEqual({ failure: { kind: 'conflict', operation: admission } })
  })

  it('a prepared result of another operation answers the conflict of the synthetic channels, and nothing is committed', async () => {
    const snapshot = await snapshotOfCall(await live())
    const decided = decideLost(snapshot, COMMAND, need =>
      preparedFor(need, operationId('another-lost')),
    )
    expect(replied(decided)).toEqual({ failure: { kind: 'conflict', operation: LOST } })
  })

  it('a prepared result whose original is offloaded answers the failure of the settlement writes, and nothing is committed', async () => {
    const snapshot = await snapshotOfCall(await live())
    const offloaded = { kind: 'offloaded', bodyId: 'body-1', retention: { expiresAt: '1' } }
    const decided = decideLost(snapshot, COMMAND, need => preparedFor(need, LOST, offloaded))
    expect(replied(decided)).toEqual(
      invalidOf('original.source', 'body-settlement-requires-a-settlement-instant'),
    )
  })

  it('a foreground call settles foreground, with a final foreground that names the result version of this settlement', async () => {
    const { value } = committed(decideLost(await snapshotOfCall(await live())))
    if (value.phase !== 'settled') throw new Error('not settled')
    expect(value.relation).toBe('foreground')
    expect(value.foreground).toEqual({ kind: 'final', result: value.result })
  })

  it('a background call settles background and keeps its background foreground, not a final one', async () => {
    const snapshot = await snapshotOfCall(await background())
    const before = snapshot.call?.state
    expect(before?.relation).toBe('background')
    const { value } = committed(decideLost(snapshot))
    expectLost(value)
    expect(value.relation).toBe('background')
    expect(value.foreground).toEqual(before?.foreground)
    expect(value.foreground).not.toMatchObject({ kind: 'final' })
  })

  it('a held queue place is released with the continuity evidence, and one pending queue task names the settlement', async () => {
    const snapshot = await snapshotOfCall(await live())
    const before = snapshot.call?.state.queue
    expect(before?.kind).toBe('held')
    const { writes, value } = committed(decideLost(snapshot))
    expect(value.queue).toEqual({ ...before, kind: 'released', evidence: CONTINUITY })
    expect(tasksOf(writes).filter(task => task['kind'] === 'queue')).toEqual([
      { kind: 'queue', operation: LOST, state: 'pending', diagnostic: null, basis: value.source },
    ])
  })
})

describe('settleLostWith and settleLostExecution: refusals before the ledger', () => {
  const lostWith = (access: Outcome<unknown, ToolFailure>) => {
    const asked = { access: [] as string[], settle: 0 }
    const run = settleLostWith<Principal>({
      access: (_context, action) => {
        asked.access.push(action)
        return Promise.resolve(access)
      },
      settle: () => {
        asked.settle += 1
        return Promise.resolve(
          fail({ kind: 'unavailable', dependency: 'ledger', diagnostic: 'asked' } as const),
        )
      },
    })
    return { asked, run }
  }

  it('an input that is not a mutation input is refused at the boundary, and neither the access nor the ledger is asked', async () => {
    const { asked, run } = lostWith(succeed(null))
    expect(await run({ ...ACCESS, continuity: CONTINUITY })).toMatchObject({
      failure: { kind: 'invalid', field: 'operation' },
    })
    expect(asked).toEqual({ access: [], settle: 0 })
  })

  it('a refusal of the access check is the answer, and the ledger is not asked', async () => {
    const denied = { kind: 'unavailable', dependency: 'access', diagnostic: 'down' } as const
    const { asked, run } = lostWith(fail(denied))
    expect(await run({ ...ACCESS, operation: LOST, continuity: CONTINUITY })).toEqual({
      failure: denied,
    })
    expect(asked).toEqual({ access: ['write'], settle: 0 })
  })

  it('a start record whose derived lost operation is no operation identity answers invalid operation, and the ledger is not asked', async () => {
    const asked: unknown[] = []
    const commands = {
      settleLost: (input: unknown) => {
        asked.push(input)
        return Promise.resolve(succeed(null))
      },
    }
    const start = { operation: operationId('o'.repeat(252)) }
    expect(
      await settleLostExecution(commands as never, ACCESS, start as never, CONTINUITY),
    ).toEqual({ failure: { kind: 'invalid', field: 'operation', reason: 'length' } })
    expect(asked).toEqual([])
  })
})
