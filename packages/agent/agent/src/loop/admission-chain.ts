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
  type DenialCategory,
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
  close,
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

export type Judged = Readonly<{ action: Action; passages: readonly Passage[] }>
type Step = Outcome<Judged, Outside>
type Unsettled = Extract<Action['judgment'], { kind: 'pending' | 'waiting' }>

const unsettled = (action: Action): action is Action & Readonly<{ judgment: Unsettled }> =>
  action.judgment.kind === 'pending' || action.judgment.kind === 'waiting'

export function extensionPassages(passages: readonly Passage[]): readonly Passage[] {
  return passages.filter(passage => admissionActionOf(passage.id) === null)
}

export function chainOf(passages: readonly Passage[], action: Action): Passage | null {
  if (!unsettled(action)) return null
  const id = action.judgment.passage
  return passages.find(passage => passage.id === id) ?? null
}

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

export function freshChain(action: Action, id: PassageId): Passage {
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

export function handBackOf(chain: Passage | null): HandBack | null {
  const card = chain === null ? undefined : answeredRound(chain)?.progress.cards[0]
  if (card === undefined || card.response === null || card.response.kind === 'invalidated')
    return null
  return { card: card.card, answer: card.response }
}

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

export type Admitted =
  | Readonly<{ kind: 'judged'; action: Action }>
  | Readonly<{ kind: 'denied'; action: Action; category: DenialCategory }>
  | Readonly<{ kind: 'allowed'; action: Action; evidence: DurableEvidence }>
  | Extract<ToolAdmission, { kind: 'asked' }>

export function afterAdmission(
  passages: readonly Passage[],
  answer: Admitted,
  before: Passage | null,
  at: AgentInstant,
): Step & Readonly<{ opened?: CardRoundId }> {
  const { action } = answer
  if (answer.kind === 'asked') {
    if (action.judgment.kind !== 'pending') return succeed({ action, passages })
    const id = action.judgment.passage
    const chain = before ?? freshChain(action, id)
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
  // The chain's veto reason is the closed denial category; the message is read back from it.
  const reason: DenialCategory = answer.kind === 'denied' ? answer.category : 'rule'
  const denial = concluded(action, before.id, at, { kind: 'veto', reason })
  return stepped(action, passages, resolve(before, denial, action.judgment.evidence))
}

/** A waiting action as admission judges it again: the same action, asked without its card. */
export function judgedAgain(passages: readonly Passage[], action: Action): Action | null {
  if (action.judgment.kind !== 'waiting' || needOfAction(passages, action) !== 'read') return null
  return { ...action, judgment: { kind: 'pending', passage: action.judgment.passage } }
}

/** An answer that no longer asks settles a waiting action's chain without the person. */
export function afterRejudged(
  passages: readonly Passage[],
  answer: Extract<ToolAdmission, { kind: 'allowed' | 'denied' }>,
  chain: Passage,
  at: AgentInstant,
): Step {
  const { action } = answer
  const output: ExtensionOutput =
    answer.kind === 'allowed' ? { kind: 'observed' } : { kind: 'veto', reason: answer.category }
  return stepped(action, passages, close(chain, concluded(action, chain.id, at, output)))
}

/** A card round that ends with no answer refuses the action; it is not the person's no. */
export function afterClosed(
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  evidence: DurableEvidence,
  at: AgentInstant,
): Step {
  const denial = concluded(action, chain.id, at, { kind: 'veto', reason: 'card-closed' })
  const denied: Action = { ...action, judgment: { kind: 'denied', evidence } }
  return stepped(denied, passages, close(chain, denial))
}

// The categories a chain names; any other denial, with a chain or without, is a rule's.
const NAMED: ReadonlySet<string> = new Set<DenialCategory>([
  'not-released',
  'prohibited',
  'card-closed',
  'guidance',
])

const categoryOf = (output: ExtensionOutput | undefined): DenialCategory =>
  output?.kind === 'veto' && NAMED.has(output.reason) ? (output.reason as DenialCategory) : 'rule'

const guidanceWords = (
  progress: Extract<Passage['progress'], { kind: 'applied' }>,
): string | null => {
  const last = progress.rounds.at(-1)?.progress
  const response = last?.kind === 'processed' ? last.cards[0]?.response : undefined
  return response?.kind === 'remark' ? response.text : null
}

/** Why the action was denied, read from its chain, which the batch adopted before any message. */
export function denialOf(
  passages: readonly Passage[],
  action: ActionId,
): Readonly<{ category: DenialCategory; words: string | null }> {
  const progress = passages.find(passage => admissionActionOf(passage.id) === action)?.progress
  if (progress?.kind !== 'applied') return { category: 'rule', words: null }
  const category = categoryOf(progress.conclusion.output)
  return { category, words: category === 'guidance' ? guidanceWords(progress) : null }
}

export function presentRequest(chain: Passage): Readonly<{
  passage: PassageId
  round: CardRoundId
  original: DurableEvidence
  requests: readonly CardRequest[]
}> | null {
  if (needOf(chain) !== 'present' || chain.progress.kind !== 'asked') return null
  const last = chain.progress.rounds.at(-1) as CardRound
  const original = agentEvidence(`${last.round}/ask`, last.ask)
  return { passage: chain.id, round: last.round, original, requests: last.requests }
}

export function afterPresented(
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  cards: readonly DurableEvidence[],
): Step {
  const waiting: Action = { ...action, judgment: { kind: 'waiting', passage: chain.id, cards } }
  return stepped(waiting, passages, markPresented(chain, cards))
}

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

export function adopted(
  passages: readonly Passage[],
  transition: DurableEvidence,
): readonly Passage[] {
  return passages.map(passage => {
    const next = apply(passage, transition)
    return 'failure' in next ? passage : next.ok
  })
}
