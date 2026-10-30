// The finishing rules of the session-log Journal as the public ports answer them (Agent SPEC
// "条件终结", "终结责任清单", "取消路线上的 tryFinish", "commitSettlement 的变体"; the judgment
// order table of the S2/S3 gate rulings): the shape of a settling commit, the closure that
// prepareFinish issues and tryFinish rebuilds, and the order of the answers. The shared
// conformance suite of agent-contract holds both Journals to the same rules; these cases pin the
// session-log binding meanwhile.
import { describe, expect, it } from 'vitest'
import type {
  AgentOperationId,
  ExecutionSnapshot,
  JournalCommit,
} from '@omne-harness/agent-contract'
import { scene, ok, operation, evidence } from './fixtures/common-journal.ts'
import { handed, prepareEnd, take } from './fixtures/progression.ts'

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
