// The main reply and the tool result of one H on the production session-log Journal of a
// `sqlScene`, as the coordinator writes them (Agent SPEC "真实历史的提交点"): P saves the complete
// request, Ja commits the fixed outcome with the real history of its source.
import {
  decodeActionId,
  type AgentJournal,
  type DurableEvidence,
} from '@omne-harness/agent-contract'
import { judgeMessage, type Message } from '@omne-harness/message'
import { decodeModelCallId } from '@omne-harness/model-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import { ok, operation } from './common-journal.ts'
import { sqlScene, type SqlScene } from './sql-scene.ts'

export type Journal = AgentJournal<string>
export type Commit = Parameters<Journal['commit']>[0]
export type Request = Extract<NonNullable<Commit['handoff']>, { kind: 'prepare' }>['request']
export type Decision = Extract<
  NonNullable<Commit['handoff']>,
  { kind: 'resolve' }
>['outcome']['decision']

export const PROVIDER = {
  owner: 'suite',
  name: 'message-handoff',
  revision: '1',
  digest: 'suite:handoff',
}
export const proof = (record: string): DurableEvidence => ({
  owner: 'suite',
  record,
  revision: '1',
  digest: `suite:${record}`,
})
export const MODEL_CALL = ok(decodeModelCallId(`mcall_${'0'.repeat(20)}r1`))
export const ACTION = ok(decodeActionId('core-r1/action'))
export const RESULT_VERSION = 'v1'

export function toolMessage(): Message {
  return {
    id: 'msg_c0nf0rmance0000000000002',
    role: 'tool',
    blocks: [
      {
        kind: 'tool_result',
        id: 'block-result',
        visibility: { toHuman: true, toModel: true },
        callId: 'tc-1',
      },
      { kind: 'text', id: 'block-body', visibility: { toHuman: true, toModel: true }, text: 'ok' },
    ],
  } as unknown as Message
}

export type Source = 'model-reply' | 'tool-result'

export async function opened(name: string) {
  const s = await sqlScene(name)
  const open = ok(await s.view.journal.open(s.openInput))
  return { s, authority: open.authority }
}

export async function load(s: SqlScene) {
  return ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
}

/** P: the complete request of one H of `source`, saved at the Journal before any prepare. */
export async function prepared(s: SqlScene, authority: Commit['authority'], source: Source) {
  const loaded = await load(s)
  const candidate = judgeMessage(
    source === 'model-reply' ? assistantMessage('reply') : toolMessage(),
  )
  if (!('ok' in candidate)) throw new Error('the candidate message is invalid')
  const result = (producer: unknown) => ({
    producer,
    version: RESULT_VERSION,
    delivery: null,
    source: proof(`result/${source}`),
  })
  const request = {
    kind: 'execution',
    reference: { kind: 'execution', execution: s.execution, operation: operation(`h-${source}`) },
    predecessor: loaded.revision,
    position: {
      step: loaded.checkpoint.step,
      node: source === 'model-reply' ? 'I3' : 'T5',
      slot: null,
    },
    source:
      source === 'model-reply'
        ? {
            kind: 'model-reply',
            step: loaded.checkpoint.step,
            action: ACTION,
            call: MODEL_CALL,
            result: result({ kind: 'model', call: MODEL_CALL }),
          }
        : {
            kind: 'tool-result',
            action: ACTION,
            call: ok(decodeToolCallId('tc-1')),
            result: result({ kind: 'tool', call: 'tc-1' }),
          },
    candidate: candidate.ok,
    originalAdvance: authority,
    predecessorHandoff: null,
  } as Request
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`p-${source}`),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, position: 'Q2', currentHandoff: request.reference },
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: { kind: 'prepare', request },
      finish: null,
    }),
  )
  return request
}

/**
 * Ja: the fixed outcome of H with the real history of its source. The main reply carries its
 * admission fact and a caller of none; the tool result carries the `message` hand-over.
 */
export async function applied(
  s: SqlScene,
  authority: Commit['authority'],
  request: Request,
  decision: Decision,
): Promise<Commit> {
  const loaded = await load(s)
  const reply = request.source.kind === 'model-reply'
  const admission = decision.kind === 'prepared' ? decision.admission : decision.evidence
  return {
    ...s.access,
    execution: s.execution,
    operation: operation(`ja-${request.source.kind}`),
    authority,
    expected: loaded.revision,
    checkpoint: { ...loaded.checkpoint, position: 'Q4', currentHandoff: null },
    state: { kind: 'advancing' },
    events:
      decision.kind === 'prepared'
        ? [{ kind: 'message', message: decision.message, source: decision.admission }]
        : [],
    effects: [],
    caller:
      !reply && decision.kind === 'prepared'
        ? {
            kind: 'message',
            message: decision.message,
            source: proof('record/h'),
            admission: decision.admission,
          }
        : { kind: 'none' },
    replyAdmission: reply
      ? {
          step: loaded.checkpoint.step,
          action: ACTION,
          call: MODEL_CALL,
          resultVersion: RESULT_VERSION,
          decision: decision.kind === 'prepared' ? 'admitted' : 'rejected',
          source: admission,
        }
      : null,
    handoff: {
      kind: 'resolve',
      outcome: {
        request,
        origin: null,
        provider: PROVIDER,
        qualification: proof('qualification/h'),
        record: proof('record/h'),
        decision,
      },
    },
    finish: null,
  } as Commit
}

export const admitted = (request: Request): Decision => ({
  kind: 'prepared',
  message: request.candidate,
  admission: proof('admission/h'),
})
