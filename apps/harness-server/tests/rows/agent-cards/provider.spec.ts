import { describe, expect, it } from 'vitest'
import {
  admissionPassageOf,
  cardRequestOf,
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeCardRoundId,
  type Authority,
  type DecisionCardDraft,
} from '@omne-harness/agent-contract'
import { hitlCommandBinding } from '@omne-harness/human-intervention-local'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec } from '@omne-harness/legal-identity'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { cardEvidence, roundKey, roundOperation } from '../../../src/rows/agent-cards/cards.ts'
import { createAgentDecisionCards } from '../../../src/rows/agent-cards/provider.ts'
import type { ToolHitlHost } from '../../../src/rows/tool-hitl/host.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenant = testingTenant(`org_${'1'.repeat(26)}`, `acc_${'2'.repeat(26)}`)
const authority = inProcessPrincipalAuthority()
const unwrap = <T>(value: { ok: T } | { failure: unknown }): T => {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const issue = (component: string, work: Readonly<{ owner: string; work: string }>) =>
  unwrap(
    authority.issuer.issueActingForTenant({
      actor: unwrap(authority.issuer.issueSystem({ component })),
      tenant,
      work,
    }),
  )
const caller = issue(SESSION_WORK_COMPONENT, { owner: 'session', work: 'session-1' })
const registrar = issue('toolDecisions', { owner: 'harness.tool-decisions', work: 'ask' })
const reader = 'principal/1/reader'

const action = unwrap(decodeActionId('step-1/tool/0'))
const passage = unwrap(admissionPassageOf(action))
const round = unwrap(decodeCardRoundId('round-1'))
const execution = unwrap(decodeAgentExecutionId('exec-1'))
const key = roundKey(passage, round)
const evidence = (record: string) => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const advance = {
  execution,
  executionAttachment: 'attachment-1',
  instance: 'instance-1',
  generation: '1',
  source: evidence('advance'),
} as unknown as Authority
const draft: DecisionCardDraft = {
  explanation: 'The agent wants to run `rm notes.txt`.',
  options: [
    { id: 'once', label: 'This time' },
    { id: 'no', label: 'No' },
  ],
  about: { position: 'before_action', action },
}
const requests = [cardRequestOf('one', draft), cardRequestOf('two', draft)]
const access = { principal: caller, tenant }
const present = { ...access, advance, passage, round, original: evidence('input'), requests }
const lookup = { ...access, execution, passage, round, original: evidence('input'), requests }

const encoded = tenantCodec.encode(tenant)
if (!encoded.ok) throw new Error('fixture tenant')
const requestRef = { tenantRef: encoded.value, requestId: 'request-1' }
const cardRefs = [
  { request: requestRef, cardId: 'c1' },
  { request: requestRef, cardId: 'c2' },
]
const operationRef = { tenantRef: encoded.value, actorRef: 'actor', operationId: 'operation' }
const registered = { kind: 'registered', requestRef, revision: '1', cards: cardRefs, operationRef }

type Calls = { name: string; input: unknown }[]

function world(
  options: Readonly<{
    register?: unknown
    prepared?: string
    operation?: unknown
    cards?: readonly unknown[]
    run?: string | null
    audience?: boolean
    consume?: unknown
    invalidated?: unknown
  }> = {},
) {
  const calls: Calls = []
  const on =
    (name: string, answer: (input: never) => unknown) => async (_access: unknown, input: never) => {
      calls.push({ name, input })
      return answer(input)
    }
  const waitRef = { owner: 'agent', waitId: `round/${key}`, incarnation: '1', destination: 'd' }
  const application = {
    registerRequest: on('registerRequest', () => options.register ?? registered),
    getOperation: on('getOperation', () => options.operation ?? { kind: 'unknown', operationRef }),
    getRequest: on('getRequest', () => ({
      kind: 'found',
      request: { ref: requestRef, revision: '2', origin: { wait: waitRef }, cards: options.cards },
    })),
    bindReceiver: on('bindReceiver', () => ({
      kind: 'bound',
      waitRef,
      receiverGeneration: '1',
      operationRef,
    })),
    consumeDecision: on(
      'consumeDecision',
      (input: { decisionRef: unknown }) =>
        options.consume ?? {
          kind: 'accepted',
          operationRef,
          receipt: { decision: input.decisionRef, outcome: 'accepted' },
        },
    ),
    acknowledgeDelivery: on('acknowledgeDelivery', () => ({ kind: 'acknowledged', operationRef })),
    invalidateWait: on(
      'invalidateWait',
      () =>
        options.invalidated ?? { kind: 'invalidated', affected: 2, revision: '3', operationRef },
    ),
  }
  const host = {
    tenant: async () => ({ kind: 'ready', tenant: { domain: {}, application, destination: {} } }),
    prepare: async (_at: unknown, command: unknown) => {
      calls.push({ name: 'prepare', input: command })
      return { kind: options.prepared ?? 'committed' }
    },
  } as unknown as ToolHitlHost
  const cards = createAgentDecisionCards({
    host: () => host,
    audience: () =>
      options.audience === false ? undefined : () => ({ readers: [reader], responders: [reader] }),
    registrar: () => registrar,
    readWork: async () => ({
      ok: {
        run:
          options.run === null
            ? { kind: 'none' }
            : { kind: 'active', run: options.run ?? 'run-1', execution: { execution } },
      } as never,
    }),
  })
  return { cards, calls, names: () => calls.map(call => call.name) }
}

const pendingCard = (cardId: string) => ({
  kind: 'pending',
  ref: { request: requestRef, cardId },
  revision: '1',
  question: {
    kind: 'admission',
    cardId,
    title: 'T',
    description: 'D',
    declineConsequence: 'C',
    options: [{ id: 'once', label: 'Once', description: 'Once' }],
  },
})
const decidedCard = (cardId: string, delivery: unknown = { kind: 'pending' }) => ({
  ...pendingCard(cardId),
  kind: 'decided',
  decision: {
    ref: {
      card: { request: requestRef, cardId },
      decisionId: `decision-${cardId}`,
      submission: operationRef,
    },
    reply: { kind: 'selection', optionId: 'once' },
    basisRef: 'basis',
    commitReceipt: 'receipt',
  },
  delivery,
})

describe('present: one round becomes one HITL request', () => {
  it('prepares and registers the round under identities of the passage and the round, and gives one evidence a card', async () => {
    const w = world()
    expect(await w.cards.present(present)).toEqual({
      ok: cardRefs.map(ref => cardEvidence(ref as never)),
    })
    expect(w.names()).toEqual(['prepare', 'registerRequest'])
    const register = w.calls[1]?.input as Record<string, unknown>
    expect(register).toMatchObject({
      operation: { operationId: roundOperation(key, 'register') },
      preparationRef: roundOperation(key, 'prepare'),
      origin: {
        kind: 'admission',
        originRef: passage,
        positionRef: round,
        wait: { owner: 'agent', waitId: `round/${key}`, incarnation: '1' },
        sessionRef: 'session-1',
        runRef: 'run-1',
      },
      questions: [{ cardId: 'c1' }, { cardId: 'c2' }],
    })
    expect(w.calls[0]?.input).toMatchObject({
      kind: 'prepare',
      preparation: { registration: register, responders: [reader] },
    })
  })

  it.each([
    ['unknown', { kind: 'commit-unknown' }],
    ['conflict', { kind: 'conflict' }],
    ['unavailable', { kind: 'unavailable' }],
  ] as const)('maps a registration that answers %s', async (kind, failure) => {
    const w = world({ register: { kind, reason: 'guard-rejected', operationRef } })
    expect(await w.cards.present(present)).toMatchObject({ failure })
  })

  it('names the registration as the operation of an unknown or refused presentation', async () => {
    const w = world({ register: { kind: 'unknown', operationRef } })
    expect(await w.cards.present(present)).toEqual({
      failure: {
        kind: 'commit-unknown',
        operation: unwrap(decodeAgentOperationId(roundOperation(key, 'register'))),
      },
    })
  })

  it('maps a preparation whose commit is unknown or rolled back, and registers nothing', async () => {
    const unknown = world({ prepared: 'unknown' })
    expect(await unknown.cards.present(present)).toMatchObject({
      failure: { kind: 'commit-unknown' },
    })
    const rolledBack = world({ prepared: 'rolled_back' })
    expect(await rolledBack.cards.present(present)).toMatchObject({ failure: { kind: 'conflict' } })
    expect(unknown.names()).toEqual(['prepare'])
    expect(rolledBack.names()).toEqual(['prepare'])
  })

  it('answers invalid for a round that holds no card draft, before any HITL call', async () => {
    const w = world()
    expect(await w.cards.present({ ...present, requests: [] })).toMatchObject({
      failure: { kind: 'invalid', field: 'requests' },
    })
    expect(w.names()).toEqual([])
  })

  it('denies a caller that is not the work principal of a session', async () => {
    const w = world()
    expect(await w.cards.present({ ...present, principal: registrar })).toMatchObject({
      failure: { kind: 'denied' },
    })
  })

  it('answers invalid when the execution is no run of the session, and unavailable without an audience', async () => {
    expect(await world({ run: null }).cards.present(present)).toMatchObject({
      failure: { kind: 'invalid', field: 'execution' },
    })
    expect(await world({ audience: false }).cards.present(present)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })
})

describe('lookup: the original registration, by its identity and its input', () => {
  it('asks HITL for the operation of the same registration command that present sends', async () => {
    const presented = world()
    await presented.cards.present(present)
    const binding = hitlCommandBinding('registerRequest', presented.calls[1]?.input as never)
    const w = world({
      operation: { kind: 'committed', method: 'registerRequest', result: registered, operationRef },
    })
    expect(await w.cards.lookup(lookup)).toEqual({
      ok: { kind: 'presented', cards: cardRefs.map(ref => cardEvidence(ref as never)) },
    })
    expect(w.calls).toEqual([
      {
        name: 'getOperation',
        input: {
          protocol: 'hitl/1',
          operationRef: binding.operationRef,
          inputDigest: binding.inputDigest,
        },
      },
    ])
  })

  it('answers not-presented with the seal of an operation HITL excluded', async () => {
    const w = world({ operation: { kind: 'not-committed', operationRef, sealReceipt: 'seal-1' } })
    expect(await w.cards.lookup(lookup)).toMatchObject({
      ok: { kind: 'not-presented', exclusion: { record: `hitl-sealed/${key}` } },
    })
  })

  it('answers not-presented when the original registration committed as a refusal', async () => {
    const w = world({
      operation: {
        kind: 'committed',
        method: 'registerRequest',
        result: { kind: 'conflict', reason: 'guard-rejected', operationRef },
        commitReceipt: 'commit-1',
        operationRef,
      },
    })
    expect(await w.cards.lookup(lookup)).toMatchObject({
      ok: { kind: 'not-presented', exclusion: { record: `hitl-refused/${key}` } },
    })
  })

  it('answers unknown while HITL does not know, and unavailable when it cannot be read', async () => {
    expect(await world().cards.lookup(lookup)).toEqual({ ok: { kind: 'unknown' } })
    const w = world({ operation: { kind: 'unavailable', reason: 'application-unavailable' } })
    expect(await w.cards.lookup(lookup)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})

describe('read: the decision of one card', () => {
  const card = cardEvidence(cardRefs[0] as never)

  it('answers pending without taking anything over', async () => {
    const w = world({ cards: [pendingCard('c1'), pendingCard('c2')] })
    expect(await w.cards.read({ ...access, card })).toEqual({ ok: { kind: 'pending' } })
    expect(w.names()).toEqual(['getRequest'])
  })

  it('takes a decided card over under identities of the round and the card, then gives the reply', async () => {
    const w = world({ cards: [decidedCard('c1'), pendingCard('c2')] })
    expect(await w.cards.read({ ...access, card })).toMatchObject({
      ok: { kind: 'chosen', option: 'once', value: null },
    })
    expect(w.names()).toEqual([
      'getRequest',
      'bindReceiver',
      'consumeDecision',
      'acknowledgeDelivery',
    ])
    expect(w.calls[1]?.input).toMatchObject({
      operation: { operationId: roundOperation(key, 'bind') },
      expectedGeneration: '0',
    })
    expect(w.calls[2]?.input).toMatchObject({
      operation: { operationId: roundOperation(key, 'consume/c1') },
      consumeOperationId: roundOperation(key, 'consume/c1'),
      receiverGeneration: '1',
    })
    expect(w.calls[3]?.input).toMatchObject({
      operation: { operationId: roundOperation(key, 'acknowledge/c1') },
    })
  })

  it('reads a card that was taken over before without taking it over again', async () => {
    const w = world({
      cards: [decidedCard('c1', { kind: 'accepted', receiptRef: 'r' }), pendingCard('c2')],
    })
    expect(await w.cards.read({ ...access, card })).toMatchObject({ ok: { kind: 'chosen' } })
    expect(w.names()).toEqual(['getRequest'])
  })

  it('keeps the wait when the take-over is not accepted: the answer is unavailable, not a guess', async () => {
    const w = world({
      cards: [decidedCard('c1'), pendingCard('c2')],
      consume: { kind: 'stale-generation', operationRef },
    })
    expect(await w.cards.read({ ...access, card })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('answers invalid for an evidence that is not a card of this provider', async () => {
    const w = world({ cards: [] })
    expect(await w.cards.read({ ...access, card: evidence('other') })).toMatchObject({
      failure: { kind: 'invalid', field: 'card' },
    })
    expect(w.names()).toEqual([])
  })
})

describe('invalidate: the cards of a round end together', () => {
  const cards = cardRefs.map(ref => cardEvidence(ref as never))
  const operation = unwrap(decodeAgentOperationId('finish-1/invalidate'))
  const input = { ...access, operation, passage, round, cards, reason: evidence('terminal') }
  const invalidatedCard = (cardId: string) => ({
    ...pendingCard(cardId),
    kind: 'invalidated',
    reason: 'origin-terminal',
    terminalEvidenceRef: 'terminal-ref',
  })

  it('invalidates the wait of the round and gives the final state of each card', async () => {
    const w = world({
      cards: [decidedCard('c1', { kind: 'accepted', receiptRef: 'r' }), invalidatedCard('c2')],
    })
    expect(await w.cards.invalidate(input)).toMatchObject({
      ok: [
        { card: cards[0], reply: { kind: 'chosen', option: 'once' } },
        { card: cards[1], reply: { kind: 'invalidated' } },
      ],
    })
    expect(w.names()).toEqual(['invalidateWait', 'getRequest'])
    expect(w.calls[0]?.input).toMatchObject({
      waitRef: { owner: 'agent', waitId: `round/${key}` },
      reason: 'origin-terminal',
    })
  })

  it('gives the same HITL operation for the same Agent operation, and another for another', async () => {
    const first = world({ cards: [invalidatedCard('c1'), invalidatedCard('c2')] })
    const again = world({ cards: [invalidatedCard('c1'), invalidatedCard('c2')] })
    const other = world({ cards: [invalidatedCard('c1'), invalidatedCard('c2')] })
    await first.cards.invalidate(input)
    await again.cards.invalidate(input)
    await other.cards.invalidate({
      ...input,
      operation: unwrap(decodeAgentOperationId('finish-2/invalidate')),
    })
    const idOf = (w: typeof first) => {
      const sent = w.calls[0]?.input as { operation: { operationId: string } } | undefined
      if (sent === undefined) throw new Error('no invalidation was sent')
      return sent.operation.operationId
    }
    expect(idOf(again)).toBe(idOf(first))
    expect(idOf(other)).not.toBe(idOf(first))
  })

  it('maps an unknown invalidation to commit-unknown of the Agent operation', async () => {
    const w = world({ invalidated: { kind: 'unknown', operationRef } })
    expect(await w.cards.invalidate(input)).toEqual({
      failure: { kind: 'commit-unknown', operation },
    })
  })

  it('answers conflict when the cards are not the cards of the round', async () => {
    const w = world({ cards: [invalidatedCard('c1'), invalidatedCard('c2')] })
    expect(await w.cards.invalidate({ ...input, cards: [cards[0] as never] })).toEqual({
      failure: { kind: 'conflict', operation },
    })
  })

  it('answers unavailable while a card of the round still waits after the invalidation', async () => {
    const w = world({ cards: [invalidatedCard('c1'), pendingCard('c2')] })
    expect(await w.cards.invalidate(input)).toMatchObject({ failure: { kind: 'unavailable' } })
  })
})
