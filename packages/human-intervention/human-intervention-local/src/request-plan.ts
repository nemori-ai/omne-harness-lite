import {
  CardSchema,
  DecisionRefSchema,
  DecisionSchema,
  RequestRefSchema,
  RevisionSchema,
  decideReply,
  invalidateCard,
  nextRevision,
  type AcknowledgeDelivery,
  type InvalidateWait,
  type RegisterRequest,
  type SubmitReply,
} from '@omne-harness/human-intervention'
import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { digest, equal, json, operationKey } from './encoding.ts'
import { readRequest } from './request-record.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import {
  PLAN_FACT,
  REQUEST_PLANNER,
  REQUEST_PROTOCOL,
  RequestPlanSchema,
  SqlCommandSchema,
  WAIT_BASIS_FACT,
  WaitBasisSchema,
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
    update: null,
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
    update,
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
function submit(command: SubmitReply, basis: WaitBasis, current: RequestRecord): RequestPlan {
  if (!equal(command.cardRef.request, current.ref)) return conflict(basis, 'request-mismatch')
  const card = current.cards.find(card => card.ref.cardId === command.cardRef.cardId)
  if (!card) return conflict(basis, 'card-missing')
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
      ...current,
      revision: nextRevision(current.revision),
      cards: current.cards.map(item => (item.ref.cardId === card.ref.cardId ? decided : item)),
    },
    effect: { kind: 'deliver', decision },
  }
}
function invalidate(
  command: InvalidateWait,
  basis: WaitBasis,
  current: RequestRecord,
): RequestPlan {
  if (basis.state !== 'terminal') return conflict(basis, 'wait-not-terminal')
  const affected = current.cards.filter(card => card.kind === 'pending').length
  const revision = affected ? nextRevision(current.revision) : current.revision
  const update = affected
    ? {
        ...current,
        revision,
        cards: current.cards.map(card =>
          invalidateCard({
            card,
            reason: command.reason,
            terminalEvidenceRef: command.terminalEvidenceRef,
          }),
        ),
      }
    : null
  return {
    binding: basis.binding,
    method: basis.method,
    waitRef: basis.origin.wait,
    effect: { kind: 'none' },
    update,
    result: { kind: 'invalidated', operationRef: command.operation, affected, revision },
  }
}
function acknowledge(
  command: AcknowledgeDelivery,
  basis: WaitBasis,
  current: RequestRecord,
): RequestPlan {
  const receipt = command.consumerReceipt
  if (!basis.receipt || !equal(basis.receipt, receipt))
    return conflict(basis, 'receipt-not-established')
  const card = current.cards.find(card => card.ref.cardId === receipt.decision.card.cardId)
  if (!card || card.kind !== 'decided' || !equal(card.decision.ref, receipt.decision))
    return conflict(basis, 'decision-mismatch')
  const result: RequestPlan['result'] = {
    kind: 'acknowledged',
    operationRef: command.operation,
    decisionRef: receipt.decision,
    outcome: receipt.outcome,
  }
  if (card.delivery.kind !== 'pending')
    return card.delivery.kind === receipt.outcome
      ? noChange(basis, result)
      : conflict(basis, 'delivery-mismatch')
  const updated = CardSchema.parse({
    ...card,
    revision: nextRevision(card.revision),
    delivery: { kind: receipt.outcome, receiptRef: receipt.evidenceRef },
  })
  return {
    ...noChange(basis, result),
    update: {
      ...current,
      revision: nextRevision(current.revision),
      cards: current.cards.map(item => (item.ref.cardId === card.ref.cardId ? updated : item)),
    },
  }
}
function plan(
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
  const current = readRequest(port, basis.requestRef)
  if (!current || !equal(current.origin, basis.origin))
    throw new TypeError('Registered wait has no matching HITL request')
  switch (input.method) {
    case 'submitReply':
      return submit(input.command, basis, current)
    case 'invalidateWait':
      return invalidate(input.command, basis, current)
    case 'acknowledgeDelivery':
      return acknowledge(input.command, basis, current)
  }
}
export default {
  participant: REQUEST_PLANNER,
  protocol: REQUEST_PROTOCOL,
  execute(facts, port) {
    const input = SqlCommandSchema.parse(facts['input'])
    const basis = WaitBasisSchema.parse(port.requireFact(WAIT_BASIS_FACT))
    const binding = { operationRef: input.command.operation, inputDigest: digest(input) }
    if (
      !equal(binding, basis.binding) ||
      !equal(port.requireFact(TERMINAL_FACT), { kind: 'consume', binding })
    )
      return { kind: 'failed', diagnostic: 'hitl_command_binding' }
    const planned = RequestPlanSchema.parse(plan(input, basis, port))
    port.provideFact(PLAN_FACT, json(planned))
    return { kind: 'participated', response: json({ binding, planDigest: digest(planned) }) }
  },
} satisfies ParticipantModule
