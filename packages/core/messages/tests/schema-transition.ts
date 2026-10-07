import assert from 'node:assert/strict'

function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}

/** F0 removes only the attempt reminder. All other MS8 shapes remain exact. */
export function assertMessagesSchemaTransition(
  currentBytes: Uint8Array,
  previousBytes: Uint8Array,
) {
  const current = object(JSON.parse(Buffer.from(currentBytes).toString()))
  const expected = object(JSON.parse(Buffer.from(previousBytes).toString()))
  assert.equal(current.$id, String(expected.$id).replace('/messages/v8/', '/messages/v9/'))
  expected.$id = current.$id
  const defs = object(expected.$defs)
  assert.ok(defs.AttemptStartedSource)
  delete defs.AttemptStartedSource
  const source = object(defs.ReminderSource)
  assert.ok(Array.isArray(source.oneOf))
  const retained = source.oneOf.filter(item => object(item).$ref !== '#/$defs/AttemptStartedSource')
  assert.equal(retained.length, source.oneOf.length - 1)
  source.oneOf = retained
  const reminder = object(defs.SystemReminderMessage)
  assert.ok(Array.isArray(reminder.allOf))
  let changed = 0
  for (const branch of reminder.allOf) {
    const selected = object(branch).if
    if (selected === undefined) continue
    const condition = object(selected)
    const sourceProperties = object(object(object(condition.properties).source).properties)
    const kind = object(sourceProperties.kind)
    if (!Array.isArray(kind.enum) || !kind.enum.includes('attempt_started')) continue
    kind.enum = kind.enum.filter(value => value !== 'attempt_started')
    changed++
  }
  assert.equal(changed, 1)
  assert.deepEqual(current, expected)
}
