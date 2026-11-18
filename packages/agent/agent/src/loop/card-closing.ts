import {
  decodeAgentOperationId,
  type Access,
  type Action,
  type ActionBatch,
  type AgentCheckpoint,
  type AgentExecutionId,
  type CardRound,
  type CardRoundId,
  type DurableEvidence,
  type Failure,
  type Passage,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { AGENT_OWNER, agentEvidence } from './identities.ts'
import { afterClosed, chainOf, needOfAction, presentRequest } from './admission-chain.ts'
import { localFailure } from './node-failure.ts'
import { deniedForRefusedAdmission, type ToolAdmission } from './tools.ts'
import { needOf, type PassageNeed } from './passages.ts'

export const OUT_ROUNDS: readonly PassageNeed[] = ['present', 'read', 'closed']

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'cards' | 'clock'>
type Closed = Readonly<{ actions: Action[]; passages: readonly Passage[] }>

const defect = (diagnostic: string): Failure =>
  localFailure('invariant', { kind: 'unavailable', owner: `${AGENT_OWNER}#defect`, diagnostic })

/** Card rounds always end: what may still be open with the person is withdrawn, chains settle. */
export function cardClosing<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  unsentRounds: ReadonlySet<CardRoundId>,
) {
  async function shownCards(
    chain: Passage,
    round: CardRound,
  ): Promise<Outcome<readonly DurableEvidence[], Failure>> {
    if (round.progress.kind === 'presented')
      return succeed(round.progress.cards.map(card => card.card))
    const request = presentRequest(chain)
    if (request === null) return fail(defect('an open round to present has no request'))
    const found = await ports.cards.lookup({ ...access, execution, ...request })
    if ('failure' in found) return found
    if (found.ok.kind === 'unknown')
      return fail({
        kind: 'unavailable',
        owner: 'agentDecisionCards',
        diagnostic: 'the result of presenting a card round is unknown',
      })
    return succeed(found.ok.kind === 'presented' ? found.ok.cards : [])
  }

  // The operation is the round's, so a retry withdraws it once.
  async function withdrawRound(
    chain: Passage,
    reason: DurableEvidence,
    unsent: ReadonlySet<CardRoundId>,
  ): Promise<Outcome<void, Failure>> {
    const last = chain.progress.kind === 'asked' ? chain.progress.rounds.at(-1) : undefined
    if (last === undefined || needOf(chain) === 'closed' || unsent.has(last.round))
      return succeed(undefined)
    const cards = await shownCards(chain, last)
    if ('failure' in cards) return cards
    if (cards.ok.length === 0) return succeed(undefined)
    const operation = decodeAgentOperationId(`${last.round}/withdraw`)
    if ('failure' in operation) return fail(defect('a card round names no withdraw operation'))
    const withdrawn = await ports.cards.invalidate({
      ...access,
      operation: operation.ok,
      execution,
      passage: chain.id,
      round: last.round,
      cards: cards.ok,
      reason,
    })
    return 'failure' in withdrawn ? withdrawn : succeed(undefined)
  }

  // Ends the card rounds of the given needs: each is withdrawn, then its chain settles as card-closed.
  async function close(
    actions: readonly Action[],
    saved: readonly Passage[],
    needs: readonly PassageNeed[],
    reason: DurableEvidence,
    unsent: ReadonlySet<CardRoundId>,
  ): Promise<Outcome<Closed, Failure>> {
    const instant = await ports.clock.now()
    if ('failure' in instant) return instant
    let passages = saved
    const closed: Action[] = []
    for (const action of actions) {
      const chain = chainOf(passages, action)
      if (chain === null || !needs.includes(needOf(chain))) {
        closed.push(action)
        continue
      }
      const withdrawn = await withdrawRound(chain, reason, unsent)
      if ('failure' in withdrawn) return withdrawn
      const next = afterClosed(passages, action, chain, reason, instant.ok)
      if ('failure' in next) return fail(defect(`${next.failure.step} is not defined here`))
      passages = next.ok.passages
      closed.push(next.ok.action)
    }
    return succeed({ actions: closed, passages })
  }

  return {
    // A Run that finishes or is cancelled withdraws every card still open for its batch first.
    async withdrawOpen(
      at: Pick<AgentCheckpoint, 'batch' | 'passages'>,
      node: string,
      cause: unknown,
    ): Promise<Outcome<void, Failure>> {
      const reason = agentEvidence(`${execution}/${node}`, cause)
      for (const action of at.batch?.actions ?? []) {
        const chain = chainOf(at.passages, action)
        if (chain === null || !OUT_ROUNDS.includes(needOf(chain))) continue
        const withdrawn = await withdrawRound(chain, reason, unsentRounds)
        if ('failure' in withdrawn) return withdrawn
      }
      return succeed(undefined)
    },

    // A card the person never answered was closed: the action is refused and the Run goes on.
    async endAnswerless(
      batch: ActionBatch,
      saved: readonly Passage[],
    ): Promise<Outcome<Readonly<{ batch: ActionBatch; passages: readonly Passage[] }>, Failure>> {
      const reason = agentEvidence(`${execution}/${batch.id}/A1/closed`, batch.actions)
      const closed = await close(batch.actions, saved, ['closed'], reason, unsentRounds)
      if ('failure' in closed) return closed
      return succeed({
        batch: { ...batch, actions: closed.ok.actions },
        passages: closed.ok.passages,
      })
    },

    // The batch is denied as a whole; the cards still open for it are withdrawn and settled.
    async endRefused(
      batch: ActionBatch,
      judged: readonly Readonly<{ action: Action }>[],
      saved: readonly Passage[],
      opened: readonly CardRoundId[],
      cause: Extract<ToolAdmission, { kind: 'refused' }>,
    ): Promise<Outcome<Readonly<{ batch: ActionBatch; passages?: readonly Passage[] }>, Failure>> {
      const denied = {
        ...batch,
        actions: deniedForRefusedAdmission(execution, batch, cause, judged),
      }
      const current = [...judged.map(item => item.action), ...batch.actions.slice(judged.length)]
      if (!current.some(action => OUT_ROUNDS.includes(needOfAction(saved, action))))
        return succeed({ batch: denied })
      const reason = agentEvidence(`${execution}/${batch.id}/A0/refused`, cause)
      const unsent = new Set([...unsentRounds, ...opened])
      const closed = await close(current, saved, OUT_ROUNDS, reason, unsent)
      return 'failure' in closed ? closed : succeed({ batch: denied, passages: closed.ok.passages })
    },
  }
}
