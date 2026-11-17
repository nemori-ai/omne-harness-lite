import type {
  Access,
  AgentExecutionId,
  Authority,
  CardRoundId,
  DecisionCards,
  Failure,
} from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { CardDesk, RoundCards } from './extension-drive.ts'
import { agentEvidence } from './identities.ts'

type Request = Parameters<CardDesk['present']>[0]

const unknown = (): Outcome<RoundCards, Failure> =>
  succeed({
    kind: 'unknown',
    failure: {
      kind: 'unavailable',
      owner: 'agentDecisionCards',
      diagnostic: 'the result of presenting a card round is unknown',
    },
  })

// A round this process opened is presented; any other is looked up by its round and whole request
// first, so a lost receipt does not present the cards again.
export function createCardDesk<P>(
  ports: Readonly<{ cards: DecisionCards<P> }>,
  access: Access<P>,
  execution: AgentExecutionId,
  authority: () => Authority,
): CardDesk {
  const unsent = new Set<CardRoundId>()
  async function present(request: Request): Promise<Outcome<RoundCards, Failure>> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (unsent.delete(request.round)) {
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
      if ('failure' in found)
        return found.failure.kind === 'unavailable'
          ? succeed({ kind: 'unknown', failure: found.failure })
          : found
      if (found.ok.kind === 'presented') return succeed({ kind: 'cards', cards: found.ok.cards })
      if (found.ok.kind === 'unknown') return unknown()
      unsent.add(request.round)
    }
    return unknown()
  }
  return {
    present,
    read: card => ports.cards.read({ ...access, card }),
    opened: round => void unsent.add(round),
  }
}
