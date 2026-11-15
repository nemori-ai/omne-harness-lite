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

export type Outside = Readonly<{ kind: 'outside'; step: string; state: string }>
type Stepped = Outcome<Passage, Outside>
type HumanReply = CardAnswer | CardRemark
type Answered = CardRound &
  Readonly<{ progress: Extract<CardRound['progress'], { kind: 'answered' }> }>

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

export function mayPresent(needs: readonly PassageNeed[]): boolean {
  return !needs.includes('judge')
}

export function answeredRound(passage: Passage): Answered | null {
  const last = lastRound(passage)
  return passage.progress.kind === 'asked' && last?.progress.kind === 'answered'
    ? (last as Answered)
    : null
}

export function repeatsAnsweredRound(passage: Passage, requests: readonly CardRequest[]): boolean {
  const answered = answeredRound(passage)
  if (answered === null) return false
  const values = (items: readonly CardRequest[]) => canonical(items.map(item => item.value))
  return values(answered.requests) === values(requests)
}

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

export function resolve(
  passage: Passage,
  conclusion: Conclusion,
  evidence: DurableEvidence,
): Stepped {
  if (needOf(passage) !== 'judge') return outside('resolve', passage)
  const rounds = roundsOf(passage).map(item => processed(item, evidence))
  return succeed({ ...passage, progress: { kind: 'resolved', rounds, conclusion } })
}

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

export function apply(passage: Passage, transition: DurableEvidence): Stepped {
  if (passage.progress.kind !== 'resolved') return outside('apply', passage)
  return succeed({ ...passage, progress: { ...passage.progress, kind: 'applied', transition } })
}
