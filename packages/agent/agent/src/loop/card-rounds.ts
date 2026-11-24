import type {
  Access,
  AgentExecutionId,
  Authority,
  CardRoundId,
  DurableEvidence,
  Failure,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import type { presentRequest } from './admission-chain.ts'
import { agentEvidence } from './identities.ts'

export type RoundCards =
  | Readonly<{ kind: 'cards'; cards: readonly DurableEvidence[] }>
  | Readonly<{ kind: 'refused'; failure: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; failure: Extract<Failure, { kind: 'unavailable' }> }>

type Place<P> = Readonly<{
  ports: Pick<AgentDependencies<P, ContentBlock>, 'cards'>
  access: Access<P>
  execution: AgentExecutionId
  unsentRounds: Set<CardRoundId>
}>

/** Puts the cards of one round before the person once; a round whose sending is not known is looked up. */
export function cardRounds<P>(place: Place<P>, authority: () => Authority) {
  const { ports, access, execution, unsentRounds } = place
  return async function roundCards(
    request: NonNullable<ReturnType<typeof presentRequest>>,
  ): Promise<Outcome<RoundCards, Failure>> {
    const unknown = (owner: string, diagnostic: string): Outcome<RoundCards, Failure> =>
      succeed({ kind: 'unknown', failure: { kind: 'unavailable', owner, diagnostic } })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (unsentRounds.has(request.round)) {
        unsentRounds.delete(request.round)
        const presented = await ports.cards.present({ ...access, advance: authority(), ...request })
        if ('ok' in presented) return succeed({ kind: 'cards', cards: presented.ok })
        const { failure } = presented
        if (failure.kind === 'denied' || failure.kind === 'conflict' || failure.kind === 'invalid')
          return succeed({
            kind: 'refused',
            failure: agentEvidence(`${request.round}/present-failed`, failure),
          })
        if (failure.kind !== 'commit-unknown' && failure.kind !== 'unavailable') return presented
      }
      const found = await ports.cards.lookup({ ...access, execution, ...request })
      if ('failure' in found) {
        if (found.failure.kind !== 'unavailable') return found
        return succeed({ kind: 'unknown', failure: found.failure })
      }
      if (found.ok.kind === 'presented') return succeed({ kind: 'cards', cards: found.ok.cards })
      if (found.ok.kind === 'unknown')
        return unknown('agentDecisionCards', 'the result of presenting a card round is unknown')
      unsentRounds.add(request.round)
    }
    return unknown('agentDecisionCards', 'the result of presenting a card round is unknown')
  }
}
