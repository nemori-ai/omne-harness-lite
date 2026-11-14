import { empty, type Family, type Rule } from './operation-rules.ts'
import type { HitlOperation, HitlOutcomes } from './hitl-messages.ts'

const text: Rule = { kind: 'text' }
const revision: Rule = { kind: 'revision' }

function literal(...values: string[]): Rule {
  return { kind: 'literal', values }
}

function object(fields: Readonly<Record<string, Rule>>, optional: readonly string[] = []): Rule {
  return {
    kind: 'object',
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, rule]) =>
        optional.includes(key) ? [key, { rule, optional: true }] : [key, { rule }],
      ),
    ),
  }
}

const cardRef = object({
  request: object({ tenantRef: text, requestId: text }),
  cardId: text,
})

const reply: Rule = {
  kind: 'one-of',
  rules: [
    object({ kind: literal('selection'), optionId: text }),
    object({ kind: literal('text'), text }),
    object({ kind: literal('decline') }),
  ],
}

const filter = object(
  {
    states: {
      kind: 'array',
      item: literal('pending', 'decided', 'invalidated'),
      nonempty: true,
      max: 3,
    },
    originKind: literal('tool', 'agent-extension', 'admission', 'independent'),
    sessionRef: { kind: 'session' },
    delivery: literal('pending', 'accepted', 'superseded'),
  },
  ['originKind', 'sessionRef', 'delivery'],
)

const submission = object({
  tenant: { kind: 'tenant' },
  card: cardRef,
  expectedRevision: revision,
  reply,
  replyId: text,
})

const requests: { readonly [O in HitlOperation]: Rule } = {
  'list-cards': object({
    tenant: { kind: 'tenant' },
    filter,
    cursor: { kind: 'one-of', rules: [{ kind: 'null' }, text] },
    limit: { kind: 'page-limit' },
  }),
  'read-card': object({ tenant: { kind: 'tenant' }, card: cardRef }),
  'submit-reply': submission,
  'query-submit-reply': submission,
}

const option = { id: text, label: text, description: text }
const questionFields = { cardId: text, title: text, description: text, declineConsequence: text }
const question: Rule = {
  kind: 'one-of',
  rules: [
    object({
      ...questionFields,
      kind: literal('question', 'extension'),
      options: { kind: 'array', item: object(option) },
    }),
    object({
      ...questionFields,
      kind: literal('approval', 'admission'),
      options: { kind: 'array', item: object({ ...option, effectRef: text }, ['effectRef']) },
    }),
  ],
}
const submissionRef = object({ tenantRef: text, actorRef: text, operationId: text })
const decisionRef = object({ card: cardRef, decisionId: text, submission: submissionRef })
const decision = object({ ref: decisionRef, reply, basisRef: text, commitReceipt: text })
const delivery: Rule = {
  kind: 'one-of',
  rules: [
    object({ kind: literal('pending') }),
    object({ kind: literal('accepted', 'superseded'), receiptRef: text }),
  ],
}
const cardFields = { ref: cardRef, revision, question }
const card: Rule = {
  kind: 'one-of',
  rules: [
    object({ ...cardFields, kind: literal('pending') }),
    object({ ...cardFields, kind: literal('decided'), decision, delivery }),
    object({
      ...cardFields,
      kind: literal('invalidated'),
      reason: literal('cancelled', 'archived', 'origin-terminal', 'continuity-lost'),
      terminalEvidenceRef: text,
    }),
  ],
}
const origin = object(
  {
    kind: literal('tool', 'agent-extension', 'admission', 'independent'),
    sessionRef: text,
    runRef: text,
    toolCallRef: text,
  },
  ['sessionRef', 'runRef', 'toolCallRef'],
)
const item = object({ card, origin, displayContext: text })

const replyResult: Rule = {
  kind: 'one-of',
  rules: [
    object({
      kind: literal('decided'),
      decisionRef,
      revision,
      delivery: literal('pending', 'accepted'),
    }),
    object({ kind: literal('already-decided'), decision }),
    object({ kind: literal('invalidated'), reason: text }),
  ],
}

const successes: { readonly [O in HitlOperation]: Rule } = {
  'list-cards': object({
    items: { kind: 'array', item },
    next: { kind: 'one-of', rules: [{ kind: 'null' }, text] },
    snapshotRef: text,
    completeness: literal('complete', 'partial'),
  }),
  'read-card': object({ item }),
  'submit-reply': replyResult,
  'query-submit-reply': replyResult,
}

const limited = object({ resource: text, limit: { kind: 'positive-integer' } })

const outcomes = {
  'list-cards': ['succeeded', 'denied', 'invalid', 'limited', 'conflict', 'basis-unavailable'],
  'read-card': ['succeeded', 'denied', 'invalid', 'limited', 'basis-unavailable'],
  'submit-reply': [
    'succeeded',
    'denied',
    'invalid',
    'limited',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
  'query-submit-reply': [
    'succeeded',
    'not-committed',
    'denied',
    'invalid',
    'limited',
    'conflict',
    'basis-unavailable',
    'unknown',
  ],
} as const satisfies { readonly [O in HitlOperation]: readonly HitlOutcomes[O][] }

type MissingOutcomes = {
  readonly [O in HitlOperation]: Exclude<HitlOutcomes[O], (typeof outcomes)[O][number]>
}[HitlOperation]
type OutcomesComplete<Missing extends never> = Missing
export type HitlOutcomeTableComplete = OutcomesComplete<MissingOutcomes>

function isHitlOperation(value: unknown): value is HitlOperation {
  return typeof value === 'string' && Object.hasOwn(requests, value)
}

export const hitlFamily: Family<'hitl-public/1', HitlOperation, never> = {
  version: 'hitl-public/1',
  error: 'Invalid hitl codec arguments',
  stages: [],
  declarable: true,
  isProvided: isHitlOperation,
  requestRule: operation => ({ body: requests[operation], proof: true, tenant: false }),
  responseRule: (operation, outcome) => {
    const allowed: readonly string[] = outcomes[operation]
    if (!allowed.includes(outcome)) return undefined
    if (outcome === 'succeeded') return successes[operation]
    return outcome === 'limited' ? limited : empty
  },
}
