import { ConsumerReceiptSchema, ReceiverGenerationSchema } from '@omne-harness/human-intervention'
import type { ParticipantModule, ReadPort } from '@omne-harness/sql-contract/worker'
import { digest, equal, json, operationKey } from './encoding.ts'
import {
  IndependentCommandSchema,
  WAIT_PROTOCOL,
  type IndependentCommand,
} from './independent-schema.ts'
import { StoredOperationSchema, RecoveryResultSchemas } from './operation-schema.ts'
import { WaitBasisSchema, WAIT_BASIS_FACT } from './request-schema.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { readAudience } from './read-audience.ts'
import {
  PreparationRecordSchema,
  WAIT_PLANNER,
  WaitPlanSchema,
  type WaitControl,
  type WaitPlan,
  type WaitDelta,
} from './wait-schema.ts'
import {
  canReadWait,
  compatibleWait,
  readActiveHeader,
  readInboxIdentity,
  readReceipt,
  readWait,
  readWaitAudience,
  waitKey,
} from './wait-record.ts'

type RecoveryInput = Extract<IndependentCommand, { kind: 'bind' | 'consume' }>
function operation(input: IndependentCommand) {
  return input.kind === 'request'
    ? input.input.command.operation
    : input.kind === 'prepare'
      ? input.operation
      : input.command.operation
}
function planOperation(
  input: RecoveryInput,
  result: unknown,
  delta: WaitDelta = { kind: 'none' },
): WaitPlan {
  const method = input.kind === 'bind' ? 'bindReceiver' : 'consumeDecision'
  const binding = { operationRef: input.command.operation, inputDigest: digest(input) }
  return {
    kind: 'wait-operation',
    ...bindingFields(input, binding),
    delta,
    response: StoredOperationSchema.parse({
      ...binding,
      kind: 'committed',
      method,
      result: RecoveryResultSchemas[method].parse(result),
      commitReceipt: `hitl-${operationKey(input.command.operation)}`,
    }),
  }
}
function bindingFields(input: RecoveryInput, binding: WaitPlan['binding']) {
  return { binding, waitRef: input.command.waitRef }
}
function prepare(
  input: Extract<IndependentCommand, { kind: 'prepare' }>,
  port: ReadPort,
): WaitPlan | string {
  const preparation = input.preparation,
    registration = preparation.registration
  if (
    registration.operation.tenantRef !== input.operation.tenantRef ||
    registration.operation.actorRef !== input.operation.actorRef
  )
    return 'preparation-owner-mismatch'
  const current = readWait(port, input.operation.tenantRef, registration.origin.wait)
  if (current && current.preparation.preparationDigest !== digest(preparation))
    return 'preparation-conflict'
  return {
    kind: 'wait-operation',
    binding: { operationRef: input.operation, inputDigest: digest(input) },
    waitRef: registration.origin.wait,
    response: { kind: 'prepared', preparationRef: registration.preparationRef },
    delta: current
      ? { kind: 'none' }
      : {
          kind: 'prepare',
          preparation: PreparationRecordSchema.parse({
            tenantRef: input.operation.tenantRef,
            waitRef: registration.origin.wait,
            ownerActor: input.operation.actorRef,
            preparationRef: registration.preparationRef,
            preparationDigest: digest(preparation),
            registrationDigest: digest(registration),
            registrationOperation: registration.operation,
            origin: registration.origin,
          }),
          audience: [...new Set(preparation.readers)]
            .sort()
            .map(actorRef => ({ actorRef, canRespond: preparation.responders.includes(actorRef) })),
          implementations: [...new Set(preparation.compatibleImplementations)].sort(),
        },
  }
}
function request(
  input: Extract<IndependentCommand, { kind: 'request' }>,
  state: WaitControl,
  port: ReadPort,
): WaitPlan | string {
  const value = input.input,
    p = state.preparation,
    actor = value.command.operation.actorRef
  const expectedWait =
    value.method === 'registerRequest'
      ? value.command.origin.wait
      : value.method === 'invalidateWait'
        ? value.command.waitRef
        : value.method === 'acknowledgeDelivery'
          ? value.command.consumerReceipt.wait
          : input.waitRef
  if (!equal(expectedWait, p.waitRef)) return 'wait-mismatch'
  if (
    value.method === 'submitReply'
      ? !canReadWait(port, p.tenantRef, p.waitRef, actor, true)
      : actor !== p.ownerActor
  )
    return 'wait-access-denied'
  const delta: WaitDelta =
    value.method === 'invalidateWait' && state.lifecycle.kind === 'live'
      ? { kind: 'terminal', evidenceRef: value.command.terminalEvidenceRef }
      : { kind: 'none' }
  const active = readActiveHeader(port, p.tenantRef, p.waitRef)
  const submitted =
    value.method === 'acknowledgeDelivery' ? value.command.consumerReceipt : undefined
  const established = submitted
    ? readReceipt(port, p.tenantRef, p.waitRef, submitted.decision.card.cardId)
    : undefined
  const audience =
    value.method === 'registerRequest'
      ? readAudience({
          tenantRef: p.tenantRef,
          waitRef: p.waitRef,
          preparationRef: p.preparationRef,
          registrationDigest: p.registrationDigest,
          readers: readWaitAudience(port, state).map(item => item.actorRef),
        })
      : undefined
  const basis = WaitBasisSchema.parse({
    binding: { operationRef: value.command.operation, inputDigest: digest(value) },
    method: value.method,
    origin: p.origin,
    preparationRef: p.preparationRef,
    registrationDigest: p.registrationDigest,
    requestRef: active?.requestRef ?? null,
    state:
      state.lifecycle.kind === 'terminal' || delta.kind === 'terminal'
        ? 'terminal'
        : active
          ? 'active'
          : 'prepared',
    ...(established && equal(established, submitted) ? { receipt: established } : {}),
    ...(audience ? { readAudience: audience } : {}),
  })
  return {
    kind: 'request-basis',
    binding: basis.binding,
    waitRef: p.waitRef,
    ownerActor: p.ownerActor,
    basis,
    delta,
  }
}
function bind(
  input: Extract<RecoveryInput, { kind: 'bind' }>,
  state: WaitControl,
  port: ReadPort,
): WaitPlan {
  const command = input.command,
    operationRef = command.operation
  if (state.lifecycle.kind === 'terminal')
    return planOperation(input, {
      kind: 'terminal',
      operationRef,
      terminalEvidenceRef: state.lifecycle.evidenceRef,
    })
  if (!readActiveHeader(port, operationRef.tenantRef, command.waitRef))
    return planOperation(input, { kind: 'conflict', operationRef, reason: 'wait-not-registered' })
  if (!compatibleWait(port, state, command.implementationRef))
    return planOperation(input, {
      kind: 'incompatible',
      operationRef,
      reason: 'implementation-not-adopted',
    })
  if (state.receiver.generation !== command.expectedGeneration)
    return planOperation(input, { kind: 'conflict', operationRef, reason: 'receiver-changed' })
  const generation = ReceiverGenerationSchema.parse(
    (BigInt(state.receiver.generation) + 1n).toString(),
  )
  return planOperation(
    input,
    { kind: 'bound', operationRef, waitRef: command.waitRef, receiverGeneration: generation },
    {
      kind: 'bind',
      expectedGeneration: state.receiver.generation,
      receiver: {
        kind: 'bound',
        generation,
        instanceId: command.instanceId,
        implementationRef: command.implementationRef,
      },
    },
  )
}
function consume(
  input: Extract<RecoveryInput, { kind: 'consume' }>,
  state: WaitControl,
  port: ReadPort,
): WaitPlan {
  const command = input.command,
    operationRef = command.operation,
    tenant = operationRef.tenantRef,
    wait = command.waitRef
  if (state.receiver.kind !== 'bound' || state.receiver.generation !== command.receiverGeneration)
    return planOperation(input, { kind: 'stale-generation', operationRef })
  const original = readReceipt(port, tenant, wait, command.decisionRef.card.cardId)
  if (original && equal(original.decision, command.decisionRef))
    return planOperation(input, { kind: original.outcome, operationRef, receipt: original })
  const active = readActiveHeader(port, tenant, wait),
    inbox = readInboxIdentity(port, tenant, wait, command.decisionRef.card.cardId)
  if (!active || !inbox || !equal(inbox.ref, command.decisionRef))
    return planOperation(input, {
      kind: 'conflict',
      operationRef,
      reason: 'decision-not-delivered',
    })
  if (original || state.receiptCount >= active.cardCount)
    throw new TypeError('Receipt count or identity mismatch')
  const outcome = state.lifecycle.kind === 'terminal' ? 'superseded' : 'accepted'
  const receipt = ConsumerReceiptSchema.parse({
    decision: command.decisionRef,
    wait,
    consumeOperationId: command.consumeOperationId,
    receiverGeneration: command.receiverGeneration,
    outcome,
    evidenceRef: `consume-${digest([waitKey(tenant, wait), command.decisionRef, command.consumeOperationId])}`,
  })
  return planOperation(
    input,
    { kind: outcome, operationRef, receipt },
    {
      kind: 'consume',
      ordinal: inbox.ordinal,
      expectedCount: state.receiptCount,
      receipt,
      checkpoint:
        state.lifecycle.kind === 'terminal'
          ? 'terminal'
          : state.receiptCount + 1 === active.cardCount
            ? 'resume-ready'
            : 'waiting',
    },
  )
}
function plan(input: IndependentCommand, port: ReadPort): WaitPlan | string {
  if (input.kind === 'prepare') return prepare(input, port)
  const op = operation(input),
    wait = input.kind === 'request' ? input.waitRef : input.command.waitRef
  const state = readWait(port, op.tenantRef, wait)
  if (input.kind === 'request') return state ? request(input, state, port) : 'wait-not-prepared'
  if (!state)
    return planOperation(input, { kind: 'conflict', operationRef: op, reason: 'wait-not-prepared' })
  if (state.preparation.ownerActor !== op.actorRef)
    return planOperation(input, { kind: 'denied', operationRef: op, reason: 'wait-owner-required' })
  return input.kind === 'bind' ? bind(input, state, port) : consume(input, state, port)
}
export default {
  participant: WAIT_PLANNER,
  protocol: WAIT_PROTOCOL,
  execute(facts, port) {
    const input = IndependentCommandSchema.parse(facts['input'])
    const binding = {
      operationRef: operation(input),
      inputDigest: digest(input.kind === 'request' ? input.input : input),
    }
    if (!equal(port.requireFact(TERMINAL_FACT), { kind: 'consume', binding }))
      return { kind: 'conflict', basis: { reason: 'operation-binding' } }
    const result = plan(input, port)
    if (typeof result === 'string') return { kind: 'conflict', basis: { reason: result } }
    const planned = WaitPlanSchema.parse(result)
    port.provideFact(WAIT_BASIS_FACT, json(planned))
    return { kind: 'participated', response: json({ binding, planDigest: digest(planned) }) }
  },
} satisfies ParticipantModule
