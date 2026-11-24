import {
  decodeAgentOperationId,
  type Access,
  type Action,
  type ActionBatch,
  type AgentCheckpoint,
  type AgentExecutionId,
  type CardReply,
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
import {
  afterClosed,
  afterRejudged,
  afterReply,
  chainOf,
  needOfAction,
  presentRequest,
  type Judged,
} from './admission-chain.ts'
import { nestedChains } from './nested.ts'
import { localFailure } from './node-failure.ts'
import { deniedForRefusedAdmission, type ToolAdmission } from './tools.ts'
import { needOf, type PassageNeed } from './passages.ts'

export const OUT_ROUNDS: readonly PassageNeed[] = ['present', 'read', 'closed']

type Ports<P> = Pick<AgentDependencies<P, ContentBlock>, 'cards' | 'clock'>
type Closed = Readonly<{ actions: Action[]; passages: readonly Passage[] }>
type Withdrawn = readonly Readonly<{
  card: DurableEvidence
  reply: Exclude<CardReply, { kind: 'pending' }>
}>[]
type Settled = Extract<ToolAdmission, { kind: 'allowed' | 'denied' }>

const defect = (diagnostic: string): Failure =>
  localFailure('invariant', { kind: 'unavailable', owner: `${AGENT_OWNER}#defect`, diagnostic })

type Place<P> = Readonly<{ ports: Ports<P>; access: Access<P>; execution: AgentExecutionId }>

async function shownCards<P>(
  { ports, access, execution }: Place<P>,
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

// The operation is the round's, so a retry withdraws it once. Each card answers how it ended.
async function withdrawRoundAt<P>(
  place: Place<P>,
  chain: Passage,
  reason: DurableEvidence,
  unsent: ReadonlySet<CardRoundId>,
): Promise<Outcome<Withdrawn, Failure>> {
  const last = chain.progress.kind === 'asked' ? chain.progress.rounds.at(-1) : undefined
  if (last === undefined || needOf(chain) === 'closed' || unsent.has(last.round)) return succeed([])
  const cards = await shownCards(place, chain, last)
  if ('failure' in cards) return cards
  if (cards.ok.length === 0) return succeed([])
  const operation = decodeAgentOperationId(`${last.round}/withdraw`)
  if ('failure' in operation) return fail(defect('a card round names no withdraw operation'))
  return place.ports.cards.invalidate({
    ...place.access,
    operation: operation.ok,
    execution: place.execution,
    passage: chain.id,
    round: last.round,
    cards: cards.ok,
    reason,
  })
}

/** Card rounds always end: what may still be open with the person is withdrawn, chains settle. */
export function cardClosing<P>(
  ports: Ports<P>,
  access: Access<P>,
  execution: AgentExecutionId,
  unsentRounds: ReadonlySet<CardRoundId>,
) {
  const withdrawRound = (
    chain: Passage,
    reason: DurableEvidence,
    unsent: ReadonlySet<CardRoundId>,
  ) => withdrawRoundAt({ ports, access, execution }, chain, reason, unsent)

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
      const own = (at.batch?.actions ?? []).map(action => chainOf(at.passages, action))
      for (const chain of [...own, ...nestedChains(at.passages)]) {
        if (chain === null || !OUT_ROUNDS.includes(needOf(chain))) continue
        const withdrawn = await withdrawRound(chain, reason, unsentRounds)
        if ('failure' in withdrawn) return withdrawn
      }
      return succeed(undefined)
    },

    withdrawChain: (chain: Passage, reason: DurableEvidence) =>
      withdrawRound(chain, reason, unsentRounds),

    // The batch settled a waiting action: its card is withdrawn, unless the person answered first.
    async endSuperseded(
      batch: ActionBatch,
      waiting: Action,
      chain: Passage,
      saved: readonly Passage[],
      answer: Settled,
    ): Promise<Outcome<Judged & Readonly<{ heard: boolean }>, Failure>> {
      const reason = agentEvidence(`${execution}/${batch.id}/A0/rejudged/${waiting.id}`, {
        kind: answer.kind,
      })
      const withdrawn = await withdrawRound(chain, reason, unsentRounds)
      if ('failure' in withdrawn) return withdrawn
      const heard = withdrawn.ok.find(item => item.reply.kind !== 'invalidated')
      const instant = await ports.clock.now()
      if ('failure' in instant) return instant
      const next =
        heard === undefined
          ? afterRejudged(saved, answer, chain, instant.ok)
          : afterReply(saved, waiting, chain, heard.card, heard.reply)
      if ('failure' in next) return fail(defect(`${next.failure.step} is not defined here`))
      return succeed({ ...next.ok, heard: heard !== undefined })
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
