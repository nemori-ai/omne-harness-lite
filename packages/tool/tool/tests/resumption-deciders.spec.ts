// 恢复一侧三个决策器的拒绝与提交（P06 acceptDecision、closeWait，P07 prepareResume）。快照取自真实运行
// 的调用，命令直接交给决策器：账本在事务前先读一次再判，决策器在事务里按事务快照再判一次，两次之间别处
// 可能改了记录——这里把那样的前置状态做出来，逐个拒绝分支确认：拒绝的种类与原因、什么都不写、提交时写下的记录。
import { describe, expect, it } from 'vitest'
import type { DurableEvidence, ToolWaitId } from '@omne-harness/tool-contract'
import { adoption, evidence, ok, operationId, tenantA } from './runtime-values.ts'
import {
  decideAcceptDecision,
  decideCloseWait,
  decidePrepareResume,
  refuseDecision,
  refuseResume,
} from '../src/ledger-resumption.ts'
import type { QueueEntryRecord } from '../src/ledger-store.ts'
import { taskKey } from '../src/ledger-store.ts'
import {
  ACCESS,
  CALL,
  DECISION,
  FIRST,
  accepted,
  resumePrepared,
  continued,
  mintOf,
  revisionOf,
  snapshotOfCall,
  suspendedCall,
  text,
  type CallSnapshot,
  type Record_,
  afterCommit,
  committed,
  invalidOf,
  putsOf,
  replied,
  withCall,
  withFacts,
  withState,
  withSuspensions,
  withWait,
  withWaitRecord,
} from './resumption-decider-values.ts'

const ACCEPT_OPERATION = operationId(`${FIRST}/accept`)
const RESUME_OPERATION = operationId(`${FIRST}/resume`)

function acceptCommand(changes: Record_ = {}) {
  return {
    tenant: tenantA,
    call: CALL,
    operation: ACCEPT_OPERATION,
    inputDigest: 'digest-accept',
    wait: FIRST,
    decision: DECISION,
    value: { kind: 'answer', value: text('a.txt') } as const,
    ...changes,
  }
}

describe('refuseDecision: which wait of which call can take a decision', () => {
  it('names the open Ask wait the call is suspended on', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const outcome = refuseDecision(snapshot, FIRST)
    expect(outcome).toMatchObject({ ok: { found: { record: { phase: 'open' } } } })
  })

  it('refuses a call the ledger does not hold', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    expect(refuseDecision({ ...snapshot, call: null }, FIRST)).toEqual(
      invalidOf('call', 'unknown-call'),
    )
  })

  it('refuses a wait the call never opened', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    expect(refuseDecision(snapshot, 'op-c1/other/wait' as ToolWaitId)).toEqual(
      invalidOf('wait', 'unknown-wait'),
    )
  })

  it('refuses a wait that is not the one the call state names: a call suspended on another wait', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const state = snapshot.call?.state
    if (state?.phase !== 'suspended' || state.wait.kind !== 'ask') throw new Error('not asking')
    const other = withState(snapshot, { wait: { ...state.wait, wait: 'op-c1/other/wait' } })
    expect(refuseDecision(other, FIRST)).toEqual(invalidOf('wait', 'not-the-current-wait'))
  })

  it('refuses a wait of a kind that cannot take a decision, even when it carries the same wait identity', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const state = snapshot.call?.state
    if (state?.phase !== 'suspended' || state.wait.kind !== 'ask') throw new Error('not asking')
    const resource = {
      kind: 'resource',
      wait: FIRST,
      contract: adoption('resource-contract'),
      deadline: null,
      resume: state.wait.resume,
      registration: state.wait.registration,
    }
    expect(refuseDecision(withState(snapshot, { wait: resource }), FIRST)).toEqual(
      invalidOf('wait', 'not-the-current-wait'),
    )
    // 调用还没有登记好等待（状态里没有等待）：同样不是当前等待。
    expect(refuseDecision(withState(snapshot, { wait: { kind: 'none' } }), FIRST)).toEqual(
      invalidOf('wait', 'not-the-current-wait'),
    )
  })

  it('refuses a call that is no longer suspended, and a wait that is no longer open', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    expect(refuseDecision(withState(snapshot, { phase: 'settled' }), FIRST)).toEqual(
      invalidOf('call', 'phase:settled'),
    )
    expect(refuseDecision(withWaitRecord(snapshot, FIRST, { phase: 'opening' }), FIRST)).toEqual(
      invalidOf('wait', 'phase:opening'),
    )
  })
})

describe('decideAcceptDecision: the one acceptance of a wait', () => {
  it('writes the response of the wait, the decision on the call, its receipt and the queue duty in one commit', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const mint = mintOf(snapshot)
    const decision = committed(decideAcceptDecision(snapshot, acceptCommand(), mint))
    expect(decision.value).toMatchObject({ kind: 'ask', wait: FIRST, decision: DECISION })

    const [call] = putsOf(decision.writes, 'call') as unknown as [
      { call: { state: Record_ } & Record_ },
    ]
    expect(call.call.state).toMatchObject({
      phase: 'suspended',
      relation: 'foreground',
      revision: mint.revision,
      wait: { kind: 'ask', wait: FIRST, decision: DECISION },
    })
    // 检查点没有因接受而改变。
    const before = snapshot.call?.state as { checkpoint: unknown }
    expect(call.call.state.checkpoint).toEqual(before.checkpoint)

    const [wait] = putsOf(decision.writes, 'wait') as unknown as [{ wait: Record_ }]
    const intent = (wait.wait.record as Record_).intent
    expect(wait.wait.record).toMatchObject({
      phase: 'responding',
      value: { kind: 'ask', decision: DECISION },
      response: {
        tenant: tenantA,
        call: CALL,
        operation: ACCEPT_OPERATION,
        inputDigest: 'digest-accept',
        wait: FIRST,
        start: [...snapshot.suspensions.values()][0]?.suspension.start,
        response: { kind: 'decision', value: acceptCommand().value, source: DECISION },
      },
      progress: { kind: 'accepted' },
    })
    expect((intent as Record_).wait).toBe(FIRST)
    // 回执是账本为这次接受铸的 operation 证据，等待记录与响应记录引用的是同一份。
    const receipt = ((wait.wait.record as Record_).progress as { receipt: DurableEvidence }).receipt
    expect(receipt.record.startsWith('operation:')).toBe(true)
    expect(receipt.revision).toBe(mint.revision)

    const [operation] = putsOf(decision.writes, 'operation') as unknown as [{ operation: Record_ }]
    expect(operation.operation).toMatchObject({
      operation: ACCEPT_OPERATION,
      inputDigest: 'digest-accept',
      receipt: { kind: 'accept-decision', wait: decision.value },
    })
    const [task, prepare] = putsOf(decision.writes, 'task') as unknown as [
      { task: Record_ },
      { task: Record_ },
    ]
    expect(task.task).toMatchObject({
      kind: 'queue',
      operation: ACCEPT_OPERATION,
      state: 'pending',
      basis: (call.call.state as { source: DurableEvidence }).source,
    })
    // The resume segment prepares its own environment from the binding of the segment that
    // suspended, under the wait's own operation.
    const preparations = (call.call as unknown as { preparations: Record_[] }).preparations
    expect(preparations.at(-1)).toMatchObject({
      operation: `${FIRST}/resume/prepare`,
      purpose: 'resume',
      adoption: preparations.at(-2)?.['adoption'],
    })
    expect(prepare.task).toMatchObject({
      kind: 'prepare',
      operation: `${FIRST}/resume/prepare`,
      state: 'pending',
      preparation: preparations.at(-1),
    })
    expect(decision.writes).toHaveLength(5)
  })

  it('answers a resend of the same acceptance with the wait it saved, and a changed input with a conflict', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const first = committed(decideAcceptDecision(snapshot, acceptCommand(), mintOf(snapshot)))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decideAcceptDecision(after, acceptCommand(), mintOf(snapshot)))).toEqual({
      ok: first.value,
    })
    expect(
      replied(
        decideAcceptDecision(
          after,
          acceptCommand({ inputDigest: 'digest-changed' }),
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: ACCEPT_OPERATION } })
  })

  it('refuses a second acceptance under another operation, naming the phase the wait is in', async () => {
    const built = await suspendedCall()
    const snapshot = await accepted(built)
    const again = decideAcceptDecision(
      snapshot,
      acceptCommand({ operation: operationId(`${FIRST}/accept-again`) }),
      mintOf(snapshot),
    )
    expect(replied(again)).toEqual(invalidOf('wait', 'phase:responding'))
  })

  it('refuses a wait whose suspension the call domain does not hold, and writes nothing', async () => {
    const built = await suspendedCall()
    const snapshot = await snapshotOfCall(built.harness)
    const without = withSuspensions(snapshot, () => [])
    const decision = decideAcceptDecision(without, acceptCommand(), mintOf(snapshot))
    expect(replied(decision)).toEqual(invalidOf('wait', 'no-suspension'))
  })
})

/** 已接受决定、尚未恢复的调用，以及恢复命令。 */
async function readyToResume() {
  const built = await suspendedCall()
  const snapshot = await resumePrepared(built)
  const record = snapshot.call
  if (record === null || record.state.phase !== 'suspended') throw new Error('not suspended')
  const entry: QueueEntryRecord = {
    call: CALL,
    ordinal: '3',
    stage: 'held',
    operation: RESUME_OPERATION,
    tool: 'tool',
    limit: null,
    scopeBudget: null,
  }
  const command = {
    tenant: tenantA,
    call: CALL,
    operation: RESUME_OPERATION,
    expected: revisionOf(snapshot),
    inputDigest: 'digest-resume',
    checkpoint: record.state.checkpoint,
    hold: { kind: 'held', entry } as const,
    execution: record.execution as never,
  }
  return { built, snapshot, record, command, entry }
}

describe('refuseResume: when a checkpoint can be resumed', () => {
  it('names the wait that took a decision at that checkpoint', async () => {
    const { snapshot, record, command } = await readyToResume()
    expect(refuseResume(snapshot, record, command.checkpoint)).toMatchObject({
      ok: { record: { phase: 'responding', intent: { wait: FIRST } } },
    })
  })

  it('refuses a resume after the segment was planned again: the call holds no environment at all', async () => {
    const built = await suspendedCall()
    const snapshot = await accepted(built)
    const record = snapshot.call
    if (record === null || record.execution === null) throw new Error('the call has no execution')
    const bound = record.preparations.at(-1)
    if (bound === undefined) throw new Error('no preparation')
    // The write context carries the principal as the driver's does.
    const write = { ...record.execution, principal: ACCESS.principal }
    ok(
      await built.harness.commands.planPreparation({
        ...write,
        operation: operationId(`${FIRST}/resume/prepare/2`),
        expected: revisionOf(snapshot),
        request: record.request,
        purpose: 'resume',
        environmentAdoption: bound.adoption,
      }),
    )
    const planned = await snapshotOfCall(built.harness)
    const again = planned.call
    if (again === null || again.state.phase !== 'suspended') throw new Error('not suspended')
    expect(again.environment).toBeNull()
    expect(refuseResume(planned, again, again.state.checkpoint)).toEqual(
      invalidOf('call', 'resume-not-prepared'),
    )
  })

  it('refuses a resume whose segment environment is not prepared yet', async () => {
    const built = await suspendedCall()
    const snapshot = await accepted(built)
    const record = snapshot.call
    if (record === null || record.state.phase !== 'suspended') throw new Error('not suspended')
    expect(refuseResume(snapshot, record, record.state.checkpoint)).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'resume-not-prepared' },
    })
  })

  it('refuses a call whose start was rejected', async () => {
    const { snapshot, command } = await readyToResume()
    const rejected = withCall(snapshot, record => ({
      ...record,
      startRejection: { reason: 'excluded', exclusion: evidence('exclusion') },
    }))
    expect(refuseResume(rejected, rejected.call as never, command.checkpoint)).toEqual(
      invalidOf('call', 'start-rejected'),
    )
  })

  it('refuses a call that is not suspended', async () => {
    const { snapshot, command } = await readyToResume()
    const running = withState(snapshot, { phase: 'running' })
    expect(refuseResume(running, running.call as never, command.checkpoint)).toEqual(
      invalidOf('call', 'phase:running'),
    )
  })

  it('refuses a call whose tool is not available any more', async () => {
    const { snapshot, command } = await readyToResume()
    const unavailable = withCall(snapshot, record => ({
      ...record,
      request: {
        ...(record.request as Record_),
        availability: { kind: 'known-unavailable', reason: 'gone' },
      },
    }))
    expect(refuseResume(unavailable, unavailable.call as never, command.checkpoint)).toEqual(
      invalidOf('call', 'not-available'),
    )
  })

  it('refuses a checkpoint that is not the one the call is suspended on', async () => {
    const { snapshot, record } = await readyToResume()
    expect(refuseResume(snapshot, record, evidence('checkpoint/other', 'test-host'))).toEqual(
      invalidOf('checkpoint', 'not-the-current-checkpoint'),
    )
  })

  it('refuses a checkpoint that no suspension committed: its checkpoint is not saved yet', async () => {
    const { snapshot, record, command } = await readyToResume()
    const planned = withSuspensions(snapshot, entries =>
      entries.map(([key, entry]) => [key, { ...entry, checkpoint: null }]),
    )
    expect(refuseResume(planned, record, command.checkpoint)).toEqual(
      invalidOf('checkpoint', 'not-committed-by-suspend'),
    )
    expect(
      refuseResume(
        withSuspensions(snapshot, () => []),
        record,
        command.checkpoint,
      ),
    ).toEqual(invalidOf('checkpoint', 'not-committed-by-suspend'))
  })

  it('refuses a checkpoint that the committed suspension did not save: another payload', async () => {
    const { snapshot, record, command } = await readyToResume()
    const other = withSuspensions(snapshot, entries =>
      entries.map(([key, entry]) => [
        key,
        {
          ...entry,
          checkpoint: { ...(entry.checkpoint as Record_), payload: evidence('checkpoint/other') },
        },
      ]),
    )
    expect(refuseResume(other, record, command.checkpoint)).toEqual(
      invalidOf('checkpoint', 'not-committed-by-suspend'),
    )
  })

  it('refuses a checkpoint whose wait took no decision: an open wait, or a response for another checkpoint', async () => {
    const { snapshot, record, command } = await readyToResume()
    // 同一个检查点的等待还开着：没有人答复它。
    const open = withWaitRecord(snapshot, FIRST, { phase: 'open' })
    expect(refuseResume(open, record, command.checkpoint)).toEqual(
      invalidOf('wait', 'no-accepted-decision'),
    )
    // 已答复的等待恢复的是别的检查点。
    const elsewhere = withWait(snapshot, FIRST, found => ({
      ...found,
      record: {
        ...(found.record as Record_),
        intent: { ...((found.record as Record_).intent as Record_), resume: evidence('other') },
      },
    }))
    expect(refuseResume(elsewhere, record, command.checkpoint)).toEqual(
      invalidOf('wait', 'no-accepted-decision'),
    )
  })
})

describe('decidePrepareResume: the unique successor of a checkpoint', () => {
  it('saves the resume record as the call start, held and starting, with its start task, and gives up the queue duty', async () => {
    const { snapshot, record, command, entry } = await readyToResume()
    const mint = mintOf(snapshot)
    const decision = committed(decidePrepareResume(snapshot, command, mint))
    const start = {
      kind: 'resume',
      operation: RESUME_OPERATION,
      executor: record.start?.executor,
      execution: command.execution,
      checkpoint: command.checkpoint,
    }
    expect(decision.value).toMatchObject({
      start,
      state: {
        phase: 'starting',
        revision: mint.revision,
        relation: 'foreground',
        wait: { kind: 'none' },
        execution: { kind: 'starting', start: RESUME_OPERATION },
        queue: { kind: 'held', ordinal: entry.ordinal },
      },
    })
    const [call] = putsOf(decision.writes, 'call') as unknown as [{ call: Record_ }]
    expect(call.call).toMatchObject({ start, state: decision.value.state })
    const [task] = putsOf(decision.writes, 'task') as unknown as [{ task: Record_ }]
    expect(task.task).toEqual({
      kind: 'start',
      operation: RESUME_OPERATION,
      state: 'pending',
      diagnostic: null,
      start,
    })
    const [operation] = putsOf(decision.writes, 'operation') as unknown as [{ operation: Record_ }]
    expect(operation.operation).toMatchObject({
      operation: RESUME_OPERATION,
      inputDigest: 'digest-resume',
      receipt: { kind: 'prepare-resume', start, state: decision.value.state },
    })
    // 接受时留下的 queue 待办在这一笔里去掉：恢复已经拿到名额。
    const queued = snapshot.tasks.filter(item => item.kind === 'queue')
    expect(queued).toHaveLength(1)
    expect(decision.writes).toContainEqual({
      kind: 'delete',
      key: taskKey(queued[0] as never),
    })
  })

  it('resumes with the executor the call was admitted with, not a newer implementation of the tool', async () => {
    const { snapshot, record, command } = await readyToResume()
    const newer = withCall(snapshot, current => ({
      ...current,
      request: {
        ...(current.request as Record_),
        availability: {
          ...((current.request as { availability: Record_ }).availability as Record_),
          executor: adoption('newer-executor'),
        },
      },
    }))
    const decision = committed(decidePrepareResume(newer, command, mintOf(snapshot)))
    expect(decision.value.start.executor).toEqual(record.start?.executor)
  })

  it('answers a resend of the same resume with the state and start it saved, and a changed input with a conflict', async () => {
    const { snapshot, command } = await readyToResume()
    const first = committed(decidePrepareResume(snapshot, command, mintOf(snapshot)))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decidePrepareResume(after, command, mintOf(snapshot)))).toEqual({
      ok: first.value,
    })
    expect(
      replied(
        decidePrepareResume(
          after,
          { ...command, inputDigest: 'digest-changed' },
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: RESUME_OPERATION } })
  })

  it('refuses a stale revision and a call the ledger does not hold', async () => {
    const { snapshot, command } = await readyToResume()
    const stale = { ...command, expected: '0' as never }
    expect(replied(decidePrepareResume(snapshot, stale, mintOf(snapshot)))).toEqual({
      failure: { kind: 'stale-revision', current: revisionOf(snapshot) },
    })
    expect(
      replied(decidePrepareResume({ ...snapshot, call: null }, command, mintOf(snapshot))),
    ).toEqual(invalidOf('call', 'unknown-call'))
  })

  it('refuses a call that cannot resume, and writes nothing', async () => {
    const { snapshot, command } = await readyToResume()
    const running = withState(snapshot, { phase: 'running' })
    expect(replied(decidePrepareResume(running, command, mintOf(snapshot)))).toEqual(
      invalidOf('call', 'phase:running'),
    )
  })

  it('does not resume while the queue still makes the call wait, and reports where it stands', async () => {
    const { snapshot, command, entry } = await readyToResume()
    const waiting = {
      ...command,
      hold: { kind: 'waiting', entry, ahead: 2, toolHeld: 1, held: 1 } as const,
    }
    const outcome = replied(decidePrepareResume(snapshot, waiting, mintOf(snapshot)))
    expect(outcome).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'tool-queue' },
    })
    expect(JSON.stringify(outcome)).toContain('2 ahead')
  })
})

describe('decideCloseWait: the close of a wait at the continued fact of its resume', () => {
  async function running() {
    const built = await suspendedCall()
    const { snapshot, input } = await continued(built)
    const command = {
      tenant: tenantA,
      call: CALL,
      operation: input.operation,
      expected: revisionOf(snapshot),
      inputDigest: 'digest-close',
      wait: input.wait,
      continuation: input.continuation,
    }
    return { snapshot, command }
  }

  /** 这条等待的 continued 事实。 */
  function continuedFact(snapshot: CallSnapshot) {
    const fact = [...snapshot.facts.values()].find(entry => entry.fact.kind === 'continued')
    if (fact === undefined) throw new Error('no continued fact')
    return fact
  }

  /** 只把 continued 事实改一处。 */
  function withContinued(snapshot: CallSnapshot, changes: (fact: Record_) => Record_) {
    const target = continuedFact(snapshot)
    return withFacts(snapshot, fact => (fact === target ? changes(fact) : fact))
  }

  it('closes the wait with cause continued and writes the call state and the receipt', async () => {
    const { snapshot, command } = await running()
    const mint = mintOf(snapshot)
    const decision = committed(decideCloseWait(snapshot, command, mint))
    expect(decision.value).toMatchObject({ phase: 'running', revision: mint.revision })
    const [wait] = putsOf(decision.writes, 'wait') as unknown as [{ wait: Record_ }]
    expect(wait.wait.record).toEqual({
      intent: snapshot.waits.get(FIRST)?.record.intent,
      phase: 'closed',
      cause: 'continued',
      evidence: command.continuation,
    })
    const [call] = putsOf(decision.writes, 'call') as unknown as [{ call: Record_ }]
    expect(call.call).toMatchObject({ state: decision.value })
    const [operation] = putsOf(decision.writes, 'operation') as unknown as [{ operation: Record_ }]
    expect(operation.operation).toMatchObject({
      operation: command.operation,
      inputDigest: 'digest-close',
      receipt: { kind: 'close-wait', state: decision.value },
    })
    expect(decision.writes).toHaveLength(3)
  })

  it('answers a resend with the state it saved, and a changed input with a conflict', async () => {
    const { snapshot, command } = await running()
    const first = committed(decideCloseWait(snapshot, command, mintOf(snapshot)))
    const after = afterCommit(snapshot, first.writes as never)
    expect(replied(decideCloseWait(after, command, mintOf(snapshot)))).toEqual({
      ok: first.value,
    })
    expect(
      replied(
        decideCloseWait(
          after,
          { ...command, inputDigest: 'digest-changed' },
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'conflict', operation: command.operation } })
  })

  it('refuses a stale revision, a call the ledger does not hold and a call that is not running', async () => {
    const { snapshot, command } = await running()
    expect(
      replied(
        decideCloseWait(
          snapshot,
          { ...command, expected: '0' as never },
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual({ failure: { kind: 'stale-revision', current: revisionOf(snapshot) } })
    expect(
      replied(decideCloseWait({ ...snapshot, call: null }, command, mintOf(snapshot))),
    ).toEqual(invalidOf('call', 'unknown-call'))
    expect(
      replied(
        decideCloseWait(
          withState(snapshot, { phase: 'suspended' }),
          command,
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual(invalidOf('call', 'phase:suspended'))
  })

  it('refuses a wait the call does not have, and a wait that is not responding', async () => {
    const { snapshot, command } = await running()
    expect(
      replied(
        decideCloseWait(
          snapshot,
          { ...command, wait: 'op-c1/other/wait' as ToolWaitId },
          mintOf(snapshot),
        ) as never,
      ),
    ).toEqual(invalidOf('wait', 'unknown-wait'))
    const closed = withWaitRecord(snapshot, FIRST, { phase: 'open' })
    expect(replied(decideCloseWait(closed, command, mintOf(snapshot)))).toEqual(
      invalidOf('wait', 'phase:open'),
    )
  })

  it('refuses a continuation that is not what the response progressed to', async () => {
    const { snapshot, command } = await running()
    const notContinued = invalidOf('continuation', 'not-the-continued-fact')
    // 响应只推进到 accepted，哪怕回执恰好就是这份证据。
    const accepted = withWaitRecord(snapshot, FIRST, {
      progress: { kind: 'accepted', receipt: command.continuation },
    })
    expect(replied(decideCloseWait(accepted, command, mintOf(snapshot)))).toEqual(notContinued)
    // 响应推进到 continued，但是推进到的是另一份证据。
    const other = withWaitRecord(snapshot, FIRST, {
      progress: { kind: 'continued', receipt: evidence('continued/other') },
    })
    expect(replied(decideCloseWait(other, command, mintOf(snapshot)))).toEqual(notContinued)
  })

  it('refuses a continuation whose saved fact is not the continued fact of this resume for this wait and response', async () => {
    const { snapshot, command } = await running()
    const notContinued = invalidOf('continuation', 'not-the-continued-fact')
    const refuse = (changed: CallSnapshot) =>
      replied(decideCloseWait(changed, command, mintOf(snapshot)))
    // 没有保存这份证据的事实。
    expect(
      refuse(withFacts(snapshot, fact => (fact === continuedFact(snapshot) ? null : fact))),
    ).toEqual(notContinued)
    // 保存下来的不是 continued 事实。
    expect(refuse(withContinued(snapshot, fact => ({ ...fact, fact: { kind: 'wait' } })))).toEqual(
      notContinued,
    )
    // 调用现在不在任何一次启动上。
    expect(refuse(withCall(snapshot, record => ({ ...record, start: null })))).toEqual(notContinued)
    // 事实属于另一次启动。
    expect(
      refuse(
        withContinued(snapshot, fact => ({
          ...fact,
          start: { ...(fact.start as Record_), operation: operationId('op-other/start') },
        })),
      ),
    ).toEqual(notContinued)
    // 事实说的是另一个等待。
    expect(
      refuse(
        withContinued(snapshot, fact => ({
          ...fact,
          fact: { ...(fact.fact as Record_), wait: 'op-c1/other/wait' },
        })),
      ),
    ).toEqual(notContinued)
    // 事实说的是对另一个响应的继续。
    expect(
      refuse(
        withContinued(snapshot, fact => ({
          ...fact,
          fact: { ...(fact.fact as Record_), response: operationId('op-other/accept') },
        })),
      ),
    ).toEqual(notContinued)
  })
})
