// Identities that must agree, the exact answer of every reply decision, and the closed value sets
// of hitl/1. Each row changes one identity or one value.
import { describe, expect, it } from 'vitest'
import {
  AcknowledgeDeliverySchema,
  CardSchema,
  GetCardSchema,
  GetRequestSchema,
  HITL_COMMAND_MAX_BYTES,
  InvalidateWaitSchema,
  ListDeliveriesSchema,
  ListPoolSchema,
  OriginSchema,
  QuestionSchema,
  RegisterRequestSchema,
  SubmitReplySchema,
  decideReply,
  decodeHitlCommand,
  decodeRecoveryCommand,
  sameCard,
  type CardRef,
} from '../src/index.ts'

const cardRef = { request: { tenantRef: 'tenant-a', requestId: 'request-a' }, cardId: 'card-a' }
const operation = { tenantRef: 'tenant-a', actorRef: 'human-a', operationId: 'answer-a' }
const wait = { owner: 'app', waitId: 'wait-a', incarnation: 'logical-1', destination: 'inbox-a' }
const options = [
  { id: 'next', label: '继续', description: '继续原工作。' },
  { id: 'other', label: '换一条路', description: '改走另一条路。' },
]
const question = {
  cardId: 'card-a',
  kind: 'question',
  title: '怎么继续？',
  description: '请选择或直接说明。',
  options,
  declineConsequence: '跳过此题，不作答。',
}
const pendingCard = { kind: 'pending', ref: cardRef, revision: '0', question }
const decision = {
  ref: { card: cardRef, decisionId: 'decision-a', submission: operation },
  reply: { kind: 'decline' },
  basisRef: 'basis-a',
  commitReceipt: 'receipt-a',
}
const decidedCard = {
  ...pendingCard,
  kind: 'decided',
  revision: '1',
  decision,
  delivery: { kind: 'pending' },
}
const command = (change: Record<string, unknown> = {}) =>
  SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation,
    cardRef,
    expectedRevision: '0',
    reply: { kind: 'text', text: '原话' },
    ...change,
  })
const messagesOf = (result: {
  success: boolean
  error?: { issues: readonly { message: string }[] }
}) => result.error?.issues.map(issue => issue.message)

describe('two card references name the same card', () => {
  const other = (change: (ref: typeof cardRef) => unknown) => change(cardRef) as CardRef
  it.each([
    ['the same three identities', other(ref => ({ ...ref, request: { ...ref.request } })), true],
    [
      'another tenant',
      other(ref => ({ ...ref, request: { ...ref.request, tenantRef: 'tenant-b' } })),
      false,
    ],
    [
      'another request',
      other(ref => ({ ...ref, request: { ...ref.request, requestId: 'request-b' } })),
      false,
    ],
    ['another card', other(ref => ({ ...ref, cardId: 'card-b' })), false],
  ])('%s', (_name, right, expected) => {
    expect(sameCard(cardRef as CardRef, right)).toBe(expected)
    expect(sameCard(right, cardRef as CardRef)).toBe(expected)
  })
})

describe('the exact answer of a reply decision', () => {
  const card = CardSchema.parse(pendingCard)
  it.each([
    [
      'a command of another tenant',
      command({ operation: { ...operation, tenantRef: 'tenant-b' } }),
      'live',
      { kind: 'denied', reason: 'tenant-mismatch' },
    ],
    [
      'a card reference of another tenant',
      command({ cardRef: { ...cardRef, request: { ...cardRef.request, tenantRef: 'tenant-b' } } }),
      'live',
      { kind: 'conflict', reason: 'card-mismatch' },
    ],
    [
      'a card reference of another request',
      command({ cardRef: { ...cardRef, request: { ...cardRef.request, requestId: 'request-b' } } }),
      'live',
      { kind: 'conflict', reason: 'card-mismatch' },
    ],
    [
      'a card reference of another card',
      command({ cardRef: { ...cardRef, cardId: 'card-b' } }),
      'live',
      { kind: 'conflict', reason: 'card-mismatch' },
    ],
    [
      'a wait that cannot be checked',
      command(),
      'unavailable',
      { kind: 'unavailable', reason: 'wait-unavailable' },
    ],
    [
      'a wait that ended',
      command(),
      'terminal',
      { kind: 'invalidated', reason: 'origin-terminal' },
    ],
    [
      'a stale revision',
      command({ expectedRevision: '1' }),
      'live',
      { kind: 'conflict', reason: 'revision-changed' },
    ],
    [
      'an option the card does not offer',
      command({ reply: { kind: 'selection', optionId: 'invented' } }),
      'live',
      { kind: 'invalid-input', reason: 'unknown-option' },
    ],
  ] as const)('%s', (_name, submitted, waitState, expected) => {
    expect(decideReply({ card, command: submitted, wait: waitState })).toEqual(expected)
  })

  it.each(['next', 'other'])('accepts the offered option %s', optionId => {
    const reply = { kind: 'selection', optionId }
    expect(decideReply({ card, command: command({ reply }), wait: 'live' })).toEqual({
      kind: 'ready',
      cardRef: card.ref,
      expectedRevision: '0',
      nextRevision: '1',
      reply,
    })
  })
})

describe('a card agrees with its question and its decision', () => {
  const disagreement = ['Card, question, decision and tenant identities must agree']
  it('accepts a decided card whose identities agree, in every delivery state', () => {
    for (const delivery of [
      { kind: 'pending' },
      { kind: 'accepted', receiptRef: 'receipt-b' },
      { kind: 'superseded', receiptRef: 'receipt-b' },
    ])
      expect(CardSchema.parse({ ...decidedCard, delivery })).toEqual({ ...decidedCard, delivery })
    expect(CardSchema.safeParse({ ...decidedCard, delivery: { kind: 'lost' } }).success).toBe(false)
  })
  it.each([
    ['a question of another card', { ...pendingCard, question: { ...question, cardId: 'card-b' } }],
    [
      'a decision on another card',
      {
        ...decidedCard,
        decision: { ...decision, ref: { ...decision.ref, card: { ...cardRef, cardId: 'card-b' } } },
      },
    ],
    [
      'a decision on a card of another request',
      {
        ...decidedCard,
        decision: {
          ...decision,
          ref: {
            ...decision.ref,
            card: { ...cardRef, request: { ...cardRef.request, requestId: 'request-b' } },
          },
        },
      },
    ],
    [
      'a decision submitted in another tenant',
      {
        ...decidedCard,
        decision: {
          ...decision,
          ref: { ...decision.ref, submission: { ...operation, tenantRef: 'tenant-b' } },
        },
      },
    ],
  ])('refuses %s', (_name, card) => {
    expect(messagesOf(CardSchema.safeParse(card))).toEqual(disagreement)
  })
  it.each(['cancelled', 'archived', 'origin-terminal', 'continuity-lost'])(
    'keeps the invalidation reason %s',
    reason => {
      const card = { ...pendingCard, kind: 'invalidated', reason, terminalEvidenceRef: 'end-a' }
      expect(CardSchema.parse(card)).toEqual(card)
      expect(
        InvalidateWaitSchema.parse({
          protocol: 'hitl/1',
          operation,
          waitRef: wait,
          terminalEvidenceRef: 'end-a',
          reason,
        }),
      ).toMatchObject({ waitRef: wait, reason })
    },
  )
  it('refuses a reason outside the set', () => {
    const card = {
      ...pendingCard,
      kind: 'invalidated',
      reason: 'expired',
      terminalEvidenceRef: 'e',
    }
    expect(CardSchema.safeParse(card).success).toBe(false)
  })
})

describe('requests, questions and origins', () => {
  const origin = {
    kind: 'independent',
    originRef: 'origin-a',
    wait,
    positionRef: 'step-a',
    adoptionRef: 'implementation-a',
  }
  const request = {
    protocol: 'hitl/1',
    operation,
    origin,
    questions: [question, { ...question, cardId: 'card-b' }],
    displayContext: '两张卡片',
    preparationRef: 'prepared-a',
  }
  it('accepts several cards with distinct identities and an action basis', () => {
    const actionBasis = {
      operation,
      targetRef: 'target-a',
      effectiveArgumentsDigest: 'digest-a',
      implementationRef: 'implementation-a',
      authorizationBasisRef: 'authorization-a',
    }
    expect(RegisterRequestSchema.parse({ ...request, actionBasis })).toEqual({
      ...request,
      actionBasis,
    })
  })
  it('names the rule a duplicate card or option breaks', () => {
    expect(
      messagesOf(RegisterRequestSchema.safeParse({ ...request, questions: [question, question] })),
    ).toEqual(['Card identities must be unique within a request'])
    expect(
      messagesOf(QuestionSchema.safeParse({ ...question, options: [options[0], options[0]] })),
    ).toEqual(['Option identities must be unique within a card'])
    expect(messagesOf(OriginSchema.safeParse({ ...origin, runRef: 'run-a' }))).toEqual([
      'A run reference requires its session reference',
    ])
  })
  it.each(['agent-extension', 'admission', 'independent'])('accepts the origin kind %s', kind => {
    expect(OriginSchema.parse({ ...origin, kind })).toEqual({ ...origin, kind })
  })
  it('accepts a command of exactly the byte budget and limits one byte more', () => {
    const json = JSON.stringify(command({ reply: { kind: 'text', text: 'ascii only' } }))
    const exact = json + ' '.repeat(HITL_COMMAND_MAX_BYTES - json.length)
    expect(decodeHitlCommand('submitReply', exact)).toMatchObject({ kind: 'decoded' })
    expect(decodeHitlCommand('submitReply', `${exact} `)).toEqual({
      kind: 'limited',
      resource: 'command-bytes',
      limit: HITL_COMMAND_MAX_BYTES,
    })
  })
})

describe('reads and delivery', () => {
  const pool = { protocol: 'hitl/1', tenantRef: 'tenant-a', locationRef: 'local', limit: 20 }
  it('keeps the references of a request read and a card read', () => {
    const requestRead = { protocol: 'hitl/1', requestRef: cardRef.request }
    const cardRead = { protocol: 'hitl/1', cardRef }
    expect(GetRequestSchema.parse(requestRead)).toEqual(requestRead)
    expect(GetCardSchema.parse(cardRead)).toEqual(cardRead)
  })
  it('accepts every state, origin kind and delivery state of the pool filter', () => {
    const states = ['pending', 'decided', 'invalidated']
    expect(ListPoolSchema.parse({ ...pool, filter: { states } }).filter).toEqual({ states })
    expect(
      ListPoolSchema.safeParse({ ...pool, filter: { states: [...states, 'pending'] } }).success,
    ).toBe(false)
    expect(ListPoolSchema.safeParse({ ...pool, filter: { states: ['open'] } }).success).toBe(false)
    for (const originKind of ['tool', 'agent-extension', 'admission', 'independent']) {
      const filter = { states: ['pending'], originKind, sessionRef: 'session-a' }
      expect(ListPoolSchema.parse({ ...pool, filter }).filter).toEqual(filter)
    }
    for (const delivery of ['pending', 'accepted', 'superseded']) {
      const filter = { states: ['decided'], delivery }
      expect(ListPoolSchema.parse({ ...pool, filter }).filter).toEqual(filter)
    }
    expect(
      ListPoolSchema.safeParse({ ...pool, filter: { states: ['decided'], delivery: 'lost' } })
        .success,
    ).toBe(false)
  })
  it('keeps the destination and the position of a delivery listing', () => {
    const listing = { protocol: 'hitl/1', destination: 'inbox-a', after: 'position-a', limit: 100 }
    expect(ListDeliveriesSchema.parse(listing)).toEqual(listing)
    expect(ListDeliveriesSchema.safeParse({ ...listing, limit: 101 }).success).toBe(false)
  })
  it.each(['accepted', 'superseded'])('keeps a consumer receipt with the outcome %s', outcome => {
    const acknowledgement = {
      protocol: 'hitl/1',
      operation,
      consumerReceipt: {
        decision: decision.ref,
        wait,
        consumeOperationId: 'consume-a',
        receiverGeneration: '2',
        outcome,
        evidenceRef: 'evidence-a',
      },
    }
    expect(AcknowledgeDeliverySchema.parse(acknowledgement)).toEqual(acknowledgement)
  })
  it('refuses a consumer receipt with another outcome', () => {
    expect(
      AcknowledgeDeliverySchema.safeParse({
        protocol: 'hitl/1',
        operation,
        consumerReceipt: {
          decision: decision.ref,
          wait,
          consumeOperationId: 'consume-a',
          receiverGeneration: '2',
          outcome: 'lost',
          evidenceRef: 'evidence-a',
        },
      }).success,
    ).toBe(false)
  })
  it.each([
    [
      'the decision is on a card of another tenant',
      {
        ...decision.ref,
        card: { ...cardRef, request: { ...cardRef.request, tenantRef: 'tenant-b' } },
      },
    ],
    [
      'the decision was submitted in another tenant',
      { ...decision.ref, submission: { ...operation, tenantRef: 'tenant-b' } },
    ],
  ])('refuses a consumption when %s', (_name, decisionRef) => {
    const consume = {
      protocol: 'hitl/1',
      operation: { ...operation, operationId: 'consume-a' },
      waitRef: wait,
      receiverGeneration: '2',
      decisionRef,
      consumeOperationId: 'consume-a',
    }
    expect(decodeRecoveryCommand('consumeDecision', JSON.stringify(consume))).toEqual({
      kind: 'invalid-input',
      reason: 'shape',
    })
  })
})
