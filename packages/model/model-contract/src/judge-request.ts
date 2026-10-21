import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { Access, Admit, FixedModelRequest } from './root.ts'
import { decodeModelCallId, decodeModelOperationId } from './identity-values.ts'
import { InputTree, captureRoot, dataField, freezeTree, rejected } from './input-tree.ts'
import { capacityShape, consumerShape, requestShape } from './request-shape.ts'
export { MODEL_INPUT_LIMITS } from './input-tree.ts'

export type ModelInputRejection = Readonly<{
  /** JSON Pointer containing only known fields and indices. The root is the empty string. */
  field: string
  reason:
    | 'type'
    | 'missing'
    | 'unknown-field'
    | 'accessor'
    | 'non-enumerable'
    | 'symbol-key'
    | 'prototype'
    | 'sparse'
    | 'cycle'
    | 'unreadable'
    | 'budget-nodes'
    | 'budget-depth'
    | 'budget-string'
    | 'budget-strings'
    | 'budget-array'
    | 'budget-members'
    | 'budget-key'
    | 'identity'
    | 'reserved'
    | 'value'
    | 'range'
    | 'duplicate'
    | 'selection'
    | 'adoption'
    | 'content'
    | 'message'
    | 'json'
    | 'integer'
}>
export type ModelAdmitCandidate<P> = Access<P> &
  Readonly<{
    call: unknown
    operation: unknown
    request: unknown
    consumer: unknown
    capacity: unknown
  }>
export function judgeFixedModelRequest(
  value: unknown,
): Outcome<FixedModelRequest, ModelInputRejection> {
  const copied = new InputTree().copy(value, '')
  if ('failure' in copied) return copied
  const parsed = requestShape(copied.ok, '')
  return 'failure' in parsed ? parsed : succeed(freezeTree(parsed.ok))
}

const admitKeys = ['principal', 'tenant', 'call', 'operation', 'request', 'consumer', 'capacity']
function captureAdmitFields(
  value: unknown,
): Outcome<Record<string, PropertyDescriptor>, ModelInputRejection> {
  if (typeof value !== 'object' || value === null) return rejected('', 'type')
  const root = captureRoot(value, admitKeys)
  if ('failure' in root) return root
  const fields: Record<string, PropertyDescriptor> = {}
  for (const key of admitKeys) {
    const captured = dataField(value, key, `/${key}`)
    if ('failure' in captured) return captured
    fields[key] = captured.ok
  }
  return succeed(fields)
}
function copyAdmitPayload(
  fields: Record<string, PropertyDescriptor>,
): Outcome<Record<string, unknown>, ModelInputRejection> {
  const tree = new InputTree(true)
  const payload: Record<string, unknown> = {}
  for (const key of ['call', 'operation', 'request', 'consumer', 'capacity']) {
    const budget = tree.key(key, `/${key}`)
    if (budget) return fail(budget)
    const copied = tree.copy(fields[key]?.value, `/${key}`, 2)
    if ('failure' in copied) return copied
    payload[key] = copied.ok
  }
  return succeed(payload)
}

/** Synchronous snapshot before any consumer can queue or await. Access stays opaque. */
export function judgeAdmit<P>(
  value: ModelAdmitCandidate<P>,
): Outcome<Admit<P>, ModelInputRejection> {
  const captured = captureAdmitFields(value)
  if ('failure' in captured) return captured
  const fields = captured.ok
  // The typed Access supplies P. Its captured own data value is retained without traversal.
  const principal: P = fields.principal?.value
  const tenant: ModelAdmitCandidate<P>['tenant'] = fields.tenant?.value
  if (!tenantCodec.encode(tenant).ok) return rejected('/tenant', 'identity')
  const copied = copyAdmitPayload(fields)
  if ('failure' in copied) return copied
  const payload = copied.ok
  const call = decodeModelCallId(payload.call)
  if ('failure' in call) return rejected('/call', 'identity')
  const operation = decodeModelOperationId(payload.operation)
  if ('failure' in operation) return rejected('/operation', 'identity')
  if (operation.ok.startsWith('mop_--')) return rejected('/operation', 'reserved')
  const request = requestShape(payload.request, '/request')
  if ('failure' in request) return request
  const consumer = consumerShape(payload.consumer)
  if ('failure' in consumer) return consumer
  const capacity = capacityShape(payload.capacity)
  if ('failure' in capacity) return capacity
  return succeed(
    Object.freeze({
      principal,
      tenant,
      call: call.ok,
      operation: operation.ok,
      request: freezeTree(request.ok),
      consumer: freezeTree(consumer.ok),
      capacity: freezeTree(capacity.ok),
    }),
  )
}
