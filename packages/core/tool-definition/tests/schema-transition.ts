import assert from 'node:assert/strict'
function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
/** Only the accepted business-result field changes; all other assertions stay exact. */
export function assertToolSchemaTransition(currentBytes: Uint8Array, previousBytes: Uint8Array) {
  const current = object(JSON.parse(Buffer.from(currentBytes).toString()))
  const previous = object(JSON.parse(Buffer.from(previousBytes).toString()))
  const result = object(object(current.$defs).ToolResult),
    oldResult = object(object(previous.$defs).ToolResult)
  const props = object(result.properties)
  assert.deepEqual(props.isError, { type: 'boolean' })
  delete props.isError
  result.description = oldResult.description
  assert.deepEqual(current, previous)
}
