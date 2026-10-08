import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { checkLogPayload, type LogEntry } from '@omne-harness-lite/session-log'
import { readModelLogEnvelope } from '@omne-harness-lite/model-request-runtime'

/** Inspect current owned formats in tests. The physical payload remains the atomicity oracle. */
export function fixturePayload(input: unknown): {
  readonly format?: string
  readonly category?: string
  readonly value: Record<string, unknown>
} {
  const model = readModelLogEnvelope(input)
  if ('kind' in model && model.kind === 'model')
    return { ...model.envelope, value: model.envelope.value as Record<string, unknown> }
  const log = checkLogPayload(input)
  if (!('kind' in log) || log.kind !== 'fact')
    throw new Error('fixture is not a current owned fact')
  const inner = log.payload.value as Record<string, unknown>
  if (log.payload.owner === 'demo-tool-driver' || log.payload.owner === 'tool-execution-runtime')
    return inner as {
      readonly format: string
      readonly category: string
      readonly value: Record<string, unknown>
    }
  return { value: inner }
}
export function replaceFixtureValue(row: LogEntry, value: unknown): LogEntry {
  const outer = checkLogPayload(row.payload)
  if (!('kind' in outer) || outer.kind !== 'fact')
    throw new Error('only fact fixtures can be altered here')
  const nested =
    outer.payload.owner === 'demo-tool-driver' ||
    outer.payload.owner === 'tool-execution-runtime' ||
    outer.payload.owner === 'model-request-runtime'
  const changed = {
    ...outer.payload,
    value: nested ? { ...(outer.payload.value as object), value } : value,
  }
  const copied = copyJsonValue(changed)
  if ('failed' in copied) throw new Error('altered fixture is not JSON')
  return { ...row, payload: copied.ok }
}
