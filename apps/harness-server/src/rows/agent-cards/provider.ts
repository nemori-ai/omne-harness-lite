import { createHash } from 'node:crypto'
import {
  decodeAgentOperationId,
  type Access,
  type AgentExecutionId,
  type AgentOperationId,
  type CardRequest,
  type CardRoundId,
  type DecisionCards,
  type DurableEvidence,
  type Failure,
  type PassageId,
} from '@omne-harness/agent-contract'
import {
  InvalidateWaitSchema,
  OperationRefSchema,
  OriginSchema,
  ReceiverGenerationSchema,
  RegisterRequestSchema,
  type Card,
  type CardRef,
  type RegisterRequest,
  type RequestSnapshot,
} from '@omne-harness/human-intervention'
import {
  hitlCommandBinding,
  IndependentCommandSchema,
  type IndependentCommand,
} from '@omne-harness/human-intervention-local'
import { standingPrincipalRef, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionId, WorkSnapshot } from '@omne-harness/session-contract'
import { runOf } from '../tool-hitl/bridge.ts'
import { HITL_DESTINATION, type TenantHitl, type ToolHitlHost } from '../tool-hitl/host.ts'
import type { HitlAudience } from '../tool-hitl/holder.ts'
import { sessionWorkOf } from '../tool-runtime/session-work.ts'
import {
  AGENT_CARDS_OWNER,
  cardEvidence,
  cardRefOf,
  replyOf,
  roundCards,
  roundKey,
  roundOperation,
  roundWait,
} from './cards.ts'

const ADOPTION = `${AGENT_CARDS_OWNER}/1`
const DISPLAY_CONTEXT = 'Agent'
const RECEIVER_INSTANCE = 'harness-server'
const UNBOUND_GENERATION = '0'

export type AgentCardsInput = Readonly<{
  host: () => ToolHitlHost | null
  audience: () => HitlAudience | undefined
  registrar: (tenant: TenantId) => ActingForTenantPrincipal | undefined
  readWork: (
    input: Readonly<{ principal: unknown; tenant: TenantId; session: SessionId }>,
  ) => Promise<Outcome<WorkSnapshot, Readonly<{ kind: string }>> | undefined>
}>

type At = Extract<TenantHitl, { kind: 'ready' }>['tenant']
type Round = Readonly<{ passage: PassageId; round: CardRoundId }>

const unavailable = (diagnostic: string): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', owner: AGENT_CARDS_OWNER, diagnostic })
const invalid = (field: string, reason: string): Outcome<never, Failure> =>
  fail({ kind: 'invalid', field, reason })

const digestOf = (parts: readonly string[]): string =>
  createHash('sha256').update(JSON.stringify(parts)).digest('hex')

const evidenceOf = (record: string, basis: string): DurableEvidence => ({
  owner: AGENT_CARDS_OWNER,
  record,
  revision: '1',
  digest: `sha256:${digestOf([basis])}`,
})

export function createAgentDecisionCards(input: AgentCardsInput): DecisionCards<unknown> {
  const seat = async (
    tenant: TenantId,
  ): Promise<
    Outcome<Readonly<{ at: At; principal: ActingForTenantPrincipal; tenantText: string }>, Failure>
  > => {
    const host = input.host()
    if (host === null) return unavailable('the HITL host is not installed')
    const tenantText = tenantCodec.encode(tenant)
    if (!tenantText.ok) return invalid('tenant', 'not-a-tenant')
    const principal = input.registrar(tenant)
    if (principal === undefined) return unavailable('the registering principal is not issued')
    const at = await host.tenant(tenantText.value)
    if (at.kind === 'unregistered') return unavailable('the tenant has no domain')
    if (at.kind !== 'ready') return unavailable(at.diagnostic)
    return succeed({ at: at.tenant, principal, tenantText: tenantText.value })
  }

  const sessionRun = async (
    access: Access<unknown>,
    execution: AgentExecutionId,
  ): Promise<Outcome<Readonly<{ session: SessionId; run: string }>, Failure>> => {
    const who = sessionWorkOf(access.principal, access.tenant)
    if (who === undefined) return fail({ kind: 'denied', action: 'agent-cards' })
    const session = who.session as SessionId
    const snapshot = await input.readWork({ ...access, session })
    if (snapshot === undefined) return unavailable('the session is not readable')
    if ('failure' in snapshot)
      return unavailable(`the session read answered ${snapshot.failure.kind}`)
    const run = runOf(snapshot.ok, execution)
    if (run === undefined)
      return invalid('execution', 'the execution belongs to no run of its session')
    return succeed({ session, run })
  }

  const registration = async (
    access: Access<unknown>,
    execution: AgentExecutionId,
    at: Round,
    requests: readonly CardRequest[],
  ): Promise<
    Outcome<
      Readonly<{
        at: At
        principal: ActingForTenantPrincipal
        key: string
        operation: AgentOperationId
        prepare: Extract<IndependentCommand, { kind: 'prepare' }>
        register: RegisterRequest
      }>,
      Failure
    >
  > => {
    const cards = roundCards(at.passage, requests)
    if ('failure' in cards) return invalid('requests', cards.failure)
    const located = await sessionRun(access, execution)
    if ('failure' in located) return located
    const seated = await seat(access.tenant)
    if ('failure' in seated) return seated
    const audience = input.audience()
    if (audience === undefined) return unavailable('no audience of HITL cards is installed')
    const key = roundKey(at.passage, at.round)
    const operation = decodeAgentOperationId(roundOperation(key, 'register'))
    if ('failure' in operation) return invalid('round', 'the round names no operation')
    const actorRef = standingPrincipalRef(seated.ok.principal)
    const operationOf = (step: 'prepare' | 'register') =>
      OperationRefSchema.safeParse({
        tenantRef: seated.ok.tenantText,
        actorRef,
        operationId: roundOperation(key, step),
      })
    const origin = OriginSchema.safeParse({
      kind: cards.ok.kind,
      originRef: at.passage,
      wait: roundWait(key, HITL_DESTINATION),
      positionRef: at.round,
      adoptionRef: ADOPTION,
      sessionRef: located.ok.session,
      runRef: located.ok.run,
    })
    if (!origin.success) return invalid('round', 'the round does not form a HITL origin')
    let given: ReturnType<HitlAudience>
    try {
      given = audience({ tenant: access.tenant, origin: origin.data })
    } catch {
      return unavailable('the audience of HITL cards threw')
    }
    const registerOperation = operationOf('register')
    const prepareOperation = operationOf('prepare')
    const register = RegisterRequestSchema.safeParse({
      protocol: 'hitl/1',
      operation: registerOperation.data,
      preparationRef: roundOperation(key, 'prepare'),
      origin: origin.data,
      questions: cards.ok.questions,
      displayContext: DISPLAY_CONTEXT,
    })
    if (!registerOperation.success || !prepareOperation.success || !register.success)
      return invalid('requests', 'the round does not fit a HITL registration')
    const prepare = IndependentCommandSchema.safeParse({
      kind: 'prepare',
      operation: prepareOperation.data,
      preparation: {
        registration: register.data,
        readers: [...new Set([actorRef, ...given.readers])],
        responders: given.responders,
        compatibleImplementations: [ADOPTION],
      },
    })
    if (!prepare.success || prepare.data.kind !== 'prepare')
      return invalid('audience', 'the audience does not form a HITL preparation')
    return succeed({
      at: seated.ok.at,
      principal: seated.ok.principal,
      key,
      operation: operation.ok,
      prepare: prepare.data,
      register: register.data,
    })
  }

  const requestOf = async (
    at: At,
    principal: ActingForTenantPrincipal,
    card: CardRef,
  ): Promise<Outcome<RequestSnapshot, Failure>> => {
    const read = await at.application.getRequest(principal, {
      protocol: 'hitl/1',
      requestRef: card.request,
    })
    return read.kind === 'found'
      ? succeed(read.request)
      : unavailable(`the HITL request read answered ${read.kind}`)
  }

  const takeOver = async (
    at: At,
    principal: ActingForTenantPrincipal,
    request: RequestSnapshot,
    card: Extract<Card, { kind: 'decided' }>,
  ): Promise<Outcome<null, Failure>> => {
    const waitRef = request.origin.wait
    const key = waitRef.waitId.replace(/^round\//, '')
    const operationOf = (step: string) =>
      OperationRefSchema.parse({
        tenantRef: request.ref.tenantRef,
        actorRef: standingPrincipalRef(principal),
        operationId: roundOperation(key, step),
      })
    const bound = await at.application.bindReceiver(principal, {
      protocol: 'hitl/1',
      waitRef,
      operation: operationOf('bind'),
      expectedGeneration: ReceiverGenerationSchema.parse(UNBOUND_GENERATION),
      instanceId: RECEIVER_INSTANCE,
      implementationRef: ADOPTION,
    })
    if (bound.kind !== 'bound')
      return unavailable(`the HITL receiver binding answered ${bound.kind}`)
    const operation = operationOf(`consume/${card.ref.cardId}`)
    const consumed = await at.application.consumeDecision(principal, {
      protocol: 'hitl/1',
      waitRef,
      operation,
      receiverGeneration: bound.receiverGeneration,
      decisionRef: card.decision.ref,
      consumeOperationId: operation.operationId,
    })
    if (consumed.kind !== 'accepted')
      return unavailable(`the HITL consumption answered ${consumed.kind}`)
    const acknowledged = await at.application.acknowledgeDelivery(principal, {
      protocol: 'hitl/1',
      operation: operationOf(`acknowledge/${card.ref.cardId}`),
      consumerReceipt: consumed.receipt,
    })
    return acknowledged.kind === 'acknowledged'
      ? succeed(null)
      : unavailable(`the HITL delivery acknowledgement answered ${acknowledged.kind}`)
  }

  const present: DecisionCards<unknown>['present'] = async request => {
    const built = await registration(request, request.advance.execution, request, request.requests)
    if ('failure' in built) return built
    const { at, principal, operation, prepare, register } = built.ok
    const host = input.host()
    if (host === null) return unavailable('the HITL host is not installed')
    const prepared = await host.prepare(at, prepare)
    switch (prepared.kind) {
      case 'committed':
        break
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation })
      case 'rolled_back':
        return fail({ kind: 'conflict', operation })
      default:
        return unavailable(`the HITL preparation answered ${prepared.kind}`)
    }
    const registered = await at.application.registerRequest(principal, register)
    switch (registered.kind) {
      case 'registered':
        return succeed(registered.cards.map(cardEvidence))
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation })
      case 'unavailable':
        return unavailable(`the HITL registration is unavailable: ${registered.reason}`)
      case 'conflict':
        return fail({ kind: 'conflict', operation })
      default:
        return invalid('requests', `the HITL registration answered ${registered.kind}`)
    }
  }

  const lookup: DecisionCards<unknown>['lookup'] = async request => {
    const built = await registration(request, request.execution, request, request.requests)
    if ('failure' in built) return built
    const { at, principal, key, register } = built.ok
    const binding = hitlCommandBinding('registerRequest', register)
    const found = await at.application.getOperation(principal, {
      protocol: 'hitl/1',
      operationRef: binding.operationRef,
      inputDigest: binding.inputDigest,
    })
    switch (found.kind) {
      case 'committed':
        if (found.method !== 'registerRequest') return succeed({ kind: 'unknown' })
        return found.result.kind === 'registered'
          ? succeed({ kind: 'presented', cards: found.result.cards.map(cardEvidence) })
          : succeed({
              kind: 'not-presented',
              exclusion: evidenceOf(`hitl-refused/${key}`, found.commitReceipt),
            })
      case 'not-committed':
        return succeed({
          kind: 'not-presented',
          exclusion: evidenceOf(`hitl-sealed/${key}`, found.sealReceipt),
        })
      case 'unknown':
      case 'conflict':
        return succeed({ kind: 'unknown' })
      default:
        return unavailable(`the HITL operation read answered ${found.kind}`)
    }
  }

  const read: DecisionCards<unknown>['read'] = async request => {
    const tenantText = tenantCodec.encode(request.tenant)
    if (!tenantText.ok) return invalid('tenant', 'not-a-tenant')
    const ref = cardRefOf(request.card, tenantText.value)
    if (ref === null) return invalid('card', 'not a card of this provider')
    const seated = await seat(request.tenant)
    if ('failure' in seated) return seated
    const { at, principal } = seated.ok
    const found = await requestOf(at, principal, ref)
    if ('failure' in found) return found
    const card = found.ok.cards.find(item => item.ref.cardId === ref.cardId)
    if (card === undefined) return invalid('card', 'the HITL request has no such card')
    if (card.kind === 'decided' && card.delivery.kind === 'pending') {
      const taken = await takeOver(at, principal, found.ok, card)
      if ('failure' in taken) return taken
    }
    return succeed(replyOf(card))
  }

  const invalidate: DecisionCards<unknown>['invalidate'] = async request => {
    const tenantText = tenantCodec.encode(request.tenant)
    if (!tenantText.ok) return invalid('tenant', 'not-a-tenant')
    const refs: CardRef[] = []
    for (const card of request.cards) {
      const ref = cardRefOf(card, tenantText.value)
      if (ref === null) return invalid('cards', 'not a card of this provider')
      refs.push(ref)
    }
    const first = refs[0]
    if (first === undefined) return invalid('cards', 'the round names no card')
    const seated = await seat(request.tenant)
    if ('failure' in seated) return seated
    const { at, principal } = seated.ok
    const key = roundKey(request.passage, request.round)
    const command = InvalidateWaitSchema.safeParse({
      protocol: 'hitl/1',
      operation: {
        tenantRef: tenantText.value,
        actorRef: standingPrincipalRef(principal),
        operationId: roundOperation(key, `invalidate/${digestOf([request.operation])}`),
      },
      waitRef: roundWait(key, HITL_DESTINATION),
      terminalEvidenceRef: `agent-terminal/${digestOf([JSON.stringify(request.reason)])}`,
      reason: 'origin-terminal',
    })
    if (!command.success) return invalid('operation', 'the round does not form a HITL invalidation')
    const answer = await at.application.invalidateWait(principal, command.data)
    switch (answer.kind) {
      case 'invalidated':
        break
      case 'unknown':
        return fail({ kind: 'commit-unknown', operation: request.operation })
      default:
        return unavailable(`the HITL invalidation answered ${answer.kind}`)
    }
    const found = await requestOf(at, principal, first)
    if ('failure' in found) return found
    const known = new Map(found.ok.cards.map(card => [card.ref.cardId, card]))
    if (
      refs.length !== known.size ||
      refs.some(ref => ref.request.requestId !== first.request.requestId || !known.has(ref.cardId))
    )
      return fail({ kind: 'conflict', operation: request.operation })
    const results = []
    for (const [index, ref] of refs.entries()) {
      const card = known.get(ref.cardId)
      const reply = card === undefined ? undefined : replyOf(card)
      if (reply === undefined || reply.kind === 'pending')
        return unavailable('a card of the round still waits after the invalidation')
      results.push({ card: request.cards[index] as DurableEvidence, reply })
    }
    return succeed(results)
  }

  return { present, lookup, read, invalidate }
}
