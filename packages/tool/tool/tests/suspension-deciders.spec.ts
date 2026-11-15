import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  decideAttachRegistration,
  decideBlockRegistration,
  decideClosePark,
  decideCompleteInvalidation,
  decidePlanSuspension,
  decideSuspend,
  parkDutyOf,
  savedWaitOf,
} from '../src/ledger-suspension.ts'
import { taskKey } from '../src/ledger-store.ts'
import { asking } from './checkpoint-values.ts'
import { evidence, operationId, tenantA } from './runtime-values.ts'
import {
  CALL,
  FIRST,
  afterCommit,
  committed,
  continued,
  invalidOf,
  mintOf,
  putsOf,
  replied,
  snapshotOfCall,
  suspendedCall,
  withFacts,
  withState,
  withSuspensions,
  withWait,
  withWaitRecord,
  type CallSnapshot,
  type Record_,
  type Suspended,
} from './resumption-decider-values.ts'

function first<T>(items: readonly T[]): T {
  const [item] = items
  if (item === undefined) throw new Error('nothing was captured')
  return item
}

function planOf(built: Suspended) {
  const { snapshot, input } = first(built.before.planSuspension)
  const command = {
    tenant: tenantA,
    call: CALL,
    operation: input.operation,
    expected: input.expected,
    inputDigest: 'digest-plan',
    start: input.start,
    schema: input.schema,
  }
  return { snapshot, command }
}

function suspendOf(
  built: Suspended,
  index = 0,
  timing: Record_ = { kind: 'closed', accumulatedMs: '5' },
) {
  const { snapshot, input } = built.before.suspend[index] ?? first(built.before.suspend)
  const command = {
    tenant: tenantA,
    call: CALL,
    operation: input.operation,
    expected: input.expected,
    inputDigest: 'digest-suspend',
    suspension: input.suspension,
    checkpoint: input.checkpoint,
    state: input.state,
    timing: timing as never,
  }
  return { snapshot, command }
}

function attachOf(built: Suspended) {
  const { snapshot, input } = first(built.before.attachRegistration)
  const command = {
    tenant: tenantA,
    call: CALL,
    operation: input.operation,
    expected: input.expected,
    inputDigest: 'digest-attach',
    wait: input.wait,
    registration: input.registration,
  }
  return { snapshot, command }
}

describe('savedWaitOf: the Ask wait fact that a segment ended with', () => {
  it('finds the saved Ask wait of the start, and nothing for another start or another kind of wait', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = planOf(built)
    expect(savedWaitOf(snapshot, command.start)).toMatchObject({
      fact: { kind: 'wait', value: { kind: 'ask', wait: FIRST } },
    })
    const elsewhere = { ...command.start, operation: operationId('op-other/start') }
    expect(savedWaitOf(snapshot, elsewhere)).toBeUndefined()
    const resource = withFacts(snapshot, fact =>
      fact.fact !== undefined && (fact.fact as Record_).kind === 'wait'
        ? { ...fact, fact: { ...(fact.fact as Record_), value: { kind: 'resource' } } }
        : fact,
    )
    expect(savedWaitOf(resource, command.start)).toBeUndefined()
  })
})

describe('decidePlanSuspension: the plan of a suspension', () => {
  it('saves the suspension without its checkpoint and the duty that owes the checkpoint', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = planOf(built)
    const mint = mintOf(snapshot)
    const decision = committed(decidePlanSuspension(snapshot, command, mint))
    const suspension = {
      tenant: tenantA,
      call: CALL,
      operation: command.operation,
      adoption: command.start.executor,
      inputDigest: 'digest-plan',
      start: command.start,
      schema: command.schema,
    }
    expect(decision.value).toEqual(suspension)
    const [call] = putsOf(decision.writes, 'call') as unknown as [{ call: { state: Record_ } }]
    expect(call.call.state).toMatchObject({ phase: 'running', revision: mint.revision })
    expect(putsOf(decision.writes, 'suspension')).toEqual([
      { kind: 'suspension', suspension: { suspension, checkpoint: null } },
    ])
    expect(putsOf(decision.writes, 'task')).toEqual([
      {
        kind: 'task',
        task: {
          kind: 'suspend',
          operation: command.operation,
          state: 'pending',
          diagnostic: null,
          suspension,
        },
      },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      {
        operation: {
          operation: command.operation,
          inputDigest: 'digest-plan',
          receipt: { kind: 'plan-suspension', suspension },
        },
      },
    ])
    expect(decision.writes).toHaveLength(4)
  })

  it('answers a resend with the suspension it saved, and a changed input with a conflict', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = planOf(built)
    const first = committed(decidePlanSuspension(snapshot, command, mintOf(snapshot)))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decidePlanSuspension(after, command, mintOf(snapshot)))).toEqual({
      ok: first.value,
    })
    expect(
      replied(
        decidePlanSuspension(
          after,
          { ...command, inputDigest: 'digest-changed' },
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: command.operation } })
  })
})

describe('decideSuspend: the commit of a suspension', () => {
  it('suspends the call, opens the wait, and removes only the duty of the plan and the duties of the stream', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = suspendOf(built)
    const stray = {
      kind: 'queue',
      operation: operationId('op-stray'),
      state: 'pending',
      diagnostic: null,
      basis: evidence('stray'),
    }
    const crowded = { ...snapshot, tasks: [...snapshot.tasks, stray as never] }
    const streamDuties = snapshot.tasks.filter(task => task.kind === 'facts')
    expect(streamDuties.length).toBeGreaterThan(0)
    const mint = mintOf(snapshot)
    const decision = committed(decideSuspend(crowded, command, mint))
    expect(decision.value).toMatchObject({
      phase: 'suspended',
      revision: mint.revision,
      timing: command.timing,
      wait: { kind: 'none' },
    })
    const deletes = decision.writes.flatMap(write => (write.kind === 'delete' ? [write.key] : []))
    expect(deletes.sort()).toEqual(
      [
        taskKey({ kind: 'suspend', operation: command.suspension.operation }),
        ...streamDuties.map(task => taskKey(task)),
      ].sort(),
    )
    const tasks = putsOf(decision.writes, 'task') as unknown as { task: Record_ }[]
    expect(tasks.map(entry => entry.task.kind)).toEqual(['wait-registration', 'suspend'])
    for (const entry of tasks)
      expect(entry.task).toMatchObject({ state: 'pending', diagnostic: null })
    expect(putsOf(decision.writes, 'wait')).toMatchObject([
      { wait: { record: { phase: 'opening', operation: command.operation } } },
    ])
  })

  it('refuses a suspension whose segment saved no Ask wait', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = suspendOf(built)
    const without = withFacts(snapshot, fact =>
      (fact.fact as Record_ | undefined)?.kind === 'wait' ? null : fact,
    )
    expect(replied(decideSuspend(without, command, mintOf(snapshot)))).toEqual(
      invalidOf('suspension', 'no-saved-ask-wait'),
    )
  })

  describe('the responses a checkpoint names as consumed', () => {
    async function resumedAndSuspendedAgain() {
      const built = await suspendedCall({
        resume: (_input, count) =>
          Promise.resolve(
            count === 1
              ? asking('{"asked":"which line?"}', 'which line?')
              : succeed({ kind: 'completed', value: 'done' }),
          ),
      })
      await continued(built, { kind: 'declined' })
      return suspendOf(built, 1)
    }

    function nameless(snapshot: CallSnapshot, response: string | null): CallSnapshot {
      const closed = withWaitRecord(snapshot, FIRST, {
        phase: 'closed',
        cause: 'continued',
        evidence: evidence('closed'),
      })
      const bare = withFacts(closed, fact =>
        (fact.fact as Record_ | undefined)?.kind === 'continued' ? null : fact,
      )
      return response === null
        ? bare
        : withWaitRecord(bare, FIRST, { phase: 'responding', response: { operation: response } })
    }

    it('accepts a response that the saved continued fact of the resume names', async () => {
      const { snapshot, command } = await resumedAndSuspendedAgain()
      const [response] = command.checkpoint.consumedResponses
      expect(response).toBeDefined()
      const closed = withWaitRecord(snapshot, FIRST, {
        phase: 'closed',
        cause: 'continued',
        evidence: evidence('closed'),
      })
      committed(decideSuspend(closed, command, mintOf(snapshot)))
    })

    it('accepts a response that a responding wait of the call names', async () => {
      const { snapshot, command } = await resumedAndSuspendedAgain()
      const [response] = command.checkpoint.consumedResponses
      committed(decideSuspend(nameless(snapshot, response as string), command, mintOf(snapshot)))
    })

    it('refuses a response that this call never accepted', async () => {
      const { snapshot, command } = await resumedAndSuspendedAgain()
      expect(replied(decideSuspend(nameless(snapshot, null), command, mintOf(snapshot)))).toEqual(
        invalidOf('checkpoint.consumedResponses', 'not-accepted-by-this-call'),
      )
    })
  })
})

describe('decideAttachRegistration: the wait opens on its registration', () => {
  it('writes the open wait, the Ask state of the call and the receipt, and removes only the ensure duty of the wait', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = attachOf(built)
    const ensures = snapshot.tasks.filter(task => task.kind === 'wait-registration')
    expect(ensures).toHaveLength(1)
    const bystander = { ...(ensures[0] as Record_), wait: 'op-other/wait' }
    const crowded = { ...snapshot, tasks: [...snapshot.tasks, bystander as never] }
    const mint = mintOf(snapshot)
    const decision = committed(decideAttachRegistration(crowded, command, mint))
    expect(decision.value).toMatchObject({
      phase: 'open',
      value: { kind: 'ask', wait: FIRST, registration: command.registration, decision: null },
    })
    expect(decision.writes.filter(write => write.kind === 'delete')).toEqual([
      { kind: 'delete', key: taskKey(ensures[0] as never) },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      { operation: { receipt: { kind: 'attach-registration', wait: decision.value } } },
    ])
  })

  it('refuses a wait that is not an Ask', async () => {
    const built = await suspendedCall()
    const { snapshot, command } = attachOf(built)
    const resource = withWait(snapshot, FIRST, found => ({
      ...found,
      record: {
        ...(found.record as Record_),
        intent: { ...((found.record as Record_).intent as Record_), kind: 'resource' },
      },
    }))
    expect(replied(decideAttachRegistration(resource, command, mintOf(snapshot)))).toEqual(
      invalidOf('wait', 'not-an-ask'),
    )
  })
})

describe('parkDutyOf and decideClosePark: the duty that parks the queue entry of a suspended call', () => {
  const OPERATION = operationId('op-c1/start/suspended')

  async function parkable() {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const planned = first([...snapshot.suspensions.values()]).suspension
    const task = {
      kind: 'suspend',
      operation: OPERATION,
      state: 'pending',
      diagnostic: null,
      suspension: planned,
    }
    return { snapshot: { ...snapshot, tasks: [...snapshot.tasks, task as never] }, planned, task }
  }

  it('asks nothing when the duty is not there, or the call or the checkpoint is not', async () => {
    const { snapshot } = await parkable()
    const none = { kind: 'none' }
    expect(parkDutyOf(snapshot, operationId('op-unknown'))).toEqual(none)
    const queueTask = { kind: 'queue', operation: OPERATION, state: 'pending', diagnostic: null }
    const other = { ...snapshot, tasks: [queueTask as never] }
    expect(parkDutyOf(other, OPERATION)).toEqual(none)
    expect(parkDutyOf({ ...snapshot, call: null }, OPERATION)).toEqual(none)
    const both = { ...snapshot, tasks: [queueTask as never, ...snapshot.tasks] }
    expect(parkDutyOf(both, OPERATION)).toMatchObject({ kind: 'park' })
    const planOnly = withSuspensions(snapshot, entries =>
      entries.map(([key, entry]) => [key, { ...entry, checkpoint: null }]),
    )
    expect(parkDutyOf(planOnly, OPERATION)).toEqual(none)
    expect(
      parkDutyOf(
        withSuspensions(snapshot, () => []),
        OPERATION,
      ),
    ).toEqual(none)
  })

  it('parks the entry of a suspended call whose wait has not reached responding, naming the slot of the start', async () => {
    const { snapshot, planned } = await parkable()
    expect(parkDutyOf(snapshot, OPERATION)).toEqual({
      kind: 'park',
      record: snapshot.call,
      holder: planned.start.operation,
    })
    const opening = withWaitRecord(snapshot, FIRST, { phase: 'opening' })
    expect(parkDutyOf(opening, OPERATION)).toMatchObject({ kind: 'park' })
  })

  it('only closes the duty when the decision was accepted, the wait closed, or the call is not suspended', async () => {
    const { snapshot, planned } = await parkable()
    const closes = { kind: 'close', record: snapshot.call, holder: planned.start.operation }
    expect(parkDutyOf(withWaitRecord(snapshot, FIRST, { phase: 'responding' }), OPERATION)).toEqual(
      closes,
    )
    expect(
      parkDutyOf(withWaitRecord(snapshot, FIRST, { phase: 'closed' }), OPERATION),
    ).toMatchObject({ kind: 'close' })
    const running = withState(snapshot, { phase: 'running' })
    expect(parkDutyOf(running, OPERATION)).toEqual({
      kind: 'close',
      record: running.call,
      holder: planned.start.operation,
    })
    const foreign = withWait(snapshot, FIRST, found => ({
      ...found,
      suspension: operationId('op-other/suspension'),
    }))
    expect(parkDutyOf(foreign, OPERATION)).toMatchObject({ kind: 'close' })
  })

  it('removes the duty it was asked about and nothing else', async () => {
    const { snapshot } = await parkable()
    const decision = committed(decideClosePark(snapshot, OPERATION))
    expect(decision.writes).toEqual([
      { kind: 'delete', key: taskKey({ kind: 'suspend', operation: OPERATION }) },
    ])
    expect(decision.value).toEqual({ closed: true })
    expect(replied(decideClosePark(snapshot, operationId('op-unknown')))).toEqual({
      ok: { closed: false },
    })
    const otherKind = {
      ...snapshot,
      tasks: [{ kind: 'queue', operation: OPERATION, state: 'pending', diagnostic: null } as never],
    }
    expect(replied(decideClosePark(otherKind, OPERATION))).toEqual({
      ok: { closed: false },
    })
    expect(replied(decideClosePark(snapshot, operationId('op-elsewhere')))).toEqual({
      ok: { closed: false },
    })
  })
})

describe('decideBlockRegistration: the refused registration of a wait', () => {
  async function registering() {
    const built = await suspendedCall()
    const { snapshot } = attachOf(built)
    const task = first(snapshot.tasks.filter(item => item.kind === 'wait-registration'))
    const command = {
      tenant: tenantA,
      call: CALL,
      operation: operationId(`${FIRST}/ensure-blocked`),
      inputDigest: 'digest-block',
      task,
      resolution: { kind: 'blocked', reason: 'the owner refused for good' },
    }
    return { snapshot, task, command }
  }

  it('keeps the duty with its reason and saves a receipt that binds the duty and the resolution', async () => {
    const { snapshot, task, command } = await registering()
    const mint = mintOf(snapshot)
    const decision = committed(decideBlockRegistration(snapshot, command as never, mint))
    expect(decision.value.record.startsWith('operation:')).toBe(true)
    expect(decision.value.revision).toBe(mint.revision)
    expect(putsOf(decision.writes, 'task')).toEqual([
      {
        kind: 'task',
        task: { ...task, state: 'blocked', diagnostic: 'the owner refused for good' },
      },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      {
        operation: {
          operation: command.operation,
          receipt: { kind: 'record-task', evidence: decision.value },
        },
      },
    ])
    const other = committed(
      decideBlockRegistration(
        snapshot,
        { ...command, resolution: { kind: 'blocked', reason: 'another reason' } } as never,
        mint,
      ),
    )
    expect(other.value.digest).not.toBe(decision.value.digest)
    expect(decision.writes).toHaveLength(3)
  })

  it('answers a resend with the receipt it saved, and a changed input with a conflict', async () => {
    const { snapshot, command } = await registering()
    const first = committed(decideBlockRegistration(snapshot, command as never, mintOf(snapshot)))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decideBlockRegistration(after, command as never, mintOf(snapshot)))).toEqual({
      ok: first.value,
    })
    expect(
      replied(
        decideBlockRegistration(
          after,
          { ...command, inputDigest: 'digest-changed' } as never,
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: command.operation } })
  })

  it('refuses a call the ledger does not hold, and writes nothing', async () => {
    const { snapshot, command } = await registering()
    expect(
      replied(
        decideBlockRegistration(
          { ...snapshot, call: null },
          command as never,
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual(invalidOf('call', 'unknown-call'))
  })
})

describe('decideCompleteInvalidation: the invalidation of a wait after its call ended', () => {
  const EVIDENCE = evidence('invalidated', 'test-decisions')

  async function invalidating() {
    const built = await suspendedCall()
    const base = await snapshotOfCall(built.harness)
    const task = {
      kind: 'wait-registration',
      operation: operationId(`${FIRST}/invalidate`),
      state: 'pending',
      diagnostic: null,
      wait: FIRST,
      action: 'invalidate',
      evidence: evidence('invalidate-basis'),
    }
    const snapshot = {
      ...withState(base, { phase: 'settled' }),
      tasks: [...base.tasks, task as never],
    }
    const command = {
      tenant: tenantA,
      call: CALL,
      operation: operationId(`${FIRST}/invalidated`),
      inputDigest: 'digest-invalidated',
      task,
      resolution: { kind: 'done', evidence: EVIDENCE },
    }
    return { snapshot, task, command }
  }
  const refusal = invalidOf('resolution', 'done-with-evidence-required')

  it('removes the invalidation duty and keeps the receipt of the owner, without changing how the call ended', async () => {
    const { snapshot, task, command } = await invalidating()
    const mint = mintOf(snapshot)
    const decision = committed(decideCompleteInvalidation(snapshot, command as never, mint))
    expect(decision.value).toEqual(EVIDENCE)
    expect(decision.writes.filter(write => write.kind === 'delete')).toEqual([
      { kind: 'delete', key: taskKey(task as never) },
    ])
    expect(putsOf(decision.writes, 'operation')).toMatchObject([
      {
        operation: {
          operation: command.operation,
          inputDigest: 'digest-invalidated',
          receipt: { kind: 'record-task', evidence: EVIDENCE },
        },
      },
    ])
    const [call] = putsOf(decision.writes, 'call') as unknown as [{ call: { state: Record_ } }]
    expect(call.call.state).toMatchObject({ phase: 'settled', revision: mint.revision })
    expect(decision.writes).toHaveLength(3)
  })

  it('answers a resend with the receipt it saved, and a changed input with a conflict', async () => {
    const { snapshot, command } = await invalidating()
    const first = committed(
      decideCompleteInvalidation(snapshot, command as never, mintOf(snapshot)),
    )
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decideCompleteInvalidation(after, command as never, mintOf(snapshot)))).toEqual({
      ok: EVIDENCE,
    })
    expect(
      replied(
        decideCompleteInvalidation(
          after,
          { ...command, inputDigest: 'digest-changed' } as never,
          mintOf(snapshot),
        ),
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: command.operation } })
  })

  it('refuses a call the ledger does not hold, and a call that has not ended', async () => {
    const { snapshot, command } = await invalidating()
    expect(
      replied(
        decideCompleteInvalidation({ ...snapshot, call: null }, command as never, mintOf(snapshot)),
      ),
    ).toEqual(invalidOf('call', 'unknown-call'))
    const running = withState(snapshot, { phase: 'suspended' })
    expect(
      replied(decideCompleteInvalidation(running, command as never, mintOf(snapshot))),
    ).toEqual(invalidOf('call', 'phase:suspended'))
  })

  it('refuses a duty that is not a pending invalidation of this call', async () => {
    const { snapshot, task, command } = await invalidating()
    const notPending = invalidOf('task', 'pending-invalidation-required')
    const decide = (changed: CallSnapshot, given: unknown = task) =>
      replied(
        decideCompleteInvalidation(changed, { ...command, task: given } as never, mintOf(snapshot)),
      )
    expect(decide({ ...snapshot, tasks: snapshot.tasks.filter(item => item !== task) })).toEqual(
      notPending,
    )
    const ensure = { ...task, action: 'ensure' }
    expect(decide({ ...snapshot, tasks: [...snapshot.tasks, ensure as never] }, ensure)).toEqual(
      notPending,
    )
    const queue = {
      kind: 'queue',
      operation: operationId('op-q'),
      state: 'pending',
      diagnostic: null,
    }
    expect(decide({ ...snapshot, tasks: [...snapshot.tasks, queue as never] }, queue)).toEqual(
      notPending,
    )
  })

  it.each([
    ['nothing', null],
    ['no object', 'done'],
    ['another kind', { kind: 'blocked', reason: 'no' }],
    ['no evidence', { kind: 'done' }],
    ['more than the evidence', { kind: 'done', evidence: EVIDENCE, extra: true }],
  ])('refuses a resolution that is %s', async (_name, resolution) => {
    const { snapshot, command } = await invalidating()
    expect(
      replied(
        decideCompleteInvalidation(snapshot, { ...command, resolution } as never, mintOf(snapshot)),
      ),
    ).toEqual(refusal)
  })

  it('refuses evidence that is no evidence, naming the field', async () => {
    const { snapshot, command } = await invalidating()
    const outcome = replied(
      decideCompleteInvalidation(
        snapshot,
        { ...command, resolution: { kind: 'done', evidence: 'receipt' } } as never,
        mintOf(snapshot),
      ),
    )
    expect(outcome).toMatchObject({ failure: { kind: 'invalid', field: 'resolution.evidence' } })
  })
})
