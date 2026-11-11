// The progress of one passage that asks a person: its card rounds, in the ledger of the checkpoint.
// Every function is one step of the passage and is defined for a part of the states only; outside
// that part it answers `outside` and changes nothing, so a caller cannot move a round backward,
// present a round that was not saved, or hand back a round that is not fully answered
// (agent-contract verification, models/CardRounds.tla). The functions call no port and do not know
// who judged: the official admission and an extension use the same steps.
import type {
  CardAnswer,
  CardRemark,
  CardReply,
  CardRequest,
  CardRound,
  CardRoundId,
  Conclusion,
  DurableEvidence,
  Passage,
  PassageCard,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'

/** A step asked for in a state it is not defined for. */
export type Outside = Readonly<{ kind: 'outside'; step: string; state: string }>
type Stepped = Outcome<Passage, Outside>
type HumanReply = CardAnswer | CardRemark
type Answered = CardRound &
  Readonly<{ progress: Extract<CardRound['progress'], { kind: 'answered' }> }>

/**
 * What a passage needs next. `judge`: call the judge, fresh or with the answers of the last round.
 * `present`: the last round is saved and its cards are not known to exist. `read`: cards are out
 * and a person has not answered all of them. `closed`: a card of the last round was invalidated,
 * so the round gets no answer. `settled`: the passage has its final conclusion.
 */
export type PassageNeed = 'judge' | 'present' | 'read' | 'closed' | 'settled'

const outside = (step: string, passage: Passage): Stepped =>
  fail({ kind: 'outside', step, state: stateOf(passage) })

const roundsOf = (passage: Passage): readonly CardRound[] =>
  passage.progress.kind === 'requested' ? [] : passage.progress.rounds

const lastRound = (passage: Passage): CardRound | null => roundsOf(passage).at(-1) ?? null

function stateOf(passage: Passage): string {
  const last = lastRound(passage)
  return last === null ? passage.progress.kind : `${passage.progress.kind}/${last.progress.kind}`
}

const isHuman = (reply: PassageCard['response']): reply is HumanReply =>
  reply !== null && reply.kind !== 'invalidated'

/** The passage as asked, with the rounds `earlier` and then `last`. */
const asked = (passage: Passage, earlier: readonly CardRound[], last: CardRound): Passage => ({
  ...passage,
  progress: {
    kind: 'asked',
    rounds: earlier.reduceRight<[CardRound, ...CardRound[]]>(
      (tail, item) => [item, ...tail],
      [last],
    ),
  },
})

const withLastRound = (passage: Passage, round: CardRound): Passage =>
  asked(passage, roundsOf(passage).slice(0, -1), round)

export function needOf(passage: Passage | null): PassageNeed {
  if (passage === null || passage.progress.kind === 'requested') return 'judge'
  const last = lastRound(passage)
  if (passage.progress.kind !== 'asked' || last === null) return 'settled'
  const { progress } = last
  if (progress.kind === 'requested') return 'present'
  if (progress.kind === 'answered') return 'judge'
  if (progress.kind !== 'presented') return 'settled'
  return progress.cards.some(card => card.response?.kind === 'invalidated') ? 'closed' : 'read'
}

/**
 * Cards of a batch are presented only after every chain has its conclusion or waits on saved or
 * presented cards. A chain whose last round is answered and not handed back is not ready.
 */
export function mayPresent(needs: readonly PassageNeed[]): boolean {
  return !needs.includes('judge')
}

/** The last round when every card of it has the answer of a person; null otherwise. */
export function answeredRound(passage: Passage): Answered | null {
  const last = lastRound(passage)
  return passage.progress.kind === 'asked' && last?.progress.kind === 'answered'
    ? (last as Answered)
    : null
}

/** True when the judge asks again with the requests of the round the person answered last. */
export function repeatsAnsweredRound(passage: Passage, requests: readonly CardRequest[]): boolean {
  const answered = answeredRound(passage)
  if (answered === null) return false
  const values = (items: readonly CardRequest[]) => canonical(items.map(item => item.value))
  return values(answered.requests) === values(requests)
}

/**
 * The judge asked: a new round is saved as requested, before any card of it is presented. The
 * rounds answered before keep their answers.
 */
export function openRound(
  passage: Passage,
  round: CardRoundId,
  ask: CardRound['ask'],
  requests: readonly CardRequest[],
): Stepped {
  if (needOf(passage) !== 'judge' || requests.length === 0) return outside('openRound', passage)
  const rounds = roundsOf(passage)
  if (rounds.some(item => item.round === round)) return outside('openRound', passage)
  return succeed(asked(passage, rounds, { round, ask, requests, progress: { kind: 'requested' } }))
}

/** The cards of the saved round exist: one card for each request, in the order of the requests. */
export function markPresented(passage: Passage, cards: readonly DurableEvidence[]): Stepped {
  const last = lastRound(passage)
  if (needOf(passage) !== 'present' || last === null || cards.length !== last.requests.length)
    return outside('markPresented', passage)
  const presented = last.requests.map((request, index) => ({
    identity: request.identity,
    card: cards[index] as DurableEvidence,
    response: null,
    processed: null,
  }))
  return succeed(
    withLastRound(passage, { ...last, progress: { kind: 'presented', cards: presented } }),
  )
}

/**
 * One card got its reply. The reply of a card is saved once. The round is answered when every
 * card has the answer of a person; an invalidated card is saved as invalidated and is no answer.
 */
export function recordReply(
  passage: Passage,
  card: DurableEvidence,
  reply: Exclude<CardReply, { kind: 'pending' }>,
): Stepped {
  const last = lastRound(passage)
  if (passage.progress.kind !== 'asked' || last?.progress.kind !== 'presented')
    return outside('recordReply', passage)
  const key = canonical(card)
  const target = last.progress.cards.find(item => canonical(item.card) === key)
  if (target === undefined || target.response !== null) return outside('recordReply', passage)
  const cards = last.progress.cards.map(item =>
    item === target ? { ...item, response: reply } : item,
  )
  const kind = cards.every(item => isHuman(item.response)) ? 'answered' : 'presented'
  return succeed(withLastRound(passage, { ...last, progress: { kind, cards } }))
}

function processed(round: CardRound, conclusion: DurableEvidence): CardRound {
  if (round.progress.kind !== 'answered') return round
  const cards = round.progress.cards.map(card => ({ ...card, processed: conclusion }))
  return { ...round, progress: { kind: 'processed', cards, conclusion } }
}

/**
 * The judge gave its final conclusion, on a fresh call or with the answers of the last round.
 * Every answered round becomes processed.
 */
export function resolve(
  passage: Passage,
  conclusion: Conclusion,
  evidence: DurableEvidence,
): Stepped {
  if (needOf(passage) !== 'judge') return outside('resolve', passage)
  const rounds = roundsOf(passage).map(item => processed(item, evidence))
  return succeed({ ...passage, progress: { kind: 'resolved', rounds, conclusion } })
}

/**
 * The cards of the saved round were refused for certain. The round is recorded as failed, the
 * rounds answered before become processed, and the passage ends with the conclusion its caller
 * writes for the failure. The judge is not called again.
 */
export function failPresent(
  passage: Passage,
  failure: DurableEvidence,
  conclusion: Conclusion,
  evidence: DurableEvidence,
): Stepped {
  const last = lastRound(passage)
  if (needOf(passage) !== 'present' || last === null) return outside('failPresent', passage)
  const earlier = roundsOf(passage)
    .slice(0, -1)
    .map(item => processed(item, evidence))
  const failed: CardRound = { ...last, progress: { kind: 'present-failed', failure } }
  return succeed({
    ...passage,
    progress: { kind: 'resolved', rounds: [...earlier, failed], conclusion },
  })
}

/** The loop adopted the conclusion of the passage with the named transition. */
export function apply(passage: Passage, transition: DurableEvidence): Stepped {
  if (passage.progress.kind !== 'resolved') return outside('apply', passage)
  return succeed({ ...passage, progress: { ...passage.progress, kind: 'applied', transition } })
}
