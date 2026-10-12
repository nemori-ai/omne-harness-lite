import assert from 'node:assert/strict'

/** MR12 changes only its identity and the two unchanged AssistantMessage dependency references. */
export function assertResponseSchemaTransition(
  currentBytes: Uint8Array,
  previousBytes: Uint8Array,
) {
  const current = JSON.parse(Buffer.from(currentBytes).toString())
  const expected = JSON.parse(Buffer.from(previousBytes).toString())
  const previousId = expected.$id
  assert.equal(current.$id, previousId.replace('/model-response/v11/', '/model-response/v12/'))
  expected.$id = current.$id
  let changed = 0
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    if (object.$ref === '../../messages/v8/messages.schema.json#/$defs/AssistantMessage') {
      object.$ref = '../../messages/v9/messages.schema.json#/$defs/AssistantMessage'
      changed++
    }
    for (const nested of Object.values(object)) visit(nested)
  }
  visit(expected)
  assert.equal(changed, 2)
  assert.deepEqual(current, expected)
}
