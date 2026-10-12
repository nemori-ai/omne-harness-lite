import assert from 'node:assert/strict'
function record(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
function schema(bytes: Uint8Array) {
  const parsed: unknown = JSON.parse(Buffer.from(bytes).toString())
  return record(parsed)
}

/** AR-1 changes only these positions. Every other shape stays under the frozen oracle. */
export function assertContentSchemaTransition(currentBytes: Uint8Array, previousBytes: Uint8Array) {
  const current = schema(currentBytes),
    previous = schema(previousBytes)
  const defs = record(current.$defs),
    oldDefs = record(previous.$defs)
  const result = record(defs.ToolResultBlock),
    oldResult = record(oldDefs.ToolResultBlock)
  const props = record(result.properties),
    oldProps = record(oldResult.properties)
  assert.deepEqual(defs.ToolCallOutcome, {
    anyOf: [{ $ref: '#/$defs/ExecutionOutcome' }, { const: 'denied' }],
  })
  assert.deepEqual(defs.AdmissionDenialCode, {
    type: 'string',
    enum: [
      'not_held',
      'permission_forbidden',
      'authorization_denied',
      'run_mode_never',
      'human_refused',
      'human_declined',
    ],
  })
  // The new reason definition has independent positive/negative behavioral vectors.
  assert.ok(defs.ActionDenialReason)
  assert.deepEqual(props.outcome, { $ref: '#/$defs/ToolCallOutcome' })
  assert.deepEqual(props.reason, {
    anyOf: [oldProps.reason, { $ref: '#/$defs/ActionDenialReason' }],
  })
  assert.ok(Array.isArray(result.allOf))
  assert.deepEqual(result.allOf.at(-1), {
    if: { properties: { outcome: { const: 'denied' } }, required: ['outcome'] },
    then: {
      required: ['reason'],
      properties: { reason: { $ref: '#/$defs/ActionDenialReason' } },
      not: { required: ['offloaded'] },
    },
    else: { properties: { reason: oldProps.reason } },
  })
  result.allOf = result.allOf.slice(0, -1)
  result.description = oldResult.description
  props.outcome = oldProps.outcome
  props.reason = oldProps.reason
  delete defs.ToolCallOutcome
  delete defs.AdmissionDenialCode
  delete defs.ActionDenialReason
  assert.deepEqual(current, previous)
}
