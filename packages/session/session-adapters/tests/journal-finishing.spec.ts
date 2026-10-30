// The finishing rules of the session-log Journal as the public ports answer them (Agent SPEC
// "条件终结", "终结责任清单", "取消路线上的 tryFinish", "commitSettlement 的变体"; the judgment
// order table of the S2/S3 gate rulings): the shape of a settling commit, the closure that
// prepareFinish issues and tryFinish rebuilds, and the order of the answers. The shared
// conformance suite of agent-contract holds both Journals to the same rules; these cases pin the
// session-log binding meanwhile.
import { describe, expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentOperationId,
  type ExecutionSnapshot,
  type JournalCommit,
  type PendingHandoff,
} from '@omne-harness/agent-contract'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import { decodeModelCallId } from '@omne-harness/model-contract'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { scene, ok, operation, evidence, submitInput } from './fixtures/common-journal.ts'
import { accept, handed, prepareEnd, take } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

type Scene = Awaited<ReturnType<typeof scene>>

const load = async (s: Scene) =>
  ok(await s.view.journal.load({ ...s.access, execution: s.execution }))

/** One commit of the current attachment on the loaded snapshot; `change` overrides its members. */
async function commit(
  s: Scene,
  name: string,
  change: Partial<JournalCommit<string>> = {},
): Promise<ReturnType<typeof s.view.journal.commit>> {
  const loaded = await load(s)
  return s.view.journal.commit({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authority: loaded.executionAttachment ?? s.opened.authority,
    expected: loaded.revision,
    checkpoint: loaded.checkpoint,
    state: { kind: 'advancing' },
    events: [],
    effects: [],
    caller: { kind: 'none' },
    replyAdmission: null,
    handoff: null,
    finish: null,
    ...change,
  })
}

/** The F1 content of an ordinary completion on `snapshot`. */
function completion(snapshot: ExecutionSnapshot, name: string): JournalCommit<string>['finish'] {
  return {
    origin: evidence(`${name}-origin`),
    conclusion: { kind: 'complete' },
    failure: null,
    inputWatermark: snapshot.inputWatermark,
    conditions: evidence(`${name}-conditions`),
  }
}

/** The Agent cancel `control` accepted and its intent reached: an effective cancel. */
async function effectiveCancel(s: Scene, control: AgentOperationId) {
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: control,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation(`intent-${control}`),
      target: control,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
}

async function started(name: string) {
  const s = await scene(name)
  ok(await handed(s))
  await take(s)
  return s
}

describe('a settling commit', () => {
  it('a candidate on a commit that is not settling is invalid(finish) before the lifecycle: also after ended', async () => {
    const s = await started('shape-after-ended')
    const ready = await prepareEnd(s)
    if (ready.state.kind !== 'settling') throw new Error('settling expected')
    ok(
      await s.view.journal.tryFinish({
        ...s.access,
        execution: s.execution,
        operation: operation('end'),
        expected: ready.revision,
        authorization: { kind: 'advancement', authority: s.opened.authority },
        intent: ready.state.intent,
      }),
    )
    const ended = await load(s)
    expect(
      await commit(s, 'late-candidate', {
        state: { kind: 'advancing' },
        finish: completion(ended, 'late'),
      }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'finish' } })
  })

  it('under an effective cancel a candidate that is not cancelled is changed and writes nothing', async () => {
    const s = await started('f1-under-cancel')
    await effectiveCancel(s, operation('cancel-1'))
    const before = await load(s)
    expect(
      await commit(s, 'f1', { state: { kind: 'settling' }, finish: completion(before, 'f1') }),
    ).toEqual({ failure: { kind: 'changed' } })
    expect((await load(s)).revision).toBe(before.revision)
  })

  it('the same five content fields on another checkpoint establish a new candidate', async () => {
    const s = await started('f1-checkpoint')
    const first = await load(s)
    ok(await commit(s, 'f1-a', { state: { kind: 'settling' }, finish: completion(first, 'same') }))
    const settled = await load(s)
    ok(
      await commit(s, 'f1-b', {
        state: { kind: 'settling' },
        checkpoint: { ...settled.checkpoint, position: 'another-position' },
        finish: completion(first, 'same'),
      }),
    )
    const after = await load(s)
    expect(after.settlement.candidate?.candidate).toBe(operation('f1-b'))
    expect(after.settlement.supersessions).toMatchObject([
      { from: operation('f1-a'), to: operation('f1-b') },
    ])
  })
})

type Snapshot = ExecutionSnapshot

function settlingIntent(snapshot: Snapshot) {
  if (snapshot.state.kind !== 'settling') throw new Error('settling expected')
  return snapshot.state.intent
}

/** tryFinish of the projection of `ready` under `authorization` (an advancement by default). */
function finish(
  s: Scene,
  ready: Snapshot,
  name: string,
  authorization: Parameters<Scene['view']['journal']['tryFinish']>[0]['authorization'] = {
    kind: 'advancement',
    authority: ready.executionAttachment ?? s.opened.authority,
  },
) {
  return s.view.journal.tryFinish({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    expected: ready.revision,
    authorization,
    intent: settlingIntent(ready),
  })
}

function cancelAuthorization(snapshot: Snapshot, control: AgentOperationId) {
  const record = snapshot.controls.find(item => item.operation === control)
  if (record === undefined) throw new Error('the control should be saved')
  return { kind: 'cancel' as const, control, source: record.stages.accepted.source }
}

/** The members every candidate and judgment request shares, at the current revision. */
async function settlementCommon(s: Scene, name: string, control: AgentOperationId) {
  const snapshot = await load(s)
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authorization: cancelAuthorization(snapshot, control),
    expected: snapshot.revision,
    installation: testCancellationPolicyInstallation.record,
  }
}

async function establish(s: Scene, control: AgentOperationId, name = 'establish') {
  const snapshot = await load(s)
  return s.view.journal.commitSettlement({
    ...(await settlementCommon(s, name, control)),
    kind: 'establish-cancellation',
    predecessor: snapshot.settlement.candidate?.candidate ?? null,
  })
}

async function judge(s: Scene, control: AgentOperationId, name = 'judge') {
  const snapshot = await load(s)
  const route = snapshot.settlement.route
  if (route === null) throw new Error('a route is expected')
  return s.view.journal.commitSettlement({
    ...(await settlementCommon(s, name, control)),
    kind: 'judge-cancellation',
    candidate: route.candidate,
    route: route.record,
  })
}

async function prepare(
  s: Scene,
  name: string,
  authorization: Parameters<Scene['view']['journal']['prepareFinish']>[0]['authorization'],
) {
  const snapshot = await load(s)
  const candidate = snapshot.settlement.candidate
  if (candidate === null) throw new Error('a candidate is expected')
  return s.view.journal.prepareFinish({
    ...s.access,
    execution: s.execution,
    operation: operation(name),
    authorization,
    expected: snapshot.revision,
    candidate: candidate.candidate,
  })
}

/** A cancel `control` whose intent is still unresolved: a pending controls item. */
async function unresolvedCancel(s: Scene, control: AgentOperationId) {
  ok(
    await s.view.journal.control({
      ...s.access,
      execution: s.execution,
      operation: control,
      command: { kind: 'cancel', reason: evidence('cancel') },
    }),
  )
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation(`intent-${control}-open`),
      target: control,
      stage: 'intent-established',
      state: 'unresolved',
      source: evidence('intent-open'),
    }),
  )
}

async function reachIntent(s: Scene, control: AgentOperationId) {
  ok(
    await s.view.journal.recordControl({
      ...s.access,
      execution: s.execution,
      operation: operation(`intent-${control}`),
      target: control,
      stage: 'intent-established',
      state: 'reached',
      source: evidence('intent'),
    }),
  )
}

/** The internal request of a Model reply at I3 of the loaded step. */
function replyRequest(s: Scene, snapshot: Snapshot, name: string): PendingHandoff {
  const call = ok(decodeModelCallId(`mcall_${'0'.repeat(20)}${name.slice(-2).padStart(2, '0')}`))
  return {
    kind: 'execution',
    reference: { kind: 'execution', execution: s.execution, operation: operation(name) },
    predecessor: snapshot.revision,
    position: { step: snapshot.checkpoint.step, node: 'I3', slot: null },
    source: {
      kind: 'model-reply',
      step: snapshot.checkpoint.step,
      action: ok(decodeActionId(`action-${name}`)),
      call,
      result: {
        producer: { kind: 'model', call },
        version: 'v1',
        delivery: null,
        source: evidence(`result/${name}`),
      },
    },
    candidate: assistantMessage(`reply ${name}`),
    originalAdvance: snapshot.executionAttachment ?? s.opened.authority,
    predecessorHandoff: null,
  }
}

describe('the author route reads the closure tryFinish rebuilds', () => {
  it('a write still undecided is unavailable, not blocked', async () => {
    const s = await started('pending-write')
    s.view.controls.failNext('commit', { kind: 'commit-unknown', outcome: 'pending' })
    expect(await commit(s, 'undecided')).toMatchObject({ failure: { kind: 'commit-unknown' } })
    const ready = await prepareEnd(s)
    expect(await finish(s, ready, 'end')).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a call without a result or an association is unavailable, not ended', async () => {
    const s = await started('call-unknown')
    const tool = toolCall(s.access.tenant, 'open-call')
    const loaded = await load(s)
    const attachment = loaded.executionAttachment ?? s.opened.authority
    ok(
      await commit(s, 'intent', {
        checkpoint: { ...loaded.checkpoint, batch: tool.batch },
        effects: [{ action: tool.pending.action, pending: tool.pending, authority: attachment }],
      }),
    )
    const ready = await prepareEnd(s)
    expect(
      ready.finishObligations?.items.find(item => item.kind === 'call')?.disposition,
    ).toMatchObject({ kind: 'unknown' })
    expect(await finish(s, ready, 'end')).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a complete candidate with a prepared H that no Ja published is blocked with operations', async () => {
    const s = await started('pending-history')
    const before = await load(s)
    const request = replyRequest(s, before, 'reply-01')
    ok(
      await commit(s, 'prepare-h', {
        checkpoint: { ...before.checkpoint, position: 'Q2', currentHandoff: request.reference },
        handoff: { kind: 'prepare', request },
      }),
    )
    const ready = await prepareEnd(s)
    const item = ready.finishObligations?.items.find(entry => entry.kind === 'handoff')
    expect(item?.disposition).toMatchObject({ kind: 'pending', reason: 'handoff-history' })
    expect(await finish(s, ready, 'end')).toEqual({
      ok: { kind: 'blocked', reason: 'operations', source: item?.source },
    })
  })

  it('an input beyond the taken batch is blocked with inputs, and the source is the item of the list', async () => {
    const s = await started('untaken-input')
    const value = await accept(s, 'input-2')
    ok(
      await s.view.journal.submit(submitInput(s.access, s.execution, operation('submit-2'), value)),
    )
    const ready = await prepareEnd(s)
    const item = ready.finishObligations?.items.find(
      entry => entry.kind === 'accepted-input' && entry.disposition.kind === 'pending',
    )
    expect(item).toBeDefined()
    expect(await finish(s, ready, 'end')).toEqual({
      ok: { kind: 'blocked', reason: 'inputs', source: item?.source },
    })
  })
})

describe('prepareFinish and tryFinish follow the judgment order', () => {
  it('after the execution left settling, prepareFinish and tryFinish are changed', async () => {
    const s = await started('left-settling')
    const ready = await prepareEnd(s)
    ok(await commit(s, 'back-to-advancing', { state: { kind: 'advancing' } }))
    const advancing = await load(s)
    expect(
      await prepare(s, 'prepare-again', {
        kind: 'advancement',
        authority: advancing.executionAttachment ?? s.opened.authority,
      }),
    ).toEqual({ failure: { kind: 'changed' } })
    expect(
      await s.view.journal.tryFinish({
        ...s.access,
        execution: s.execution,
        operation: operation('end'),
        expected: advancing.revision,
        authorization: { kind: 'advancement', authority: s.opened.authority },
        intent: settlingIntent(ready),
      }),
    ).toEqual({ ok: { kind: 'changed', revision: advancing.revision } })
  })

  it('a cancel authorization for a complete candidate is denied by prepareFinish and by tryFinish', async () => {
    const s = await started('cancel-complete')
    const ready = await prepareEnd(s)
    const control = operation('cancel-1')
    await effectiveCancel(s, control)
    const current = await load(s)
    expect(await prepare(s, 'prepare-cancel', cancelAuthorization(current, control))).toEqual({
      failure: { kind: 'denied', action: 'prepareFinish' },
    })
    expect(
      await s.view.journal.tryFinish({
        ...s.access,
        execution: s.execution,
        operation: operation('end-cancel'),
        expected: current.revision,
        authorization: cancelAuthorization(current, control),
        intent: settlingIntent(ready),
      }),
    ).toEqual({ failure: { kind: 'denied', action: 'tryFinish' } })
  })
})

describe('the cancellation route compares its judgment with the current closure', () => {
  it('a blocked judgment whose premise went away is changed, not blocked', async () => {
    const s = await started('judged-blocked')
    const control = operation('cancel-1')
    await effectiveCancel(s, control)
    const other = operation('cancel-2')
    await unresolvedCancel(s, other)
    ok(await establish(s, control))
    expect(await judge(s, control)).toMatchObject({
      ok: { judgment: { decision: { kind: 'blocked' } } },
    })
    await reachIntent(s, other)
    ok(await prepare(s, 'prepare', cancelAuthorization(await load(s), control)))
    const ready = await load(s)
    expect(await finish(s, ready, 'end', cancelAuthorization(ready, control))).toEqual({
      ok: { kind: 'changed', revision: ready.revision },
    })
  })

  it('an allowed judgment with a new pending item is changed, not ended', async () => {
    const s = await started('judged-allowed')
    const control = operation('cancel-1')
    await effectiveCancel(s, control)
    ok(await establish(s, control))
    expect(await judge(s, control)).toMatchObject({
      ok: { judgment: { decision: { kind: 'allowed' } } },
    })
    await unresolvedCancel(s, operation('cancel-2'))
    ok(await prepare(s, 'prepare', cancelAuthorization(await load(s), control)))
    const ready = await load(s)
    expect(await finish(s, ready, 'end', cancelAuthorization(ready, control))).toEqual({
      ok: { kind: 'changed', revision: ready.revision },
    })
  })

  it('a cancel authorization that is not the control of the route is invalid for judge and tryFinish', async () => {
    const s = await started('route-control')
    const first = operation('cancel-1')
    const second = operation('cancel-2')
    await effectiveCancel(s, first)
    await effectiveCancel(s, second)
    ok(await establish(s, first))
    expect(await judge(s, second, 'judge-other')).toMatchObject({
      failure: { kind: 'invalid', field: 'authorization.control' },
    })
    ok(await judge(s, first))
    ok(await prepare(s, 'prepare', cancelAuthorization(await load(s), first)))
    const ready = await load(s)
    expect(await finish(s, ready, 'end', cancelAuthorization(ready, second))).toMatchObject({
      failure: { kind: 'invalid', field: 'authorization.control' },
    })
  })
})
