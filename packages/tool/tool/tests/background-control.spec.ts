import { afterEach, describe, expect, it } from 'vitest'
import type { ControlReceipt, ToolControl } from '@omne-harness/tool-contract'
import type { Decision } from '../src/ledger-decider.ts'
import { controlIntent } from '../src/control-intent.ts'
import { decideControl, decideReleasePlaceholder } from '../src/ledger-control.ts'
import { taskKey } from '../src/ledger-store.ts'
import {
  admittedCallSnapshot,
  controlCommand,
  decideStop,
  runningCallSnapshot,
  STOP_OPERATION,
} from './control-decider-values.ts'
import {
  afterCommit,
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

describe('what a background control writes', () => {
  const lastControl = (decision: ReturnType<typeof committed>) =>
    (stateOf(decision).controls as Record_[]).at(-1)

  it('appends the control with relation-changed, and the moved call waits for nothing', async () => {
    const snapshot = permitted(await runningCallSnapshot())
    const before = (recordOf(snapshot).state as Record_).controls as unknown[]
    const decision = committed(decide(snapshot))
    expect(stateOf(decision).controls).toHaveLength(before.length + 1)
    expect(lastControl(decision)).toMatchObject({
      operation: STOP_OPERATION,
      intent: BACKGROUND,
      progress: { kind: 'relation-changed' },
    })
    expect(stateOf(decision).wait).toEqual({ kind: 'none' })
  })

  it('keeps the clock of a call that has not started', async () => {
    const snapshot = permitted(await admittedCallSnapshot())
    const timing = (recordOf(snapshot).state as Record_).timing
    expect(stateOf(committed(decide(snapshot))).timing).toEqual(timing)
  })

  it.each([
    ['a rejection', (s: CallSnapshot) => s, 'rejected'],
    [
      'an ended call',
      (s: CallSnapshot) =>
        withState(permitted(s), {
          phase: 'settled',
          execution: { kind: 'ended', evidence: evidence('ended') },
        }),
      'already-ended',
    ],
  ] as const)('appends one control record for %s', async (_name, edit, kind) => {
    const snapshot = edit(await runningCallSnapshot())
    const before = (recordOf(snapshot).state as Record_).controls as unknown[]
    const decision = committed(decide(snapshot))
    expect(stateOf(decision).controls).toHaveLength(before.length + 1)
    expect(lastControl(decision)).toMatchObject({ progress: { kind } })
  })

  it('rejects a running call whose wait is an Ask as an Ask wait', async () => {
    const snapshot = withState(permitted(await runningCallSnapshot()), {
      wait: {
        kind: 'ask',
        wait: 'op-c1/start/wait',
        registration: evidence('registration'),
        resume: evidence('resume'),
        decision: null,
      },
    })
    expect(committed(decide(snapshot)).value.progress).toMatchObject({
      kind: 'rejected',
      reason: 'ask-wait',
    })
  })

  it('withdraws a call that waits for a person when the intent says otherwise withdraw', async () => {
    const { harness } = await suspendedCall()
    const snapshot = permitted(await snapshotOfCall(harness))
    const decision = committed(decideStop(snapshot, { kind: 'background', otherwise: 'withdraw' }))
    expect(decision.value.state).toMatchObject({
      phase: 'settled',
      relation: 'foreground',
      terminal: { kind: 'interrupted', cause: { kind: 'control', withdrawn: true } },
    })
  })
})

describe('the public control intent', () => {
  it.each([
    [{ kind: 'background', otherwise: 'reject' }, true],
    [{ kind: 'background', otherwise: 'withdraw' }, true],
    [{ kind: 'background', otherwise: 'stop' }, false],
    [{ kind: 'background' }, false],
    [{ kind: 'background', otherwise: 'reject', extra: 1 }, false],
    [{ kind: 'withdraw', reach: 'all' }, true],
    [{ kind: 'withdraw', reach: 'foreground-and-unadmitted' }, true],
    [{ kind: 'withdraw', reach: 'all', extra: 1 }, false],
    [{ kind: 'withdraw', reach: 'some' }, false],
    [{ kind: 'stop', extra: 1 }, false],
    [{ kind: 1 }, false],
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

  function release(snapshot: CallSnapshot, changes: Record_ = {}, on: CallSnapshot = snapshot) {
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
    return decideReleasePlaceholder(on, command as never, mintOf(on))
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
  it('refuses an unknown call, another consumer and evidence of another owner', async () => {
    const { snapshot } = await moved()
    const consumer = (recordOf(snapshot).request as Record_).consumer as Record_
    expect(replied(release(snapshot, {}, { ...snapshot, call: null }))).toEqual(
      invalidOf('call', 'unknown-call'),
    )
    expect(
      replied(
        release(snapshot, {
          consumer: { ...consumer, position: 'other' },
          evidence: { kind: 'retained', custody: evidence('custody', 'consumer') },
        }),
      ),
    ).toEqual(invalidOf('consumer', 'mismatch'))
    expect(
      replied(
        release(snapshot, { evidence: { kind: 'retained', custody: evidence('custody', 'x') } }),
      ),
    ).toEqual(invalidOf('evidence.custody.owner', 'owner-mismatch'))
  })

  it('records the release as an operation, and a resend recalls it while other input conflicts', async () => {
    const { snapshot } = await moved()
    const first = committed(release(snapshot))
    const [operation] = putsOf(first.writes as never, 'operation')
    if (operation === undefined) throw new Error('the release wrote no operation record')
    expect((operation.operation as Record_).receipt).toEqual({
      kind: 'release-placeholder',
      delivery: first.value,
    })
    const recorded = afterCommit(snapshot, first.writes as never)
    expect(replied(release(recorded))).toEqual({ ok: first.value })
    expect(replied(release(recorded, { inputDigest: 'digest-other' }))).toMatchObject({
      failure: { kind: 'conflict' },
    })
  })

  it('mints the release evidence as a delivery fact that names its handoff', async () => {
    const { snapshot } = await moved()
    const one = committed(release(snapshot)).value
    const other = committed(
      release(snapshot, {
        evidence: { kind: 'retained', custody: evidence('custody-2', 'consumer') },
      }),
    ).value
    expect(one.evidence.record.startsWith('delivery:')).toBe(true)
    expect(one.evidence.digest).not.toBe(other.evidence.digest)
  })

  it('commits without a task delete when the placeholder task is already gone', async () => {
    const { snapshot } = await moved()
    const bare = { ...snapshot, tasks: snapshot.tasks.filter(task => task.kind !== 'placeholder') }
    const decision = committed(release(bare))
    expect(decision.writes.map(write => write.kind)).toEqual(['put', 'put'])
  })
})

describe('a withdraw of a call in the background (the background row of the control table)', () => {
  const WITHDRAW_ALL: ToolControl = { kind: 'withdraw', reach: 'all' }
  const WITHDRAW_FOREGROUND: ToolControl = { kind: 'withdraw', reach: 'foreground-and-unadmitted' }
  async function backgrounded() {
    const snapshot = permitted(await runningCallSnapshot())
    return after(snapshot, committed(decide(snapshot)))
  }

  it('withdraw all sends a stop to a running background call and leaves its original result to come', async () => {
    const moved = await backgrounded()
    const decision = committed(
      decide(moved, WITHDRAW_ALL, { operation: operationId('withdraw-c1') }),
    )
    expect(decision.value.progress.kind).toBe('pending')
    expect(tasksOf(decision).map(task => task.kind)).toEqual(['stop'])
    expect(stateOf(decision)).toMatchObject({ relation: 'background', phase: 'running' })
  })

  it('withdraw of the foreground and the unadmitted is out of reach for a background call and changes nothing', async () => {
    const moved = await backgrounded()
    const decision = committed(
      decide(moved, WITHDRAW_FOREGROUND, { operation: operationId('withdraw-c1') }),
    )
    expect(decision.value.progress).toMatchObject({ kind: 'rejected', reason: 'out-of-reach' })
    expect(tasksOf(decision)).toEqual([])
    expect(stateOf(decision)).toMatchObject({ relation: 'background', phase: 'running' })
  })

  it('a withdraw of a settled background call answers already-ended, whatever its reach', async () => {
    const moved = await backgrounded()
    const settled = withState(moved, {
      phase: 'settled',
      execution: { kind: 'ended', evidence: evidence('ended') },
    })
    for (const intent of [WITHDRAW_ALL, WITHDRAW_FOREGROUND]) {
      const decision = committed(decide(settled, intent, { operation: operationId('withdraw-c1') }))
      expect(decision.value.progress.kind).toBe('already-ended')
      expect(tasksOf(decision)).toEqual([])
    }
  })

  it('withdraw all of a background call that has not started stays unsupported, and the foreground reach still misses it', async () => {
    const snapshot = permitted(await admittedCallSnapshot())
    const moved = after(snapshot, committed(decide(snapshot)))
    expect(
      replied(decide(moved, WITHDRAW_ALL, { operation: operationId('withdraw-c1') })),
    ).toMatchObject({ failure: { kind: 'unsupported' } })
    const missed = committed(
      decide(moved, WITHDRAW_FOREGROUND, { operation: operationId('withdraw-c1') }),
    )
    expect(missed.value.progress).toMatchObject({ kind: 'rejected', reason: 'out-of-reach' })
  })

  it('a withdraw of a call in the foreground stays unsupported', async () => {
    const snapshot = await runningCallSnapshot()
    for (const intent of [WITHDRAW_ALL, WITHDRAW_FOREGROUND])
      expect(
        replied(decide(snapshot, intent, { operation: operationId('withdraw-c1') })),
      ).toMatchObject({ failure: { kind: 'unsupported' } })
  })
})
