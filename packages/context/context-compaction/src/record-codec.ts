import {
  decodeCompactionHandoff,
  decodeCompactionOperationId,
  decodeCompactionRequest,
  decodeCompactionTaskState,
  encodeCompactionRequest,
  encodeCompactionTaskState,
  type CompactionFailure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { CompactionRecord } from './provider.ts'

type Result<T> = Outcome<T, CompactionFailure>
const invalid = (field: string) =>
  fail<CompactionFailure>({ kind: 'invalid', field, reason: 'corrupt compaction record' })
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function encodeRecord(record: CompactionRecord): Result<string> {
  const state = encodeCompactionTaskState(record.state)
  if ('failure' in state) return invalid(state.failure.field)
  const request = record.request === null ? succeed(null) : encodeCompactionRequest(record.request)
  if ('failure' in request) return invalid(request.failure.field)
  return succeed(
    JSON.stringify({
      state: state.ok,
      request: request.ok,
      execution: record.execution,
      cancellation: record.cancellation,
      acknowledgment:
        record.acknowledgment === null
          ? null
          : {
              operation: record.acknowledgment.operation,
              handoff: JSON.stringify(record.acknowledgment.handoff),
            },
    }),
  )
}

export function decodeRecord(text: string): Result<CompactionRecord> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return invalid('record')
  }
  if (
    !object(raw) ||
    Object.keys(raw).length !== 5 ||
    typeof raw.state !== 'string' ||
    (raw.execution !== null && typeof raw.execution !== 'string') ||
    (raw.request !== null && typeof raw.request !== 'string')
  )
    return invalid('record')
  const state = decodeCompactionTaskState(raw.state)
  if ('failure' in state) return invalid(state.failure.field)
  const request = raw.request === null ? succeed(null) : decodeCompactionRequest(raw.request)
  if ('failure' in request) return invalid(request.failure.field)
  const cancellation =
    raw.cancellation === null ? succeed(null) : decodeCompactionOperationId(raw.cancellation)
  if ('failure' in cancellation) return invalid('cancellation')
  let acknowledgment: CompactionRecord['acknowledgment'] = null
  if (raw.acknowledgment !== null) {
    const ack = raw.acknowledgment
    if (!object(ack) || Object.keys(ack).length !== 2 || typeof ack.handoff !== 'string')
      return invalid('acknowledgment')
    const operation = decodeCompactionOperationId(ack.operation)
    const handoff = decodeCompactionHandoff(ack.handoff)
    if ('failure' in operation || 'failure' in handoff) return invalid('acknowledgment')
    acknowledgment = { operation: operation.ok, handoff: handoff.ok }
  }
  return succeed({
    state: state.ok,
    request: request.ok,
    execution: raw.execution,
    cancellation: cancellation.ok,
    acknowledgment,
  })
}
