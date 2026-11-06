import {
  ConsumerReceiptSchema,
  ReceiverGenerationSchema,
  type OperationRef,
} from '@omne-harness/human-intervention'
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import { digest, equal, json, operationKey } from './encoding.ts'
import { StoredOperationSchema } from './operation-schema.ts'
import { TERMINAL_FACT } from './terminal-schema.ts'
import { WAIT_BASIS_FACT, WaitBasisSchema, type SqlCommand } from './request-schema.ts'
import {
  IndependentCommandSchema,
  WAIT_CONTROL,
  WAIT_PROTOCOL,
  type IndependentCommand,
  type IndependentControl,
  type ActiveWait,
} from './independent-schema.ts'
import {
  readActive,
  readControl,
  readInboxEntries,
  waitKey,
  writeControl,
} from './independent-records.ts'

function rejected(reason: string): ParticipantReply {
  return { kind: 'conflict', basis: json({ reason }) }
}
function response(value: unknown): ParticipantReply {
  return { kind: 'participated', response: json(value) }
}
function operation(input: IndependentCommand): OperationRef {
  return input.kind === 'request'
    ? input.input.command.operation
    : input.kind === 'prepare'
      ? input.operation
      : input.command.operation
}
function prepare(
  input: Extract<IndependentCommand, { kind: 'prepare' }>,
  port: ParticipantPort,
): ParticipantReply {
  const registration = input.preparation.registration
  if (
    registration.operation.tenantRef !== input.operation.tenantRef ||
    registration.operation.actorRef !== input.operation.actorRef
  )
    return rejected('preparation-owner-mismatch')
  const key = waitKey(input.operation.tenantRef, registration.origin.wait)
  const current = readControl(port, key)
  if (current && !equal(current.preparation, input.preparation))
    return rejected('preparation-conflict')
  if (!current)
    writeControl(port, key, {
      preparation: input.preparation,
      receiver: { kind: 'unbound', generation: ReceiverGenerationSchema.parse('0') },
      lifecycle: { kind: 'live' },
      receipts: [],
      checkpoint: 'waiting',
    })
  return response({ kind: 'prepared', preparationRef: registration.preparationRef })
}
function requestWait(input: SqlCommand, supplied: IndependentControl): boolean {
  const expected = supplied.preparation.registration.origin.wait
  switch (input.method) {
    case 'registerRequest':
      return equal(input.command.origin.wait, expected)
    case 'invalidateWait':
      return equal(input.command.waitRef, expected)
    case 'acknowledgeDelivery':
      return equal(input.command.consumerReceipt.wait, expected)
    case 'submitReply':
      return true
  }
}
function requestBasis(
  input: SqlCommand,
  state: IndependentControl,
  active: ActiveWait | undefined,
) {
  const { method, command } = input
  const preparation = state.preparation
  const submittedReceipt =
    input.method === 'acknowledgeDelivery' ? input.command.consumerReceipt : undefined
  const receipt = submittedReceipt
    ? state.receipts.find(item => equal(item, submittedReceipt))
    : undefined
  return WaitBasisSchema.parse({
    binding: { operationRef: command.operation, inputDigest: digest(input) },
    method,
    origin: preparation.registration.origin,
    preparationRef: preparation.registration.preparationRef,
    registrationDigest: digest(preparation.registration),
    requestRef: active?.requestRef ?? null,
    state: state.lifecycle.kind === 'terminal' ? 'terminal' : active ? 'active' : 'prepared',
    ...(receipt ? { receipt } : {}),
  })
}
function request(
  input: Extract<IndependentCommand, { kind: 'request' }>,
  state: IndependentControl,
  key: string,
  port: ParticipantPort,
): ParticipantReply {
  const { method, command } = input.input
  const preparation = state.preparation
  const actor = command.operation.actorRef
  if (!requestWait(input.input, state)) return rejected('wait-mismatch')
  const permitted =
    method === 'submitReply'
      ? preparation.responders.includes(actor)
      : preparation.registration.operation.actorRef === actor
  if (!permitted) return rejected('wait-access-denied')
  let next = state
  if (input.input.method === 'invalidateWait' && state.lifecycle.kind === 'live') {
    next = {
      ...state,
      lifecycle: { kind: 'terminal', evidenceRef: input.input.command.terminalEvidenceRef },
      checkpoint: 'terminal',
    }
    writeControl(port, key, next)
  }
  const basis = requestBasis(input.input, next, readActive(port, key))
  port.provideFact(WAIT_BASIS_FACT, json(basis))
  return response(basis)
}
function bind(
  input: Extract<IndependentCommand, { kind: 'bind' }>,
  state: IndependentControl,
  key: string,
  port: ParticipantPort,
): ParticipantReply {
  const command = input.command
  if (state.lifecycle.kind === 'terminal')
    return response({
      kind: 'terminal',
      terminalEvidenceRef: state.lifecycle.evidenceRef,
      operationRef: command.operation,
    })
  if (!readActive(port, key))
    return response({
      kind: 'conflict',
      reason: 'wait-not-registered',
      operationRef: command.operation,
    })
  if (!state.preparation.compatibleImplementations.includes(command.implementationRef))
    return response({
      kind: 'incompatible',
      reason: 'implementation-not-adopted',
      operationRef: command.operation,
    })
  if (state.receiver.generation !== command.expectedGeneration)
    return response({
      kind: 'conflict',
      reason: 'receiver-changed',
      operationRef: command.operation,
    })
  const generation = ReceiverGenerationSchema.parse(
    (BigInt(state.receiver.generation) + 1n).toString(),
  )
  writeControl(port, key, {
    ...state,
    receiver: {
      kind: 'bound',
      generation,
      instanceId: command.instanceId,
      implementationRef: command.implementationRef,
    },
  })
  return response({
    kind: 'bound',
    waitRef: command.waitRef,
    receiverGeneration: generation,
    operationRef: command.operation,
  })
}
function consume(
  input: Extract<IndependentCommand, { kind: 'consume' }>,
  state: IndependentControl,
  key: string,
  port: ParticipantPort,
): ParticipantReply {
  const command = input.command
  if (state.receiver.kind !== 'bound' || state.receiver.generation !== command.receiverGeneration)
    return response({ kind: 'stale-generation', operationRef: command.operation })
  const original = state.receipts.find(receipt => equal(receipt.decision, command.decisionRef))
  if (original)
    return response({ kind: original.outcome, receipt: original, operationRef: command.operation })
  const active = readActive(port, key)
  const entry = readInboxEntries(port, key).find(entry =>
    equal(entry.decision.ref, command.decisionRef),
  )
  if (!active || !entry)
    return response({
      kind: 'conflict',
      reason: 'decision-not-delivered',
      operationRef: command.operation,
    })
  const outcome = state.lifecycle.kind === 'terminal' ? 'superseded' : 'accepted'
  const receipt = ConsumerReceiptSchema.parse({
    decision: command.decisionRef,
    wait: command.waitRef,
    consumeOperationId: command.consumeOperationId,
    receiverGeneration: command.receiverGeneration,
    outcome,
    evidenceRef: `consume-${digest([key, command.decisionRef, command.consumeOperationId])}`,
  })
  const receipts = [...state.receipts, receipt]
  const complete = active.cardIds.every(cardId =>
    receipts.some(item => item.decision.card.cardId === cardId),
  )
  writeControl(port, key, {
    ...state,
    receipts,
    checkpoint:
      state.lifecycle.kind === 'terminal' ? 'terminal' : complete ? 'resume-ready' : 'waiting',
  })
  return response({ kind: outcome, receipt, operationRef: command.operation })
}
function recoveryResponse(
  input: Extract<IndependentCommand, { kind: 'bind' | 'consume' }>,
  result: ParticipantReply,
): ParticipantReply {
  if (result.kind !== 'participated') return result
  return response(
    StoredOperationSchema.parse({
      kind: 'committed',
      operationRef: input.command.operation,
      inputDigest: digest(input),
      method: input.kind === 'bind' ? 'bindReceiver' : 'consumeDecision',
      result: result.response,
      commitReceipt: `hitl-${operationKey(input.command.operation)}`,
    }),
  )
}
export default {
  participant: WAIT_CONTROL,
  protocol: WAIT_PROTOCOL,
  execute(facts, port) {
    const input = IndependentCommandSchema.parse(facts['input'])
    const actor = operation(input)
    const binding = {
      operationRef: actor,
      inputDigest: digest(input.kind === 'request' ? input.input : input),
    }
    if (!equal(port.requireFact(TERMINAL_FACT), { kind: 'consume', binding }))
      return rejected('operation-binding')
    if (input.kind === 'prepare') return prepare(input, port)
    const wait = input.kind === 'request' ? input.waitRef : input.command.waitRef
    const key = waitKey(actor.tenantRef, wait)
    const state = readControl(port, key)
    if (input.kind === 'request')
      return state ? request(input, state, key, port) : rejected('wait-not-prepared')
    if (!state)
      return recoveryResponse(
        input,
        response({ kind: 'conflict', reason: 'wait-not-prepared', operationRef: actor }),
      )
    if (state.preparation.registration.operation.actorRef !== actor.actorRef)
      return recoveryResponse(
        input,
        response({ kind: 'denied', reason: 'wait-owner-required', operationRef: actor }),
      )
    return recoveryResponse(
      input,
      input.kind === 'bind' ? bind(input, state, key, port) : consume(input, state, key, port),
    )
  },
} satisfies ParticipantModule
