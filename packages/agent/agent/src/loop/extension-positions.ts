import type {
  Action,
  ActionBatch,
  ActionSlot,
  ActionToolCall,
  AgentCheckpoint,
  Conclusion,
  DurableEvidence,
  Failure,
  Passage,
  PassageId,
  Preparation,
  Subject,
} from '@omne-harness/agent-contract'
import { admissionActionOf } from '@omne-harness/agent-contract'
import type { Message } from '@omne-harness/message'
import type { DispatchRecord } from '@omne-harness/model-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { PassSubject } from './extension-drive.ts'
import { closedPass, type PassEffect } from './extension-pass.ts'
import { agentEvidence } from './identities.ts'

/** What each position gives its pass to judge and takes back from it. Pure: the node that calls it owns the commit. */
export const single = (subject: Subject) => subjects([{ action: null, subject }])

export const subjects = (items: readonly PassSubject[]) => async () => succeed(items)

export const conclusionEvidence = (conclusion: Conclusion): DurableEvidence =>
  agentEvidence(`${conclusion.passage}/conclusion`, conclusion)

export function beforeModelCall(effect: PassEffect | null) {
  const conclusions = effect?.conclusions ?? []
  return {
    passages: conclusions.map(conclusion => conclusion.passage),
    alterations: conclusions
      .filter(conclusion => conclusion.output?.kind === 'rewrite')
      .map(conclusionEvidence),
    selection: effect?.model == null ? [] : [conclusionEvidence(effect.model)],
  }
}

export function preparedBy(effect: PassEffect | null, assembled: Preparation | null) {
  return effect !== null && 'preparation' in effect.subject ? effect.subject.preparation : assembled
}

export function stepEnd(at: Pick<AgentCheckpoint, 'chain' | 'passages'>) {
  const passages = at.passages.filter(passage => admissionActionOf(passage.id) === null)
  return { passages, ...closedPass({ chain: at.chain, passages }) }
}

const applied = (call: Passage, transition: DurableEvidence): Passage =>
  call.progress.kind === 'resolved'
    ? { ...call, progress: { ...call.progress, kind: 'applied', transition } }
    : call

const rewrote = (call: Passage): boolean =>
  (call.progress.kind === 'resolved' || call.progress.kind === 'applied') &&
  call.progress.conclusion.output?.kind === 'rewrite'

export function closedKeepingRewrites(at: Pick<AgentCheckpoint, 'chain' | 'passages'>) {
  const { chain } = at
  if (chain === null) return {}
  const transition = agentEvidence(`${chain.pass}/adopted`)
  return {
    chain: null,
    passages: at.passages.flatMap(call => {
      if (!call.id.startsWith(`${chain.pass}/`)) return [call]
      return rewrote(call) ? [applied(call, transition)] : []
    }),
  }
}

export async function beforeActionSubjects(
  batch: ActionBatch,
  originals: ReadonlyMap<string, ActionToolCall>,
  definitionOf: (
    action: Action,
    original: ActionToolCall,
  ) => Promise<Outcome<ToolDefinition | null, Failure>>,
): Promise<Outcome<readonly PassSubject[], Failure>> {
  const ids = batch.actions.map(action => action.id)
  const found: PassSubject[] = []
  for (const action of batch.actions) {
    const original = originals.get(action.original.callId)
    if (action.judgment.kind !== 'pending' || original === undefined) continue
    const definition = await definitionOf(action, original)
    if ('failure' in definition) return definition
    if (definition.ok === null) continue
    const { id, effectiveArguments } = action
    const subject = {
      action: id,
      original,
      effectiveArguments,
      definition: definition.ok,
      batch: ids,
    }
    found.push({ action: id, subject })
  }
  return succeed(found)
}

export function afterAuthors(
  batch: ActionBatch,
  subjects: readonly PassSubject[],
  effects: readonly PassEffect[] | null,
): ActionBatch {
  const effectOf = (action: Action) => {
    const index = subjects.findIndex(item => item.action === action.id)
    return index < 0 ? undefined : effects?.[index]
  }
  const actions = batch.actions.map((action): Action => {
    const effect = effectOf(action)
    if (effect === undefined) return action
    if (effect.veto !== null)
      return { ...action, judgment: { kind: 'denied', evidence: conclusionEvidence(effect.veto) } }
    return 'effectiveArguments' in effect.subject
      ? { ...action, effectiveArguments: effect.subject.effectiveArguments }
      : action
  })
  return { ...batch, actions, beforePass: callsIn(effects) }
}

export const callsIn = (effects: readonly PassEffect[] | null): readonly PassageId[] =>
  (effects ?? []).flatMap(effect => effect.conclusions.map(conclusion => conclusion.passage))

export function eachSubject(
  action: Action,
  slot: ActionSlot,
  candidate: Message,
): PassSubject | null {
  if (slot.kind === 'denied')
    return {
      action: action.id,
      subject: {
        action: action.id,
        candidate,
        outcome: { kind: 'denied', evidence: slot.evidence },
      },
    }
  if (slot.kind !== 'result') return null
  const { result, terminal } = slot
  return {
    action: action.id,
    subject: { action: action.id, candidate, outcome: { kind: 'executed', result, terminal } },
  }
}

export function eachSlot(
  slot: ActionSlot,
  candidate: Message,
  effect: PassEffect | undefined,
  digest: (candidate: Message) => string,
): ActionSlot {
  const left =
    effect !== undefined && 'candidate' in effect.subject ? effect.subject.candidate : candidate
  return {
    ...slot,
    each: callsIn(effect === undefined ? null : [effect]),
    candidateDigest: digest(left),
  }
}

export function rewrittenCandidate(
  candidate: Message,
  calls: readonly PassageId[] | null,
  passages: readonly Passage[],
): Message {
  return (calls ?? []).reduce((current, id) => {
    const call = passages.find(passage => passage.id === id)
    const output = call?.progress.kind === 'applied' ? call.progress.conclusion.output : undefined
    return output?.kind === 'rewrite' && 'candidate' in output.subject
      ? output.subject.candidate
      : current
  }, candidate)
}

export function batchSubject(batch: ActionBatch): Subject {
  return {
    batch: batch.id,
    outcomes: batch.actions.map(action => {
      const slot = batch.slots.find(item => item.action === action.id)
      return {
        action: action.id,
        outcome: slot?.kind === 'denied' ? ('denied' as const) : ('executed' as const),
        terminal: slot?.kind === 'result' ? slot.terminal : null,
      }
    }),
  }
}

export function failureTrigger(dispatches: readonly DispatchRecord[]): 'first-content' | 'final' {
  return dispatches.some(record => record.firstContent !== 'none-proven')
    ? 'final'
    : 'first-content'
}
