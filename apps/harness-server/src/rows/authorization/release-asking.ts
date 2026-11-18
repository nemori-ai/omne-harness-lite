import type {
  ActionAdmission,
  AdmissionDecision,
  DecisionCardDraft,
  DenialCategory,
} from '@omne-harness/agent-contract'
import {
  decisionEvidence,
  releaseCard,
  type DecisionEvidence,
  type ReleaseCard,
  type ReleaseOffer,
} from '@omne-harness/authorization'
import type { JsonValue } from '@omne-harness/json-text'
import type { ToolCallLabeling } from '../../entry/tool-action-resolution.ts'
import type { ToolPermissionAction } from './current-tool-permission.ts'

type Request = Parameters<ActionAdmission<unknown>['admit']>[0]

// The options this deployment gives effect to now; the card shows the others as not offered.
const OFFER: ReleaseOffer = {
  'deny-once': true,
  'allow-once': false,
  'allow-session': false,
  'allow-always': false,
  'deny-always': false,
}
const DESCRIPTION = '下面是 agent 要执行的这一次调用。看过之后选一档，每档下面写着它管多大。'
const DECLINE = '这一次调用不执行。'

function jsonOf(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(jsonOf) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, member]) => ({
      key,
      value: jsonOf(member),
    })),
  }
}

// The detail is the body of a human-intervention release question, filled as that card contract reads.
function draftOf(card: ReleaseCard, action: Request['action']): DecisionCardDraft {
  const [first, ...rest] = card.options
  const option = (entry: typeof first) => ({ id: entry.id, label: entry.label })
  return {
    explanation: card.title,
    options: [option(first), ...rest.map(option)],
    about: { position: 'before_action', action },
    detail: jsonOf({
      kind: 'release',
      title: card.title,
      description: DESCRIPTION,
      declineConsequence: DECLINE,
      target: card.target,
      arguments: card.arguments,
      origin: card.origin,
      options: card.options.map(entry => ({
        id: entry.id,
        label: entry.label,
        description: entry.scope,
        offered: entry.offered,
        lasting: entry.lasting,
      })),
    }),
  }
}

/** The card for an action a person must release; its words come from the action, not the model. */
export async function askedDecision(
  labeling: ToolCallLabeling | undefined,
  asking: Readonly<{
    input: Request
    principal: ToolPermissionAction['principal']
    session: string
    definition: ToolPermissionAction['definition']
    effectiveArguments: string
    evidence: DecisionEvidence
  }>,
): Promise<AdmissionDecision> {
  if (labeling === undefined)
    return { kind: 'unavailable', diagnostic: 'the call labeling dependency is unavailable' }
  const { input } = asking
  const label = await labeling.label({
    principal: asking.principal,
    tenant: input.tenant,
    definition: asking.definition,
    effectiveArguments: asking.effectiveArguments,
  })
  if (label === undefined)
    return { kind: 'unavailable', diagnostic: 'the label of the call could not be read now' }
  const card = releaseCard(
    {
      ...label,
      effectiveArguments: asking.effectiveArguments,
      session: asking.session,
      agent: input.execution,
    },
    OFFER,
  )
  return { kind: 'need-decision', card: draftOf(card, input.action), evidence: asking.evidence }
}

/** A person's answer that releases nothing refuses the action, each kind with its own category. */
export function answeredDecision(decision: NonNullable<Request['decision']>): AdmissionDecision {
  const { card, answer } = decision
  const refused = (category: DenialCategory, reason: string): AdmissionDecision => ({
    kind: 'deny',
    category,
    reason,
    evidence: decisionEvidence('action-answer', '1', { card, answer: answer.evidence, reason }),
  })
  if (answer.kind === 'remark') return refused('guidance', 'human-guidance')
  if (answer.kind === 'declined') return refused('not-released', 'declined')
  if (answer.option === 'deny-once') return refused('not-released', 'deny-once')
  return { kind: 'undecidable', diagnostic: 'the answer chose an option the card did not offer' }
}
