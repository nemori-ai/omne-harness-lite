import type {
  AgentJournal,
  FailureCandidate,
  FinishCandidateContent,
  FinishIntent,
} from '@omne-harness/agent-contract'
import { evidence } from '@omne-harness/session-contract/testing'
import { ok, operation } from './common-journal.ts'
import { MODEL_CALL } from './main-reply.ts'
import { handed, type SqlScene } from './sql-scene.ts'

/** The failure of a candidate whose Model call the Model refused (RFC-0013 A2). */
export const refusedByModel = (): FailureCandidate => ({
  step: null,
  at: '2026-11-05T00:00:00Z',
  source: evidence('failure/refused'),
  kind: 'model-refused',
  call: MODEL_CALL,
  failure: { kind: 'denied', action: 'admit' },
})

/** The failure of a candidate whose Model call settled as failed upstream, with the settlement's fault. */
export const noReplyWithFault = (): FailureCandidate => ({
  step: null,
  at: '2026-11-05T00:00:00Z',
  source: evidence('failure/no-reply'),
  kind: 'no-reply',
  call: MODEL_CALL,
  result: {
    producer: { kind: 'model', call: MODEL_CALL },
    version: 'v1',
    delivery: null,
    source: evidence('result/no-reply'),
  },
  fault: { cause: 'upstream-unavailable', upstreamStatus: '504', diagnostic: 'gateway timeout' },
})

/**
 * Drives the scene's execution to its end with a failed candidate through `journal`: the hand-over
 * of the initial input (so the Session finish check of PA-02 passes), the take, F1 with `failure`,
 * F2, prepareFinish and tryFinish. Answers what `readFinish` saw at each of the three points: before
 * any candidate, while settling, and after the end, with the intents the Journal itself projected.
 */
export async function endWithFailure(
  s: SqlScene,
  journal: AgentJournal<string>,
  failure: FailureCandidate,
) {
  const read = journal.readFinish
  if (read === undefined) throw new Error('the Journal has no readFinish')
  const readFinish = () => read({ ...s.access, execution: s.execution })
  const load = async () => ok(await journal.load({ ...s.access, execution: s.execution }))
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const beforeCandidate = await readFinish()

  const taken = await load()
  const page = ok(
    await journal.inputs({ ...s.access, execution: s.execution, watermark: taken.inputWatermark }),
  )
  const commit = async (
    name: string,
    step: 'take' | 'F1' | 'F2',
    finish: FinishCandidateContent | null,
  ) => {
    const loaded = await load()
    ok(
      await journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(name),
        authority: opened.authority,
        expected: loaded.revision,
        checkpoint:
          step === 'take'
            ? { ...loaded.checkpoint, inputBatch: page.batch }
            : { ...loaded.checkpoint, position: step },
        state: step === 'take' ? { kind: 'advancing' } : { kind: 'settling' },
        events: step === 'take' ? [{ kind: 'input-taken', batch: page.batch }] : [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish,
      }),
    )
  }
  await commit('finish-take', 'take', null)
  const atF1 = await load()
  await commit('finish-F1', 'F1', {
    origin: evidence('finish-origin'),
    conclusion: { kind: 'fail', cause: evidence('finish-cause') },
    failure,
    inputWatermark: atF1.inputWatermark,
    conditions: evidence('finish-conditions'),
  })
  const settling = await load()
  if (settling.state.kind !== 'settling') throw new Error('settling expected after F1')
  const whileSettling = await readFinish()

  await commit('finish-F2', 'F2', null)
  const prepared = await load()
  if (prepared.state.kind !== 'settling') throw new Error('settling expected after F2')
  ok(
    await journal.prepareFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('finish-prepare'),
      authorization: { kind: 'advancement', authority: opened.authority },
      expected: prepared.revision,
      candidate: prepared.state.intent.candidate,
    }),
  )
  const ready = await load()
  if (ready.state.kind !== 'settling') throw new Error('settling expected after prepareFinish')
  const intent: FinishIntent = ready.state.intent
  const finished = ok(
    await journal.tryFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('finish-end'),
      authorization: { kind: 'advancement', authority: opened.authority },
      expected: ready.revision,
      intent,
    }),
  )
  if (finished.kind !== 'ended') throw new Error(`the end should be ended, got ${finished.kind}`)
  const ended = await load()
  const afterEnd = await readFinish()
  return {
    beforeCandidate,
    settlingIntent: settling.state.intent,
    whileSettling,
    finalIntent: intent,
    ended,
    afterEnd,
  }
}
