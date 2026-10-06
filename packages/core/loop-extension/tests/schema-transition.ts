import assert from 'node:assert/strict'
function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
/** AR-2 changes only the two action subjects; the rest stays under the LC6 oracle. */
export function assertLoopSchemaTransition(currentBytes: Uint8Array, previousBytes: Uint8Array) {
  const current = object(JSON.parse(Buffer.from(currentBytes).toString()))
  const previous = object(JSON.parse(Buffer.from(previousBytes).toString()))
  const defs = object(current.$defs),
    oldDefs = object(previous.$defs)
  const each = object(defs.AfterActionEachSubject),
    oldEach = object(oldDefs.AfterActionEachSubject)
  const eachProps = object(each.properties)
  const batch = object(defs.AfterActionBatchSubject),
    oldBatch = object(oldDefs.AfterActionBatchSubject)
  const batchProps = object(object(object(object(batch.properties).outcomes).items).properties)
  const oldBatchProps = object(
    object(object(object(oldBatch.properties).outcomes).items).properties,
  )
  const ref = { $ref: '../../content-blocks/v3/content-blocks.schema.json#/$defs/ToolCallOutcome' }
  assert.deepEqual(eachProps.outcome, ref)
  assert.deepEqual(batchProps.outcome, ref)
  assert.deepEqual(each.allOf, [
    {
      if: { properties: { outcome: { const: 'denied' } }, required: ['outcome'] },
      then: { not: { required: ['result'] } },
    },
  ])
  eachProps.outcome = object(oldEach.properties).outcome
  batchProps.outcome = oldBatchProps.outcome
  delete each.allOf
  assert.deepEqual(current, previous)
}
