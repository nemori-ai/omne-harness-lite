function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function returns(value: unknown): boolean {
  return object(value) && object(value.value) && object(value.body) && object(value.offloading)
}

function definition(value: unknown): boolean {
  if (!object(value)) return false
  if (value.kind === 'function') return returns(value.returns)
  return (
    value.kind === 'commands' &&
    Array.isArray(value.commands) &&
    value.commands.every(command => object(command) && returns(command.returns))
  )
}

function fingerprint(value: unknown): boolean {
  return object(value) && value.codec === 'tool-canonical-json-v1'
}

function custody(value: unknown): boolean {
  return (
    object(value) &&
    (value.kind === 'synthetic' ||
      (value.kind === 'execution' && fingerprint(value.finalValue) && object(value.materialized)))
  )
}

/** Checks the W3 storage format, not every field of a ledger record. */
export function hasCurrentToolLedgerRecordFormat(record: unknown): boolean {
  if (!object(record)) return false
  if (record.kind === 'call') {
    const call = record.call
    return (
      object(call) &&
      object(call.request) &&
      object(call.request.availability) &&
      definition(call.request.availability.definition)
    )
  }
  if (record.kind === 'fact-batch') return object(record.batch) && fingerprint(record.batch.value)
  if (record.kind === 'fact-event') {
    const event = record.fact
    if (!object(event) || !fingerprint(event.value) || !object(event.fact)) return false
    return (
      event.fact.kind !== 'final' ||
      (object(event.fact.payload) &&
        ['pending', 'settled'].includes(String(event.fact.payload.kind)))
    )
  }
  if (record.kind !== 'result') return true
  const result = record.result
  return (
    object(result) &&
    object(result.value) &&
    result.value.kind === 'channels' &&
    fingerprint(result.value.value) &&
    custody(result.custody)
  )
}
