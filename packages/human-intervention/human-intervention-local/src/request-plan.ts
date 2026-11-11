import {
  CardSchema,
  DecisionRefSchema,
  DecisionSchema,
  RequestRefSchema,
  RevisionSchema,
  decideReply,
  nextRevision,
  type AcknowledgeDelivery,
  type InvalidateWait,
  type RegisterRequest,
  type SubmitReply,
} from '@omne-harness/human-intervention'
import type { ReadPort } from '@omne-harness/sql-contract/worker'
import { digest, equal, operationKey } from './encoding.ts'
import {
  readRequestIdentity,
  readCard,
  readCardIdentity,
  readPendingCards,
  type RequestIdentity,
} from './request-record.ts'
import {
  SqlCommandSchema,
  type RequestPlan,
  type RequestRecord,
  type WaitBasis,
} from './request-schema.ts'

function noChange(basis: WaitBasis, result: RequestPlan['result']): RequestPlan {
  return {
    binding: basis.binding,
    method: basis.method,
    waitRef: basis.origin.wait,
    result,
    update: { kind: 'none' },
    effect: { kind: 'none' },
  }
}
function conflict(basis: WaitBasis, reason: string): RequestPlan {
  return noChange(basis, { kind: 'conflict', operationRef: basis.binding.operationRef, reason })
}
function register(command: RegisterRequest, basis: WaitBasis): RequestPlan {
  if (basis.state !== 'prepared' || basis.requestRef) return conflict(basis, 'wait-not-prepared')
  if (
    command.preparationRef !== basis.preparationRef ||
    digest(command) !== basis.registrationDigest ||
    !equal(command.origin, basis.origin)
  )
    return conflict(basis, 'registration-changed')
  if (!basis.readAudience) throw new TypeError('Missing original read audience')
  const ref = RequestRefSchema.parse({
    tenantRef: command.operation.tenantRef,
    requestId: `request-${operationKey(command.operation)}`,
  })
  const revision = RevisionSchema.parse('0')
  const cards = command.questions.map(question =>
    CardSchema.parse({
      kind: 'pending',
      ref: { request: ref, cardId: question.cardId },
      revision,
      question,
    }),
  )
  const update: RequestRecord = {
    ref,
    revision,
    origin: command.origin,
    displayContext: command.displayContext,
    cards,
    ...(command.actionBasis ? { actionBasis: command.actionBasis } : {}),
  }
  return {
    binding: basis.binding,
    method: basis.method,
    waitRef: basis.origin.wait,
    update: { kind: 'register', record: update, audience: basis.readAudience },
    result: {
      kind: 'registered',
      operationRef: command.operation,
      requestRef: ref,
      revision,
      cards: cards.map(card => card.ref),
    },
    effect: { kind: 'register', requestRef: ref, cardIds: cards.map(card => card.ref.cardId) },
  }
}
function submit(
  command: SubmitReply,
  basis: WaitBasis,
  current: RequestIdentity,
  port: ReadPort,
): RequestPlan {
  if (!equal(command.cardRef.request, current.ref)) return conflict(basis, 'request-mismatch')
  const loaded = readCard(port, current, command.cardRef.cardId)
  if (!loaded) return conflict(basis, 'card-missing')
  const { card, ordinal } = loaded
  const planned = decideReply({
    card,
    command,
    wait: basis.state === 'terminal' ? 'terminal' : 'live',
  })
  if (planned.kind !== 'ready')
    return noChange(basis, { ...planned, operationRef: command.operation })
  const ref = DecisionRefSchema.parse({
    card: card.ref,
    decisionId: `decision-${operationKey(command.operation)}`,
    submission: command.operation,
  })
  const decision = DecisionSchema.parse({
    ref,
    reply: command.reply,
    basisRef: digest(basis),
    commitReceipt: `hitl-${operationKey(command.operation)}`,
  })
  const decided = CardSchema.parse({
    ...card,
    kind: 'decided',
    revision: planned.nextRevision,
    decision,
    delivery: { kind: 'pending' },
  })
  return {
    binding: basis.binding,
    method: basis.method,
    waitRef: basis.origin.wait,
    result: {
      kind: 'decided',
      operationRef: command.operation,
      decisionRef: ref,
      revision: decided.revision,
      delivery: 'pending',
    },
    update: {
      kind: 'decide',
      ref: current.ref,
      sequence: current.sequence,
      expectedRevision: current.revision,
      ordinal,
      expectedCardRevision: card.revision,
      cardRevision: decided.revision,
    },
    effect: { kind: 'deliver', decision },
  }
}
function invalidate(
  command: InvalidateWait,
  basis: WaitBasis,
  current: RequestIdentity,
  port: ReadPort,
): RequestPlan {
  if (basis.state !== 'terminal') return conflict(basis, 'wait-not-terminal')
  const cards = readPendingCards(port, current)
  const revision = cards.length ? nextRevision(current.revision) : current.revision
  return {
    ...noChange(basis, {
      kind: 'invalidated',
      operationRef: command.operation,
      affected: cards.length,
      revision,
    }),
    update: cards.length
      ? {
          kind: 'invalidate',
          ref: current.ref,
          sequence: current.sequence,
          expectedRevision: current.revision,
          cards,
          reason: command.reason,
          evidenceRef: command.terminalEvidenceRef,
        }
      : { kind: 'none' },
  }
}
function acknowledge(
  command: AcknowledgeDelivery,
  basis: WaitBasis,
  current: RequestIdentity,
  port: ReadPort,
): RequestPlan {
  const receipt = command.consumerReceipt
  if (!basis.receipt || !equal(basis.receipt, receipt))
    return conflict(basis, 'receipt-not-established')
  const card = readCardIdentity(port, current, receipt.decision.card.cardId)
  if (!card || card.state !== 'decided' || !equal(card.decision, receipt.decision))
    return conflict(basis, 'decision-mismatch')
  const result: RequestPlan['result'] = {
    kind: 'acknowledged',
    operationRef: command.operation,
    decisionRef: receipt.decision,
    outcome: receipt.outcome,
  }
  if (card.delivery !== 'pending')
    return card.delivery === receipt.outcome
      ? noChange(basis, result)
      : conflict(basis, 'delivery-mismatch')
  return {
    ...noChange(basis, result),
    update: {
      kind: 'acknowledge',
      ref: current.ref,
      sequence: current.sequence,
      expectedRevision: current.revision,
      ordinal: card.ordinal,
      expectedCardRevision: card.revision,
      outcome: receipt.outcome,
      receiptRef: receipt.evidenceRef,
    },
  }
}

export function planRequest(
  input: ReturnType<typeof SqlCommandSchema.parse>,
  basis: WaitBasis,
  port: ReadPort,
): RequestPlan {
  if (input.method === 'registerRequest') return register(input.command, basis)
  if (!basis.requestRef) {
    return input.method === 'invalidateWait' && basis.state === 'terminal'
      ? noChange(basis, {
          kind: 'invalidated',
          operationRef: input.command.operation,
          affected: 0,
          revision: RevisionSchema.parse('0'),
        })
      : conflict(basis, 'request-not-registered')
  }
  const current = readRequestIdentity(port, basis.requestRef)
  if (!current || !equal(current.origin, basis.origin))
    throw new TypeError('Registered wait has no matching HITL request')
  switch (input.method) {
    case 'submitReply':
      return submit(input.command, basis, current, port)
    case 'invalidateWait':
      return invalidate(input.command, basis, current, port)
    case 'acknowledgeDelivery':
      return acknowledge(input.command, basis, current, port)
  }
}
