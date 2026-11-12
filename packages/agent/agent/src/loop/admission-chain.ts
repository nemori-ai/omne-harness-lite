// The official admission of one action as a passage that may ask a person (SPEC "整批判断屏障与动作
// 准入" 2, 5, 7 and 11). The passage enters the ledger when the admission first asks; an action that
// is allowed or denied at once has none. Every function here maps one answer of a port to the new
// judgment of the action and the new ledger; none calls a port. The steps of the passage itself are
// `passages.ts`.
import {
  ACTION_ADMISSION_DECLARATION as DECLARATION,
  ACTION_ADMISSION_IMPLEMENTATION as IMPLEMENTATION,
  admissionActionOf,
  cardDraftOf,
  cardRequestOf,
  type Action,
  type ActionId,
  type AgentInstant,
  type CardReply,
  type CardRound,
  type CardRoundId,
  type CardRequest,
  type Conclusion,
  type DurableEvidence,
  type ExtensionOutput,
  type Passage,
  type PassageId,
  type Waiting,
} from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import { agentEvidence, cardRequestIdentity, cardRound } from './identities.ts'
import {
  answeredRound,
  apply,
  failPresent,
  markPresented,
  needOf,
  openRound,
  recordReply,
  repeatsAnsweredRound,
  resolve,
  type Outside,
  type PassageNeed,
} from './passages.ts'
import type { HandBack, ToolAdmission } from './tools.ts'

/** The judgment of one action and the ledger after a step of its admission. */
export type Judged = Readonly<{ action: Action; passages: readonly Passage[] }>
type Step = Outcome<Judged, Outside>
type Unsettled = Extract<Action['judgment'], { kind: 'pending' | 'waiting' }>

const unsettled = (action: Action): action is Action & Readonly<{ judgment: Unsettled }> =>
  action.judgment.kind === 'pending' || action.judgment.kind === 'waiting'

/**
 * The passages that are not an official admission. The action batch continues and clears the
 * passages of its admissions; every other passage belongs to an extension position.
 */
export function extensionPassages(passages: readonly Passage[]): readonly Passage[] {
  return passages.filter(passage => admissionActionOf(passage.id) === null)
}

/** The passage of the admission of an action whose judgment is not final; null when it never asked. */
export function chainOf(passages: readonly Passage[], action: Action): Passage | null {
  if (!unsettled(action)) return null
  const id = action.judgment.passage
  return passages.find(passage => passage.id === id) ?? null
}

/** What the admission of an action needs next; `settled` once the action is allowed or denied. */
export function needOfAction(passages: readonly Passage[], action: Action): PassageNeed {
  return unsettled(action) ? needOf(chainOf(passages, action)) : 'settled'
}

const replaced = (passages: readonly Passage[], next: Passage): readonly Passage[] =>
  passages.some(passage => passage.id === next.id)
    ? passages.map(passage => (passage.id === next.id ? next : passage))
    : [...passages, next]

const stepped = (
  action: Action,
  passages: readonly Passage[],
  next: Outcome<Passage, Outside>,
): Step => ('failure' in next ? next : succeed({ action, passages: replaced(passages, next.ok) }))

function concluded<O extends ExtensionOutput>(
  action: Action,
  passage: PassageId,
  at: AgentInstant,
  output: O,
): Conclusion & Readonly<{ output: O }> {
  return {
    position: 'before_action',
    action: action.id,
    passage,
    extension: DECLARATION.name,
    implementation: IMPLEMENTATION,
    power: DECLARATION.power,
    at,
    output,
  }
}

/** The passage of an admission before its first call, as the ledger names it. */
function fresh(action: Action, id: PassageId): Passage {
  const input = agentEvidence(`${id}/input`, [action.original.callId, action.effectiveArguments])
  return {
    id,
    position: 'before_action',
    dimension: null,
    purpose: null,
    action: action.id,
    ordinal: 0,
    declaration: DECLARATION,
    implementation: IMPLEMENTATION,
    input,
    effective: input,
    operations: [],
    progress: { kind: 'requested', mode: { kind: 'fresh' } },
  }
}

const roundCount = (passage: Passage): number =>
  passage.progress.kind === 'requested' ? 0 : passage.progress.rounds.length

/**
 * The answer a person gave to the card of the last round, for the next call of the admission. Null
 * when the admission never asked or its round is not fully answered.
 */
export function handBackOf(chain: Passage | null): HandBack | null {
  const card = chain === null ? undefined : answeredRound(chain)?.progress.cards[0]
  if (card === undefined || card.response === null || card.response.kind === 'invalidated')
    return null
  return { card: card.card, answer: card.response }
}

/**
 * The action as the admission judges it with the answer: the person who chose the option bound to
 * the proposed rewrite of the card changed the effective arguments to that rewrite (rule 7).
 */
export function withChosenRewrite(
  action: Action,
  chain: Passage | null,
  handBack: HandBack | null,
): Action {
  const request = chain === null ? undefined : answeredRound(chain)?.requests[0]
  const rewrite = request === undefined ? undefined : cardDraftOf(request)?.proposedRewrite
  if (rewrite === undefined || handBack?.answer.kind !== 'chosen') return action
  return handBack.answer.option === rewrite.option
    ? { ...action, effectiveArguments: rewrite.effectiveArguments }
    : action
}

/**
 * The ledger after one answer of the admission. An allow or a deny ends a passage that asked
 * before. An ask saves a new round as requested; an ask that repeats the round the person answered
 * last ends the passage with a denial instead, so the person is not asked the same card again.
 */
export function afterAdmission(
  passages: readonly Passage[],
  answer: Exclude<ToolAdmission, { kind: 'unavailable' }>,
  before: Passage | null,
  at: AgentInstant,
): Step & Readonly<{ opened?: CardRoundId }> {
  const { action } = answer
  if (answer.kind === 'asked') {
    if (action.judgment.kind !== 'pending') return succeed({ action, passages })
    const id = action.judgment.passage
    const chain = before ?? fresh(action, id)
    const round = cardRound(id, roundCount(chain) + 1)
    const requests = [cardRequestOf(cardRequestIdentity(round, 1), answer.card)]
    if (repeatsAnsweredRound(chain, requests)) {
      const denial = concluded(action, id, at, { kind: 'veto', reason: 'replayInconsistent' })
      const denied: Action = { ...action, judgment: { kind: 'denied', evidence: answer.evidence } }
      return stepped(denied, passages, resolve(chain, denial, answer.evidence))
    }
    const ask = concluded(action, id, at, { kind: 'ask', card: answer.card })
    const opened = stepped(action, passages, openRound(chain, round, ask, requests))
    return 'failure' in opened ? opened : { ...opened, opened: round }
  }
  if (before === null) return succeed({ action, passages })
  if (answer.kind === 'allowed')
    return stepped(
      action,
      passages,
      resolve(before, concluded(action, before.id, at, { kind: 'observed' }), answer.evidence),
    )
  if (action.judgment.kind !== 'denied') return succeed({ action, passages })
  // The admission denied with its own reason; `judged` is the trusted request source answering.
  const reason = answer.kind === 'denied' ? answer.reason : 'denied'
  const denial = concluded(action, before.id, at, { kind: 'veto', reason })
  return stepped(action, passages, resolve(before, denial, action.judgment.evidence))
}

/** The reason the admission denies with when the remark of a person gives no decision (rule 11). */
const HUMAN_GUIDANCE = 'human-guidance'

/**
 * The words the denial message of an action carries: the remark that answered the last card of its
 * admission, when the admission denied the action for that remark (rule 11). Null for every other
 * denial.
 */
export function guidanceOf(passages: readonly Passage[], action: ActionId): string | null {
  const progress = passages.find(passage => admissionActionOf(passage.id) === action)?.progress
  if (progress?.kind !== 'resolved' && progress?.kind !== 'applied') return null
  const { output } = progress.conclusion
  if (output?.kind !== 'veto' || output.reason !== HUMAN_GUIDANCE) return null
  const last = progress.rounds.at(-1)?.progress
  const response = last?.kind === 'processed' ? last.cards[0]?.response : undefined
  return response?.kind === 'remark' ? response.text : null
}

/** What `present` and `lookup` of the saved round of a passage take, apart from access and advance. */
export function presentRequest(chain: Passage): Readonly<{
  passage: PassageId
  round: CardRoundId
  original: DurableEvidence
  requests: readonly CardRequest[]
}> | null {
  if (needOf(chain) !== 'present' || chain.progress.kind !== 'asked') return null
  const last = chain.progress.rounds.at(-1) as CardRound
  // Derived from the saved ask alone, so a lookup after a restart names the same original.
  const original = agentEvidence(`${last.round}/ask`, last.ask)
  return { passage: chain.id, round: last.round, original, requests: last.requests }
}

/** The cards of the saved round exist: the action waits on them. */
export function afterPresented(
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  cards: readonly DurableEvidence[],
): Step {
  const waiting: Action = { ...action, judgment: { kind: 'waiting', passage: chain.id, cards } }
  return stepped(waiting, passages, markPresented(chain, cards))
}

/**
 * The cards were refused for certain: the action is denied with the failure as its evidence, and
 * the passage ends with a conclusion this loop writes for the failure (rule 11). No person is
 * waited for and no answer is made up.
 */
export function afterPresentRefused(
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  failure: DurableEvidence,
  at: AgentInstant,
): Step {
  const denial: Conclusion = {
    ...concluded(action, chain.id, at, { kind: 'veto', reason: 'the cards were not presented' }),
    skipped: 'errored',
    error: 'card presentation failed',
  }
  const denied: Action = { ...action, judgment: { kind: 'denied', evidence: failure } }
  return stepped(denied, passages, failPresent(chain, failure, denial, failure))
}

/**
 * One card got its reply. When every card of the round has the answer of a person the action goes
 * back to pending: the admission is called again with the answer.
 */
export function afterReply(
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  card: DurableEvidence,
  reply: Exclude<CardReply, { kind: 'pending' }>,
): Step {
  const next = recordReply(chain, card, reply)
  if ('failure' in next) return next
  const judged: Action =
    needOf(next.ok) === 'judge'
      ? { ...action, judgment: { kind: 'pending', passage: chain.id } }
      : action
  return stepped(judged, passages, next)
}

/** The cards a person has not answered yet, one wait for each passage that has some. */
export function humanWaits(
  passages: readonly Passage[],
  actions: readonly Action[],
): Extract<Waiting, { kind: 'human' }>[] {
  return actions.flatMap(action => {
    if (action.judgment.kind !== 'waiting') return []
    const { passage } = action.judgment
    const chain = chainOf(passages, action)
    const last = chain?.progress.kind === 'asked' ? chain.progress.rounds.at(-1) : undefined
    if (last?.progress.kind !== 'presented') return []
    const cards = last.progress.cards.filter(card => card.response === null).map(card => card.card)
    return cards.length === 0 ? [] : [{ kind: 'human' as const, passage, cards }]
  })
}

/** The ledger once the barrier of the batch is decided: every concluded passage is adopted. */
export function adopted(
  passages: readonly Passage[],
  transition: DurableEvidence,
): readonly Passage[] {
  return passages.map(passage => {
    const next = apply(passage, transition)
    return 'failure' in next ? passage : next.ok
  })
}
