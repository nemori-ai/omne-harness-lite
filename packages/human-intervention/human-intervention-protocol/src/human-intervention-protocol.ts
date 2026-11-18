import { defineProtocol, ruleCodec, type Rule, type RuleValue } from '@omne-harness/public-contract'

type Fields = Readonly<Record<string, { readonly rule: Rule; readonly optional?: true }>>

const text = { kind: 'text' } as const
const tenant = { kind: 'tenant' } as const
const session = { kind: 'session' } as const
const revision = { kind: 'revision' } as const
const nothing = { kind: 'null' } as const

const object = <const F extends Fields>(fields: F) => ({ kind: 'object', fields }) as const
const literal = <const V extends readonly string[]>(...values: V) =>
  ({ kind: 'literal', values }) as const
const nullable = <const R extends Rule>(rule: R) =>
  ({ kind: 'one-of', rules: [rule, nothing] }) as const

const empty = ruleCodec(object({}))
const limited = ruleCodec(
  object({ resource: { rule: text }, limit: { rule: { kind: 'positive-integer' } } }),
)

const cardRef = object({
  request: { rule: object({ tenantRef: { rule: text }, requestId: { rule: text } }) },
  cardId: { rule: text },
})

const reply = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('selection') }, optionId: { rule: text } }),
    object({ kind: { rule: literal('text') }, text: { rule: text } }),
    object({ kind: { rule: literal('decline') } }),
  ],
} as const

const originKinds = literal('tool', 'agent-extension', 'admission', 'independent')

const filter = object({
  states: {
    rule: {
      kind: 'array',
      item: literal('pending', 'decided', 'invalidated'),
      nonempty: true,
      max: 3,
    },
  },
  originKind: { rule: originKinds, optional: true },
  sessionRef: { rule: session, optional: true },
  delivery: { rule: literal('pending', 'accepted', 'superseded'), optional: true },
})

const listCards = object({
  tenant: { rule: tenant },
  filter: { rule: filter },
  cursor: { rule: nullable(text) },
  limit: { rule: { kind: 'page-limit' } },
})

const readCard = object({ tenant: { rule: tenant }, card: { rule: cardRef } })

const submission = object({
  tenant: { rule: tenant },
  card: { rule: cardRef },
  expectedRevision: { rule: revision },
  reply: { rule: reply },
  replyId: { rule: text },
})

const option = {
  id: { rule: text },
  label: { rule: text },
  description: { rule: text },
} as const
const questionFields = {
  cardId: { rule: text },
  title: { rule: text },
  description: { rule: text },
  declineConsequence: { rule: text },
} as const
const question = {
  kind: 'one-of',
  rules: [
    object({
      ...questionFields,
      kind: { rule: literal('question', 'extension') },
      options: { rule: { kind: 'array', item: object(option) } },
    }),
    object({
      ...questionFields,
      kind: { rule: literal('approval', 'admission') },
      options: {
        rule: {
          kind: 'array',
          item: object({ ...option, effectRef: { rule: text, optional: true } }),
        },
      },
    }),
    object({
      ...questionFields,
      kind: { rule: literal('release') },
      target: {
        rule: object({
          tool: { rule: text },
          command: { rule: nullable(text) },
          preview: { rule: { kind: 'string' } },
        }),
      },
      arguments: {
        rule: object({
          text: { rule: text },
          truncated: { rule: { kind: 'boolean' } },
          digest: { rule: text },
        }),
      },
      origin: { rule: object({ session: { rule: text }, agent: { rule: text } }) },
      gate: {
        rule: object({
          capabilityId: { rule: text },
          enforcementKey: { rule: text },
          basis: { rule: text },
        }),
        optional: true,
      },
      options: {
        rule: {
          kind: 'array',
          item: object({
            ...option,
            offered: { rule: { kind: 'boolean' } },
            lasting: { rule: { kind: 'boolean' } },
          }),
        },
      },
    }),
  ],
} as const

const submissionRef = object({
  tenantRef: { rule: text },
  actorRef: { rule: text },
  operationId: { rule: text },
})
const decisionRef = object({
  card: { rule: cardRef },
  decisionId: { rule: text },
  submission: { rule: submissionRef },
})
const decision = object({
  ref: { rule: decisionRef },
  reply: { rule: reply },
  basisRef: { rule: text },
  commitReceipt: { rule: text },
})
const delivery = {
  kind: 'one-of',
  rules: [
    object({ kind: { rule: literal('pending') } }),
    object({ kind: { rule: literal('accepted', 'superseded') }, receiptRef: { rule: text } }),
  ],
} as const

const cardFields = {
  ref: { rule: cardRef },
  revision: { rule: revision },
  question: { rule: question },
} as const
const card = {
  kind: 'one-of',
  rules: [
    object({ ...cardFields, kind: { rule: literal('pending') } }),
    object({
      ...cardFields,
      kind: { rule: literal('decided') },
      decision: { rule: decision },
      delivery: { rule: delivery },
    }),
    object({
      ...cardFields,
      kind: { rule: literal('invalidated') },
      reason: { rule: literal('cancelled', 'archived', 'origin-terminal', 'continuity-lost') },
      terminalEvidenceRef: { rule: text },
    }),
  ],
} as const

const origin = object({
  kind: { rule: originKinds },
  sessionRef: { rule: text, optional: true },
  runRef: { rule: text, optional: true },
  toolCallRef: { rule: text, optional: true },
})
const item = object({
  card: { rule: card },
  origin: { rule: origin },
  displayContext: { rule: text },
})

const cardPage = object({
  items: { rule: { kind: 'array', item } },
  next: { rule: nullable(text) },
  snapshotRef: { rule: text },
  completeness: { rule: literal('complete', 'partial') },
})

const replyResult = {
  kind: 'one-of',
  rules: [
    object({
      kind: { rule: literal('decided') },
      decisionRef: { rule: decisionRef },
      revision: { rule: revision },
      delivery: { rule: literal('pending', 'accepted') },
    }),
    object({ kind: { rule: literal('already-decided') }, decision: { rule: decision } }),
    object({ kind: { rule: literal('invalidated') }, reason: { rule: text } }),
  ],
} as const

const observeCardsOpen = object({ tenant: { rule: tenant } })
const observeCardsFrame = object({ kind: { rule: literal('changed') } })

export const humanInterventionProtocol = defineProtocol({
  name: 'human-intervention',
  major: 1,
  operations: {
    'list-cards': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(listCards),
      outcomes: {
        succeeded: ruleCodec(cardPage),
        invalid: empty,
        limited,
        conflict: empty,
      },
    },
    'read-card': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(readCard),
      outcomes: {
        succeeded: ruleCodec(object({ item: { rule: item } })),
        invalid: empty,
        limited,
      },
    },
    'submit-reply': {
      identity: 'login',
      effect: 'commit',
      limit: 'small',
      body: ruleCodec(submission),
      outcomes: {
        succeeded: ruleCodec(replyResult),
        invalid: empty,
        limited,
        conflict: empty,
      },
    },
    'query-submit-reply': {
      identity: 'login',
      effect: 'read',
      limit: 'small',
      body: ruleCodec(submission),
      outcomes: {
        succeeded: ruleCodec(replyResult),
        'not-committed': empty,
        invalid: empty,
        limited,
        conflict: empty,
        unknown: true,
      },
    },
  },
  observations: {
    'observe-cards': {
      identity: 'login',
      open: ruleCodec(observeCardsOpen),
      frame: ruleCodec(observeCardsFrame),
      ends: [],
    },
  },
})

export type HumanInterventionProtocol = typeof humanInterventionProtocol
export type HumanInterventionCardPage = RuleValue<typeof cardPage>
export type HumanInterventionCardItem = RuleValue<typeof item>
export type HumanInterventionReplyResult = RuleValue<typeof replyResult>
