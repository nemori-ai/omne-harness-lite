import { describe, expect, it } from 'vitest'
import {
  admissionPassageOf,
  cardRequestOf,
  decodeActionId,
  decodeAgentExecutionId,
  decodeCardRoundId,
  decodePassageId,
  type DecisionCardDraft,
} from '@omne-harness/agent-contract'
import { decisionEvidence } from '@omne-harness/authorization'
import { CardSchema, RegisterRequestSchema, type Card } from '@omne-harness/human-intervention'
import { askedDecision } from '../../../src/rows/authorization/release-asking.ts'
import {
  AGENT_CARDS_OWNER,
  cardEvidence,
  cardRefOf,
  replyOf,
  roundCards,
  roundKey,
  roundOperation,
  roundWait,
} from '../../../src/rows/agent-cards/cards.ts'

const minted = <T>(decoded: { ok: T } | { failure: unknown }): T => {
  if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
  return decoded.ok
}
const action = minted(decodeActionId('step-1/tool/0'))
const admission = minted(admissionPassageOf(action))
const round = minted(decodeCardRoundId('round-1'))
const execution = minted(decodeAgentExecutionId('run-1/execution'))
const draft: DecisionCardDraft = {
  explanation: 'The agent wants to run `rm notes.txt`. It deletes the file for good.',
  options: [
    { id: 'once', label: 'This time', effect: { kind: 'string', value: 'once' } },
    { id: 'no', label: 'No' },
  ],
  about: { position: 'before_action', action },
}

describe('the keys of one round of cards', () => {
  it('derives one key from the execution, the passage and the round, short enough for a HITL identifier', () => {
    const key = roundKey(execution, admission, round)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(roundKey(execution, admission, round)).toBe(key)
    expect(roundKey(execution, admission, minted(decodeCardRoundId('round-2')))).not.toBe(key)
    expect(roundKey(execution, minted(decodePassageId('other')), round)).not.toBe(key)
    // Another execution repeats the same passage and round identities; its round is another round.
    const other = minted(decodeAgentExecutionId('run-2/execution'))
    expect(roundKey(other, admission, round)).not.toBe(key)
    const long = minted(decodePassageId('p'.repeat(256)))
    expect(roundOperation(roundKey(execution, long, round), 'register').length).toBeLessThanOrEqual(
      256,
    )
  })

  it('names the wait and each operation of the round from the key', () => {
    expect(roundWait('k', 'harness.hitl')).toEqual({
      owner: 'agent',
      waitId: 'round/k',
      incarnation: '1',
      destination: 'harness.hitl',
    })
    expect(roundOperation('k', 'register')).toBe('agent-cards/k/register')
  })
})

describe('a round of card requests as HITL questions', () => {
  const registration = (cards: Extract<ReturnType<typeof roundCards>, { ok: unknown }>['ok']) =>
    RegisterRequestSchema.safeParse({
      protocol: 'hitl/1',
      operation: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
      preparationRef: 'p',
      origin: {
        kind: cards.kind,
        originRef: 'origin',
        wait: roundWait('k', 'harness.hitl'),
        positionRef: 'position',
        adoptionRef: 'adoption',
        sessionRef: 's',
        runRef: 'r',
      },
      questions: cards.questions,
      displayContext: 'Agent',
    })

  it('turns the draft of an admission chain into an admission card that HITL accepts', () => {
    const cards = roundCards(admission, [cardRequestOf('one', draft)])
    if ('failure' in cards) throw new Error(cards.failure)
    expect(cards.ok.kind).toBe('admission')
    expect(cards.ok.questions).toEqual([
      {
        kind: 'admission',
        cardId: 'c1',
        title: 'The agent wants to run `rm notes.txt`.',
        description: draft.explanation,
        declineConsequence: 'The action is not admitted this time.',
        options: [
          { id: 'once', label: 'This time', description: 'This time' },
          { id: 'no', label: 'No', description: 'No' },
        ],
      },
    ])
    expect(registration(cards.ok).success).toBe(true)
  })

  describe('the release card the admission issues', async () => {
    const asked = await askedDecision(
      { label: async () => ({ tool: 'Shell', command: 'run', preview: 'ls' }) },
      {
        input: { tenant: 't', execution: 'exe-1', action } as never,
        principal: 'p' as never,
        session: 'ses-1',
        definition: { owner: 'tool', name: 'Shell', revision: '1', digest: 'd' },
        effectiveArguments: '{"command":"run","params":{"cmd":"ls"}}',
        lasting: { allow: false, deny: false },
        evidence: decisionEvidence('cards-test', '1', {}),
      },
    )
    if (asked.kind !== 'need-decision') throw new Error(asked.kind)
    const released = asked.card

    it('registers on an admission chain as a release card, with the body as the issuer filled it', () => {
      const cards = roundCards(admission, [cardRequestOf('one', released)])
      if ('failure' in cards) throw new Error(cards.failure)
      expect(cards.ok.kind).toBe('admission')
      expect(cards.ok.questions[0]).toMatchObject({
        kind: 'release',
        cardId: 'c1',
        title: '要执行 Shell run，放行吗？',
        target: { tool: 'Shell', command: 'run', preview: 'ls' },
      })
      expect(registration(cards.ok).success).toBe(true)
    })

    it('never becomes a release card on any other chain', () => {
      const cards = roundCards(minted(decodePassageId('step-1/before_model/0')), [
        cardRequestOf('one', released),
      ])
      if ('failure' in cards) throw new Error(cards.failure)
      expect(cards.ok.questions[0]).toMatchObject({ kind: 'extension' })
    })

    it('a release body out of shape is refused before it is registered', () => {
      const broken = { ...released, detail: { kind: 'object' as const, entries: [] } }
      const kindOnly = {
        ...released,
        detail: {
          kind: 'object' as const,
          entries: [{ key: 'kind', value: { kind: 'string' as const, value: 'release' } }],
        },
      }
      const other = {
        ...released,
        detail: {
          kind: 'object' as const,
          entries: [{ key: 'kind', value: { kind: 'string' as const, value: 'survey' } }],
        },
      }
      const unknown = roundCards(admission, [cardRequestOf('one', other)])
      if ('failure' in unknown) throw new Error('no round')
      expect(unknown.ok.questions[0]).toMatchObject({ kind: 'admission' })
      const plain = roundCards(admission, [cardRequestOf('one', broken)])
      const shapeless = roundCards(admission, [cardRequestOf('one', kindOnly)])
      if ('failure' in plain || 'failure' in shapeless) throw new Error('no round')
      expect(plain.ok.questions[0]).toMatchObject({ kind: 'admission' })
      expect(registration(shapeless.ok).success).toBe(false)
    })
  })

  it('numbers the cards of a round in the order of the requests', () => {
    const cards = roundCards(admission, [cardRequestOf('one', draft), cardRequestOf('two', draft)])
    if ('failure' in cards) throw new Error(cards.failure)
    expect(cards.ok.questions.map(question => question.cardId)).toEqual(['c1', 'c2'])
  })

  it('registers any other passage, or a draft about no action, as an agent-extension card', () => {
    const other = roundCards(minted(decodePassageId('step-1/before_model/0')), [
      cardRequestOf('one', draft),
    ])
    const noAction = roundCards(admission, [
      cardRequestOf('one', { ...draft, about: { position: 'before_action' } }),
    ])
    for (const cards of [other, noAction]) {
      if ('failure' in cards) throw new Error(cards.failure)
      expect(cards.ok.kind).toBe('agent-extension')
      expect(cards.ok.questions[0]).toMatchObject({
        kind: 'extension',
        declineConsequence: 'The extension gets no answer.',
      })
      expect(registration(cards.ok).success).toBe(true)
    }
  })

  it('cuts the title at the limit of a HITL title when the first sentence is longer', () => {
    const cards = roundCards(admission, [
      cardRequestOf('one', { ...draft, explanation: 'x'.repeat(300) }),
    ])
    if ('failure' in cards) throw new Error(cards.failure)
    expect(cards.ok.questions[0]?.title).toBe('x'.repeat(256))
    expect(registration(cards.ok).success).toBe(true)
  })

  it('refuses a round with no request, a request that carries no draft and an empty explanation', () => {
    expect(roundCards(admission, [])).toEqual({ failure: 'the round has no card request' })
    expect(
      roundCards(admission, [
        { ...cardRequestOf('one', draft), value: { kind: 'string', value: 'not a draft' } },
      ]),
    ).toEqual({ failure: 'the request one carries no card draft' })
    expect(roundCards(admission, [cardRequestOf('one', { ...draft, explanation: '' })])).toEqual({
      failure: 'the draft of the request one has no explanation',
    })
  })
})

describe('the evidence of one card', () => {
  const ref = { request: { tenantRef: 'tenant-1', requestId: 'req/1' }, cardId: 'c2' } as const

  it('names the card without the revision of its request, and gives the card back', () => {
    const evidence = cardEvidence(ref as never)
    expect(evidence).toMatchObject({
      owner: AGENT_CARDS_OWNER,
      record: 'hitl-card/req/1/c2',
      revision: '1',
    })
    expect(cardEvidence(ref as never)).toEqual(evidence)
    expect(cardRefOf(evidence, 'tenant-1')).toEqual(ref)
  })

  it('gives no card for the evidence of another owner, another tenant or a changed record', () => {
    const evidence = cardEvidence(ref as never)
    expect(cardRefOf({ ...evidence, owner: 'other' }, 'tenant-1')).toBeNull()
    expect(cardRefOf(evidence, 'tenant-2')).toBeNull()
    expect(cardRefOf({ ...evidence, record: 'hitl-card/req/1/c3' }, 'tenant-1')).toBeNull()
    expect(cardRefOf({ ...evidence, record: 'hitl-card/c2' }, 'tenant-1')).toBeNull()
  })
})

describe('the state of a card as the reply of the port', () => {
  const cardRef = { request: { tenantRef: 't', requestId: 'r' }, cardId: 'c1' }
  const question = {
    kind: 'admission',
    cardId: 'c1',
    title: 'T',
    description: 'D',
    declineConsequence: 'C',
    options: [{ id: 'once', label: 'Once', description: 'Once' }],
  }
  const decided = (reply: unknown): Card =>
    CardSchema.parse({
      kind: 'decided',
      ref: cardRef,
      revision: '2',
      question,
      decision: {
        ref: {
          card: cardRef,
          decisionId: 'd1',
          submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
        },
        reply,
        basisRef: 'basis',
        commitReceipt: 'receipt',
      },
      delivery: { kind: 'pending' },
    })

  it('is pending while nobody answered', () => {
    const pending = CardSchema.parse({ kind: 'pending', ref: cardRef, revision: '1', question })
    expect(replyOf(pending)).toEqual({ kind: 'pending' })
  })

  it('gives the chosen option without a value: the effect of the option stays with the Agent', () => {
    expect(replyOf(decided({ kind: 'selection', optionId: 'once' }))).toMatchObject({
      kind: 'chosen',
      option: 'once',
      value: null,
      evidence: { owner: AGENT_CARDS_OWNER, record: 'hitl-decision/d1' },
    })
  })

  it('hands the gate of a release card back with the chosen option, as the card holds it', () => {
    const gate = { capabilityId: 'tool/Shell', enforcementKey: 'tool.invoke', basis: 'r7' }
    const release = {
      kind: 'release',
      cardId: 'c1',
      title: 'T',
      description: 'D',
      declineConsequence: 'C',
      target: { tool: 'Shell', command: 'execute', preview: 'ls' },
      arguments: { text: '{}', truncated: false, digest: 'd' },
      origin: { session: 's', agent: 'e' },
      gate,
      options: [
        { id: 'allow-session', label: 'L', description: 'S', offered: true, lasting: true },
      ],
    }
    const card = CardSchema.parse({
      kind: 'decided',
      ref: cardRef,
      revision: '2',
      question: release,
      decision: {
        ref: {
          card: cardRef,
          decisionId: 'd1',
          submission: { tenantRef: 't', actorRef: 'a', operationId: 'o' },
        },
        reply: { kind: 'selection', optionId: 'allow-session' },
        basisRef: 'basis',
        commitReceipt: 'receipt',
      },
      delivery: { kind: 'pending' },
    })
    expect(replyOf(card)).toMatchObject({
      kind: 'chosen',
      option: 'allow-session',
      value: {
        kind: 'object',
        entries: Object.entries(gate).map(([key, value]) => ({
          key,
          value: { kind: 'string', value },
        })),
      },
    })
  })

  it('gives own words as a remark and a skip as declined', () => {
    expect(replyOf(decided({ kind: 'text', text: 'not now' }))).toMatchObject({
      kind: 'remark',
      text: 'not now',
      evidence: { record: 'hitl-decision/d1' },
    })
    expect(replyOf(decided({ kind: 'decline' }))).toMatchObject({
      kind: 'declined',
      evidence: { record: 'hitl-decision/d1' },
    })
  })

  it('gives an invalidated card as invalidated, with the evidence of its end', () => {
    const invalidated = CardSchema.parse({
      kind: 'invalidated',
      ref: cardRef,
      revision: '3',
      question,
      reason: 'cancelled',
      terminalEvidenceRef: 'terminal-1',
    })
    expect(replyOf(invalidated)).toMatchObject({
      kind: 'invalidated',
      evidence: { owner: AGENT_CARDS_OWNER, record: 'hitl-invalidated/terminal-1', revision: '3' },
    })
  })
})
