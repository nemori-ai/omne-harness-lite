import type {
  ActionAdmission,
  AdmissionDecision,
  DecisionCardDraft,
  DenialCategory,
  DurableEvidence,
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
import type { AskedGate, ToolPermissionAction } from './current-tool-permission.ts'
import type { LastingEffect } from './tenant-picks.ts'

type Request = Parameters<ActionAdmission<unknown>['admit']>[0]

// The lasting options are given only while the tenant's own setting of the gate can take them.
function offerOf(lasting: Readonly<Record<LastingEffect, boolean>>): ReleaseOffer {
  return {
    'deny-once': true,
    'allow-once': true,
    'allow-session': true,
    'allow-always': lasting.allow,
    'deny-always': lasting.deny,
  }
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
function draftOf(
  card: ReleaseCard,
  action: Request['action'],
  gate: AskedGate | undefined,
): DecisionCardDraft {
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
      gateTitle: card.gateTitle,
      arguments: card.arguments,
      origin: card.origin,
      ...(gate === undefined ? {} : { gate }),
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
    gateTitle: string
    evidence: DecisionEvidence
    gate?: AskedGate | undefined
    lasting: Readonly<Record<LastingEffect, boolean>>
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
      gateTitle: asking.gateTitle,
      effectiveArguments: asking.effectiveArguments,
      session: asking.session,
      agent: input.execution,
    },
    offerOf(asking.lasting),
  )
  const draft = draftOf(card, input.action, asking.gate)
  return { kind: 'need-decision', card: draft, evidence: asking.evidence }
}

/** What a person's answer does: refuse the action outright, or write what it grants and then judge again. */
export type AnswerEffect =
  | Readonly<{ kind: 'decided'; decision: AdmissionDecision }>
  | Readonly<{ kind: 'grant'; scope: 'once'; card: DurableEvidence; source: DurableEvidence }>
  | Readonly<{
      kind: 'grant'
      scope: 'session'
      gate: AskedGate
      card: DurableEvidence
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'lasting'
      effect: 'allow'
      option: 'allow-always'
      card: DurableEvidence
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'lasting'
      effect: 'deny'
      option: 'deny-always'
      gate: AskedGate
      card: DurableEvidence
      source: DurableEvidence
    }>

export function refusal(
  answered: Readonly<{ card: DurableEvidence; source: DurableEvidence }>,
  category: DenialCategory,
  reason: string,
): AdmissionDecision {
  const facts = { card: answered.card, answer: answered.source, reason }
  return {
    kind: 'deny',
    category,
    reason,
    evidence: decisionEvidence('action-answer', '1', facts),
  }
}

/** The gate a release card was made for, as the card hands it back with a chosen option. */
export function gateOfAnswer(value: JsonValue | null): AskedGate | null {
  if (value?.kind !== 'object') return null
  const text = (key: string) => {
    const found = value.entries.find(entry => entry.key === key)?.value
    return found?.kind === 'string' && found.value.length > 0 ? found.value : null
  }
  const [capabilityId, enforcementKey, basis] = ['capabilityId', 'enforcementKey', 'basis'].map(
    text,
  )
  return capabilityId == null || enforcementKey == null || basis == null
    ? null
    : { capabilityId, enforcementKey, basis }
}

/** An answer that releases nothing refuses the action; the others name what is to be written. */
export function answerEffect(decision: NonNullable<Request['decision']>): AnswerEffect {
  const { card, answer } = decision
  const source = answer.evidence
  const refused = (category: DenialCategory, reason: string): AnswerEffect => ({
    kind: 'decided',
    decision: refusal({ card, source }, category, reason),
  })
  if (answer.kind === 'remark') return refused('guidance', 'human-guidance')
  if (answer.kind === 'declined') return refused('not-released', 'declined')
  const gate = gateOfAnswer(answer.value)
  switch (answer.option) {
    case 'deny-once':
      return refused('not-released', 'deny-once')
    case 'allow-once':
      return { kind: 'grant', scope: 'once', card, source }
    case 'allow-always':
      return { kind: 'lasting', effect: 'allow', option: 'allow-always', card, source }
  }
  if (gate !== null && answer.option === 'allow-session')
    return { kind: 'grant', scope: 'session', gate, card, source }
  if (gate !== null && answer.option === 'deny-always')
    return { kind: 'lasting', effect: 'deny', option: 'deny-always', gate, card, source }
  return {
    kind: 'decided',
    decision: {
      kind: 'undecidable',
      diagnostic: 'the answer chose an option the card did not offer',
    },
  }
}
