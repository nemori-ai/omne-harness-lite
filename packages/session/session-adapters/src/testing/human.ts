import type {
  AgentCheckpoint,
  AgentEvent,
  DurableEvidence,
  Passage,
  PassageCard,
  ActionIdentity,
  CommandReceipt,
} from '@omne-harness/agent-contract'
import type { SessionLogConsequence } from '@omne-harness/session-contract'
import { canonical } from './canonical.ts'

export type HumanFragment = Readonly<{
  original: Readonly<{
    execution: AgentEvent['execution']
    sequence: string
    source: DurableEvidence
    receipt: CommandReceipt
  }>
  passage: Pick<Passage, 'id' | 'position' | 'dimension' | 'action'>
  cards: readonly Readonly<{ round: string; ask: ActionIdentity; card: PassageCard }>[]
}>
export function captureHuman(
  event: AgentEvent,
  checkpoint: AgentCheckpoint,
  receipt: CommandReceipt,
): readonly HumanFragment[] {
  if (event.body.kind !== 'waiting') return []
  return event.body.waits.flatMap(wait => {
    if (wait.kind !== 'human') return []
    const passages = checkpoint.passages.filter(item => item.id === wait.passage)
    const passage = passages[0]
    if (passages.length !== 1 || !passage || passage.progress.kind === 'requested')
      throw new TypeError('human passage has no original card rounds')
    const selected = new Set<string>()
    const cards = wait.cards.map(reference => {
      const key = canonical(reference)
      if (selected.has(key)) throw new TypeError('duplicate human card')
      selected.add(key)
      const matches =
        passage.progress.kind === 'requested'
          ? []
          : passage.progress.rounds.flatMap(round => {
              if (!('cards' in round.progress)) return []
              return round.progress.cards
                .filter(card => canonical(card.card) === key)
                .map(card => ({ round: round.round, ask: round.ask, card }))
            })
      const match = matches[0]
      if (matches.length !== 1 || !match)
        throw new TypeError('human card has no unique original round')
      if (match.ask.position !== passage.position)
        throw new TypeError('human ask position differs from passage')
      const requiresAction =
        passage.position === 'before_action' ||
        (passage.position === 'after_action' &&
          passage.dimension !== null &&
          'scope' in passage.dimension &&
          passage.dimension.scope === 'each')
      if (requiresAction) {
        if (!passage.action || match.ask.action !== passage.action)
          throw new TypeError('human action differs from original ask')
      } else if (passage.action !== null || 'action' in match.ask)
        throw new TypeError('action supplied to actionless passage')
      if (
        'dimension' in match.ask &&
        canonical(match.ask.dimension) !== canonical(passage.dimension)
      )
        throw new TypeError('human dimension differs from original ask')
      const ask: ActionIdentity =
        match.ask.position === 'before_action'
          ? { position: match.ask.position, action: match.ask.action! }
          : match.ask.position === 'after_action'
            ? match.ask.dimension.scope === 'each'
              ? {
                  position: match.ask.position,
                  dimension: match.ask.dimension,
                  action: match.ask.action!,
                }
              : { position: match.ask.position, dimension: match.ask.dimension }
            : match.ask.position === 'after_model_call'
              ? match.ask.dimension.ending === 'failure'
                ? {
                    position: match.ask.position,
                    dimension: match.ask.dimension,
                    call: match.ask.call!,
                  }
                : { position: match.ask.position, dimension: match.ask.dimension }
              : { position: match.ask.position }
      return { round: match.round, ask, card: structuredClone(match.card) }
    })
    return [
      {
        original: {
          execution: event.execution,
          sequence: event.sequence,
          source: event.cause,
          receipt,
        },
        passage: {
          id: passage.id,
          position: passage.position,
          dimension: passage.dimension,
          action: passage.action,
        },
        cards,
      },
    ]
  })
}
export function humanWaiting(
  fragment: HumanFragment,
): Extract<SessionLogConsequence, { kind: 'registered-waiting' }>['other'][number] {
  const members = fragment.cards.map(({ card }) => ({
    card: card.card,
    decision:
      card.response?.kind === 'chosen' || card.response?.kind === 'declined'
        ? card.response.evidence
        : null,
  }))
  return fragment.passage.action === null
    ? {
        kind: 'extension-passage',
        passage: fragment.passage.id,
        position: fragment.passage.position,
        members,
      }
    : {
        kind: 'extension-batch',
        passage: fragment.passage.id,
        position: fragment.passage.position,
        members: members.map(member => ({ ...member, action: fragment.passage.action! })),
      }
}
