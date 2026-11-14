import { succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  CHECKPOINT_STATE_MAX_BYTES,
  CLOSED_RESULT_MAX_BYTES,
  type Checkpoint,
  type SuspensionRecord,
} from '@omne-harness/tool-contract/provider'
import { invalid, isTenantShape, judgeAdoptionField, judgeEvidenceField } from './boundary.ts'
import { judgeStartRecord } from './facts-boundary.ts'

type Data = Readonly<Record<string, unknown>>

function closed(
  value: unknown,
  keys: readonly string[],
  field: string,
): Outcome<Data, ToolFailure> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid(field, 'type')
  for (const key of keys)
    if (!Object.hasOwn(value, key)) return invalid(`${field}.${key}`, 'missing')
  const extra = Object.keys(value).find(key => !keys.includes(key))
  return extra === undefined
    ? succeed(value as Data)
    : invalid(`${field}.${extra}`, 'unknown-field')
}

function operationAt(value: unknown, field: string): Outcome<ToolOperationId, ToolFailure> {
  const decoded = decodeToolOperationId(value)
  return 'ok' in decoded ? decoded : invalid(field, decoded.failure.reason)
}

export function judgeSuspensionField(value: unknown): Outcome<SuspensionRecord, ToolFailure> {
  const keys = ['tenant', 'call', 'operation', 'adoption', 'inputDigest', 'start', 'schema']
  const data = closed(value, keys, 'suspension')
  if ('failure' in data) return data
  const { tenant, inputDigest } = data.ok
  if (!isTenantShape(tenant)) return invalid('suspension.tenant', 'type')
  const call = decodeToolCallId(data.ok['call'])
  if ('failure' in call) return invalid('suspension.call', call.failure.reason)
  const operation = operationAt(data.ok['operation'], 'suspension.operation')
  if ('failure' in operation) return operation
  const adoption = judgeAdoptionField(data.ok['adoption'], 'suspension.adoption')
  if ('failure' in adoption) return adoption
  if (typeof inputDigest !== 'string' || inputDigest.length === 0)
    return invalid('suspension.inputDigest', 'type')
  const start = judgeStartRecord(data.ok['start'])
  if ('failure' in start) return invalid('suspension.start', 'shape')
  const schema = judgeAdoptionField(data.ok['schema'], 'suspension.schema')
  if ('failure' in schema) return schema
  return succeed({
    tenant,
    call: call.ok,
    operation: operation.ok,
    adoption: adoption.ok,
    inputDigest,
    start: start.ok,
    schema: schema.ok,
  })
}

export function judgeCheckpointStateField(value: unknown): Outcome<string, ToolFailure> {
  if (typeof value !== 'string') return invalid('state', 'type')
  if (value.length > Math.ceil(CHECKPOINT_STATE_MAX_BYTES / 3) * 4)
    return invalid('state', 'too-large')
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    return invalid('state', 'not-base64')
  return succeed(value)
}

export function judgeCheckpointField(value: unknown): Outcome<Checkpoint, ToolFailure> {
  const keys = [
    'schema',
    'payload',
    'closedResult',
    'start',
    'consumedResponses',
    'effectBoundary',
    'exclusion',
  ]
  const data = closed(value, keys, 'checkpoint')
  if ('failure' in data) return data
  const schema = judgeAdoptionField(data.ok['schema'], 'checkpoint.schema')
  if ('failure' in schema) return schema
  const payload = judgeEvidenceField(data.ok['payload'], 'checkpoint.payload')
  if ('failure' in payload) return payload
  const closedResult = data.ok['closedResult']
  if (typeof closedResult !== 'string') return invalid('checkpoint.closedResult', 'type')
  if (closedResult.length === 0) return invalid('checkpoint.closedResult', 'empty')
  if (new TextEncoder().encode(closedResult).byteLength > CLOSED_RESULT_MAX_BYTES)
    return invalid('checkpoint.closedResult', 'too-large')
  const start = judgeStartRecord(data.ok['start'])
  if ('failure' in start) return invalid('checkpoint.start', 'shape')
  const consumed = data.ok['consumedResponses']
  if (!Array.isArray(consumed)) return invalid('checkpoint.consumedResponses', 'type')
  const consumedResponses: ToolOperationId[] = []
  for (const [index, response] of consumed.entries()) {
    const decoded = operationAt(response, `checkpoint.consumedResponses[${index}]`)
    if ('failure' in decoded) return decoded
    consumedResponses.push(decoded.ok)
  }
  const effectBoundary = judgeEvidenceField(data.ok['effectBoundary'], 'checkpoint.effectBoundary')
  if ('failure' in effectBoundary) return effectBoundary
  const exclusion = judgeEvidenceField(data.ok['exclusion'], 'checkpoint.exclusion')
  if ('failure' in exclusion) return exclusion
  return succeed({
    schema: schema.ok,
    payload: payload.ok,
    closedResult,
    start: start.ok,
    consumedResponses,
    effectBoundary: effectBoundary.ok,
    exclusion: exclusion.ok,
  })
}
