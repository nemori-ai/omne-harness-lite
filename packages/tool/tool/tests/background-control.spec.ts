import { afterEach, describe, expect, it } from 'vitest'
import type { ControlReceipt, ToolControl } from '@omne-harness/tool-contract'
import type { Decision } from '../src/ledger-decider.ts'
import { controlIntent } from '../src/control-intent.ts'
import { decideControl, decideReleasePlaceholder } from '../src/ledger-control.ts'
import { taskKey } from '../src/ledger-store.ts'
import {
  admittedCallSnapshot,
  controlCommand,
  runningCallSnapshot,
  STOP_OPERATION,
} from './control-decider-values.ts'
import {
  committed,
  invalidOf,
  mintOf,
  putsOf,
  replied,
  snapshotOfCall,
  suspendedCall,
  withCall,
  withState,
  type CallSnapshot,
  type Record_,
} from './resumption-decider-values.ts'
import { evidence, operationId, principalA, tenantA } from './runtime-values.ts'
import { auditQueues } from './start-values.ts'

afterEach(auditQueues)

const BACKGROUND: ToolControl = { kind: 'background', otherwise: 'reject' }

function permitted(snapshot: CallSnapshot): CallSnapshot {
  return withCall(snapshot, record => {
    const request = record.request as Record_
    const availability = request.availability as Record_
    const definition = availability.definition as Record_
    return {
      ...record,
      request: {
        ...request,
        availability: { ...availability, definition: { ...definition, backgroundAllowed: true } },
      },
    }
  })
}

function recordOf(snapshot: CallSnapshot): Record_ {
  if (snapshot.call === null) throw new Error('the snapshot has no call')
  return snapshot.call as unknown as Record_
}

function decide(
  snapshot: CallSnapshot,
  intent: ToolControl = BACKGROUND,
  changes: Record_ = {},
): Decision<ControlReceipt> {
  const decision = decideControl(snapshot, controlCommand(intent, changes), null, mintOf(snapshot))
  if (decision.kind === 'prepare-synthetic')
    throw new Error('a background control prepares no result')
  return decision
}

function callOf(decision: ReturnType<typeof committed>) {
  const [put] = putsOf(decision.writes as never, 'call')
  if (put === undefined) throw new Error('the decision wrote no call record')
  return put.call as Record_
}

function stateOf(decision: ReturnType<typeof committed>) {
  return callOf(decision).state as Record_
}

function tasksOf(decision: ReturnType<typeof committed>) {
  return putsOf(decision.writes as never, 'task').map(put => put.task as Record_)
}

function after(snapshot: CallSnapshot, decision: ReturnType<typeof committed>): CallSnapshot {
  const tasks = tasksOf(decision)
  return {
    ...withCall(snapshot, () => callOf(decision)),
    tasks: [...snapshot.tasks, ...(tasks as never[])],
  }
}

describe('background control of a call (the control intent × call state table)', () => {
  it('moves a running foreground call to the background in one commit and owes one placeholder', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const before = recordOf(snapshot).state as Record_
    const decision = committed(decide(snapshot))
    const state = stateOf(decision)
    expect(state.relation).toBe('background')
    expect(state.phase).toBe('running')
    expect(state.execution).toEqual(before.execution)
    expect(state.queue).toEqual(before.queue)
    expect(state.foreground).toMatchObject({
      kind: 'background',
      call: before.call,
      source: { kind: 'control', operation: STOP_OPERATION },
      delivery: { kind: 'pending' },
    })
    expect(decision.value.progress.kind).toBe('relation-changed')
    const tasks = tasksOf(decision)
    expect(tasks.map(task => task.kind)).toEqual(['placeholder'])
    expect(tasks[0]).toMatchObject({ state: 'pending', operation: STOP_OPERATION })
  })

  it('moves a call that has not started yet, and it keeps its place in the queue', async () => {
    const snapshot = permitted(await admittedCallSnapshot())
    const before = recordOf(snapshot).state as Record_
    const state = stateOf(committed(decide(snapshot)))
    expect(state.relation).toBe('background')
    expect(state.phase).toBe(before.phase)
    expect(state.queue).toEqual(before.queue)
  })

  it('closes the foreground clock with the elapsed time the command carries', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const timing = (recordOf(snapshot).state as Record_).timing as Record_
    expect(timing.kind).toBe('running')
    const closed = { kind: 'paused', accumulatedMs: '1200' }
    const state = stateOf(
      committed(decide(snapshot, BACKGROUND, { timing: { from: timing, closed } })),
    )
    expect(state.timing).toEqual(closed)
  })

  it('records an unknown foreground time when the command carries no closed timing for this segment', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const state = stateOf(committed(decide(snapshot)))
    expect(state.timing).toMatchObject({ kind: 'unknown', diagnostic: 'moved-to-background' })
  })

  it.each([
    [
      'the definition does not permit the background',
      (s: CallSnapshot) => s,
      'background-not-allowed',
    ],
    [
      'the call waits for an external input',
      (s: CallSnapshot) =>
        withState(permitted(s), {
          wait: {
            kind: 'resource',
            wait: 'op-c1/start/wait',
            contract: { id: 'contract', version: '1' },
            deadline: null,
            resume: evidence('resume'),
            registration: evidence('registration'),
          },
        }),
      'waiting',
    ],
  ] as const)('rejects when %s, and the call does not change', async (_name, edit, reason) => {
    const snapshot = edit(await runningCallSnapshot())
    const before = recordOf(snapshot).state as Record_
    const decision = committed(decide(snapshot))
    expect(decision.value.progress).toMatchObject({ kind: 'rejected', reason })
    const state = stateOf(decision)
    expect(state.relation).toBe('foreground')
    expect(state.foreground).toEqual(before.foreground)
    expect(tasksOf(decision)).toEqual([])
  })

  it('rejects a call that waits for a person (Ask) and keeps the wait', async () => {
    const { harness } = await suspendedCall()
    const snapshot = permitted(await snapshotOfCall(harness))
    const decision = committed(decide(snapshot))
    expect(decision.value.progress).toMatchObject({ kind: 'rejected', reason: 'ask-wait' })
    expect(stateOf(decision)).toMatchObject({ phase: 'suspended', relation: 'foreground' })
    expect(tasksOf(decision)).toEqual([])
  })

  it('answers relation-changed for a call in the background and does not move it a second time', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const first = committed(decide(snapshot))
    const moved = after(snapshot, first)
    const second = committed(
      decide(moved, BACKGROUND, { operation: operationId('background-c1-again') }),
    )
    expect(second.value.progress.kind).toBe('relation-changed')
    expect(stateOf(second).foreground).toEqual(stateOf(first).foreground)
    expect(tasksOf(second)).toEqual([])
  })

  it('answers already-ended for a settled call', async () => {
    const snapshot = withState(permitted(await runningCallSnapshot()), {
      phase: 'settled',
      execution: { kind: 'ended', evidence: evidence('ended') },
    })
    const decision = committed(decide(snapshot))
    expect(decision.value.progress.kind).toBe('already-ended')
    expect(tasksOf(decision)).toEqual([])
  })

  it('answers the receipt again for a resend of the same operation', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const first = committed(decide(snapshot))
    const recorded = {
      ...snapshot,
      operations: new Map([
        ...snapshot.operations,
        ...putsOf(first.writes as never, 'operation').map(
          put => [(put.operation as Record_).operation as string, put.operation as never] as const,
        ),
      ]),
    }
    expect(replied(decide(recorded))).toEqual({ ok: first.value })
  })
})

describe('the public control intent', () => {
  it.each([
    [{ kind: 'background', otherwise: 'reject' }, true],
    [{ kind: 'background', otherwise: 'withdraw' }, true],
    [{ kind: 'background', otherwise: 'stop' }, false],
    [{ kind: 'background' }, false],
    [{ kind: 'background', otherwise: 'reject', extra: 1 }, false],
  ])('parses %j: %s', (intent, accepted) => {
    expect('ok' in controlIntent({ intent })).toBe(accepted)
  })
})

describe('release of the placeholder delivery', () => {
  async function moved() {
    const snapshot = permitted(await runningCallSnapshot())
    const decision = committed(decide(snapshot))
    const foreground = stateOf(decision).foreground as Record_
    const delivery = foreground.delivery as Record_
    return { snapshot: after(snapshot, decision), delivery }
  }

  function placeholderDelivery(snapshot: CallSnapshot): unknown {
    const foreground = (recordOf(snapshot).state as Record_).foreground as Record_ | null
    return foreground === null ? 'd0' : (foreground.delivery as Record_).delivery
  }

  function release(snapshot: CallSnapshot, changes: Record_ = {}) {
    const consumer = (recordOf(snapshot).request as Record_).consumer
    const command = {
      principal: principalA,
      tenant: tenantA,
      call: recordOf(snapshot).call,
      operation: operationId('release-placeholder-c1'),
      inputDigest: 'digest-release',
      delivery: placeholderDelivery(snapshot),
      consumer,
      evidence: { kind: 'retained', custody: evidence('custody', 'consumer') },
      ...changes,
    }
    return decideReleasePlaceholder(snapshot, command as never, mintOf(snapshot))
  }

  it('releases a pending placeholder and drops its task', async () => {
    const { snapshot } = await moved()
    const decision = committed(release(snapshot))
    expect(decision.value.kind).toBe('released')
    expect(stateOf(decision).foreground).toMatchObject({ delivery: { kind: 'released' } })
    const deleted = decision.writes.flatMap(write => (write.kind === 'delete' ? [write.key] : []))
    expect(deleted).toContain(taskKey({ kind: 'placeholder', operation: STOP_OPERATION }))
  })

  it('answers the released delivery again once it is released', async () => {
    const { snapshot } = await moved()
    const first = committed(release(snapshot))
    const released = withCall(snapshot, () => callOf(first))
    expect(replied(release(released))).toEqual({ ok: first.value })
  })

  it('refuses another delivery identity and a call without a placeholder', async () => {
    const { snapshot } = await moved()
    expect(replied(release(snapshot, { delivery: 'd9' }))).toEqual(
      invalidOf('delivery', 'mismatch'),
    )
    expect(replied(release(permitted(await runningCallSnapshot())))).toEqual(
      invalidOf('placeholder', 'none'),
    )
  })
})
