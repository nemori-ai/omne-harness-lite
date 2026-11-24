import { createHash } from 'node:crypto'
import type {
  Access,
  Action,
  ActionBatch,
  ActionId,
  ActionToolCall,
  AdmissionDecision,
  AgentExecutionId,
  Authority,
  CardRoundId,
  DurableEvidence,
  Failure,
  NestedActionTarget,
  NestedActionVerdict,
  Passage,
} from '@omne-harness/agent-contract'
import { judgeBlockIdentity, type ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentDependencies } from '../construction.ts'
import { json } from '../receiving-values.ts'
import {
  afterAdmission,
  afterClosed,
  afterPresentRefused,
  afterPresented,
  afterReply,
  chainOf,
  handBackOf,
  humanWaits,
  presentRequest,
  withChosenRewrite,
  type Judged,
} from './admission-chain.ts'
import type { RoundCards } from './extension-drive.ts'
import { agentEvidence } from './identities.ts'
import { needOf, type Outside } from './passages.ts'
import { toolConsumer } from './tools.ts'

/** One position a program asked about and has no answer for yet. The run does not keep it. */
export type NestedRequest = Readonly<{
  parent: ActionId
  ordinal: number
  target: NestedActionTarget
  withdrawn(): boolean
  answer(verdict: NestedActionVerdict): void
}>

type Ports<P> = Pick<
  AgentDependencies<P, ContentBlock>,
  'admission' | 'materials' | 'cards' | 'clock'
>

export type NestedTurnInput<P> = Readonly<{
  ports: Ports<P>
  access: Access<P>
  execution: AgentExecutionId
  authority: Authority
  batch: ActionBatch
  passages: readonly Passage[]
  requests: readonly NestedRequest[]
  present(
    request: NonNullable<ReturnType<typeof presentRequest>>,
  ): Promise<Outcome<RoundCards, Failure>>
  withdraw(chain: Passage, reason: DurableEvidence): Promise<Outcome<unknown, Failure>>
}>
export type NestedTurn = Readonly<{
  passages: readonly Passage[]
  opened: readonly CardRoundId[]
}>

function parsed(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function originalOf(id: ActionId, target: NestedActionTarget): ActionToolCall | null {
  const value = parsed(target.arguments)
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 32)
  const identity = judgeBlockIdentity({
    id: `blk_nested_${digest}`,
    visibility: { toHuman: true, toModel: false },
  })
  if (value === undefined || 'rejected' in identity) return null
  const { name } = target
  return { ...identity.ok, kind: 'tool_call', callId: id, name, arguments: json(value) }
}

type Step = Outcome<Judged, Outside>
type Place<P> = Pick<NestedTurnInput<P>, 'ports' | 'access' | 'execution' | 'authority' | 'present'>

export const defect = (step: string): Failure => ({
  kind: 'unavailable',
  owner: '@omne-harness/agent#defect',
  diagnostic: `nested action: ${step} is not defined here`,
})
const taken = (step: Step): Outcome<readonly Passage[], Failure> =>
  'failure' in step ? fail(defect(step.failure.step)) : succeed(step.ok.passages)

/** Ends an open chain without a person: its card is withdrawn first, then the reason is recorded. */
export async function closed<P>(
  input: NestedTurnInput<P>,
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  cause: string,
): Promise<Outcome<readonly Passage[], Failure>> {
  const reason = agentEvidence(`${input.execution}/${action.id}/${cause}`, null)
  const withdrawn = await input.withdraw(chain, reason)
  if ('failure' in withdrawn) return withdrawn
  const instant = await input.ports.clock.now()
  if ('failure' in instant) return instant
  if (needOf(chain) === 'judge') {
    const denied: Action = { ...action, judgment: { kind: 'denied', evidence: reason } }
    return taken(
      afterAdmission(
        passages,
        { kind: 'denied', action: denied, category: 'rule' },
        chain,
        instant.ok,
      ),
    )
  }
  return taken(afterClosed(passages, action, chain, reason, instant.ok))
}

/** The full original request is kept before any judgment of it is committed. */
async function preserved<P>(place: Place<P>, action: Action, request: NestedRequest) {
  const { parent, ordinal, target } = request
  return place.ports.materials.preserve({
    ...place.access,
    execution: place.execution,
    identity: `${place.execution}/${action.id}/request`,
    consumer: toolConsumer(place.execution, action),
    value: {
      kind: 'facts',
      schema: {
        owner: 'agent',
        name: 'nested-action-request',
        revision: '1',
        digest: 'agent:nested-action-request/1',
      },
      value: {
        kind: 'object',
        entries: [
          { key: 'parent', value: { kind: 'string', value: parent } },
          { key: 'ordinal', value: { kind: 'number', lexeme: String(ordinal) } },
          { key: 'name', value: { kind: 'string', value: target.name } },
          {
            key: 'command',
            value:
              target.command === null
                ? { kind: 'null' }
                : { kind: 'string', value: target.command },
          },
          { key: 'arguments', value: { kind: 'string', value: target.arguments } },
        ],
      },
    },
  })
}

/** Asks the same admission a direct action is asked, under the position of this one. */
export async function judged<P>(
  place: Place<P>,
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
  request: NestedRequest,
): Promise<
  Outcome<
    Readonly<{ passages: readonly Passage[]; opened?: CardRoundId }> | 'unanswerable',
    Failure
  >
> {
  if (action.judgment.kind !== 'pending') return succeed({ passages })
  const instant = await place.ports.clock.now()
  if ('failure' in instant) return instant
  const veto = (reason: string) => {
    const evidence = agentEvidence(`${place.execution}/${action.id}/${reason}`, null)
    const denied: Action = { ...action, judgment: { kind: 'denied', evidence } }
    const step = afterAdmission(
      passages,
      { kind: 'denied', action: denied, category: 'rule' },
      chain,
      instant.ok,
    )
    return 'failure' in step
      ? fail(defect(step.failure.step))
      : succeed({ passages: step.ok.passages })
  }
  const original = originalOf(action.id, request.target)
  if (original === null) return veto('arguments-unreadable')
  const handBack = handBackOf(chain)
  if (withChosenRewrite(action, chain, handBack).effectiveArguments !== action.effectiveArguments)
    return veto('rewrite-refused')
  const kept = await preserved(place, action, request)
  if ('failure' in kept) return kept.failure.kind === 'unavailable' ? succeed('unanswerable') : kept
  const admitted = await place.ports.admission.admit({
    ...place.access,
    advance: place.authority,
    execution: place.execution,
    passage: action.judgment.passage,
    action: action.id,
    original,
    effectiveArguments: action.effectiveArguments,
    definition: request.target.definition,
    permissions: [],
    decision: handBack,
    nested: { parent: request.parent, ordinal: request.ordinal },
  })
  if ('failure' in admitted)
    return admitted.failure.kind === 'unavailable'
      ? succeed('unanswerable')
      : veto('admission-refused')
  const decision = admitted.ok
  if (decision.kind === 'unavailable') return succeed('unanswerable')
  if (decision.kind === 'undecidable') return veto('undecidable')
  const step = afterAdmission(passages, concluded(action, decision), chain, instant.ok)
  if ('failure' in step) return fail(defect(step.failure.step))
  return succeed({
    passages: step.ok.passages,
    ...(step.opened === undefined ? {} : { opened: step.opened }),
  })
}

/** What the chain is told of a decision that is one: allowed, denied with its category, or asked with its card. */
function concluded(
  action: Action,
  decision: Exclude<AdmissionDecision, { kind: 'unavailable' | 'undecidable' }>,
): Parameters<typeof afterAdmission>[1] {
  switch (decision.kind) {
    case 'allow':
      return { kind: 'allowed', action, evidence: decision.evidence }
    case 'deny':
      return {
        kind: 'denied',
        action: { ...action, judgment: { kind: 'denied', evidence: decision.evidence } },
        category: decision.category,
      }
    case 'need-decision':
      return { kind: 'asked', action, card: decision.card, evidence: decision.evidence }
  }
}

export async function presented<P>(
  place: Place<P>,
  passages: readonly Passage[],
  action: Action,
  chain: Passage,
): Promise<Outcome<readonly Passage[], Failure>> {
  const request = presentRequest(chain)
  if (request === null) return succeed(passages)
  const cards = await place.present(request)
  if ('failure' in cards) return cards
  if (cards.ok.kind === 'unknown') return succeed(passages)
  if (cards.ok.kind === 'cards')
    return taken(afterPresented(passages, action, chain, cards.ok.cards))
  const instant = await place.ports.clock.now()
  if ('failure' in instant) return instant
  return taken(afterPresentRefused(passages, action, chain, cards.ok.failure, instant.ok))
}

export async function read<P>(
  place: Place<P>,
  saved: readonly Passage[],
  action: Action,
): Promise<Outcome<readonly Passage[], Failure>> {
  let passages = saved
  for (const card of humanWaits(passages, [action])[0]?.cards ?? []) {
    const reply = await place.ports.cards.read({ ...place.access, card })
    if ('failure' in reply) {
      if (reply.failure.kind !== 'unavailable') return reply
      continue
    }
    const chain = chainOf(passages, action)
    if (reply.ok.kind === 'pending' || chain === null) continue
    const next = taken(afterReply(passages, action, chain, card, reply.ok))
    if ('failure' in next) return next
    passages = next.ok
  }
  return succeed(passages)
}
