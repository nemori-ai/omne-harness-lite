import assert from 'node:assert/strict'
import { checkAppendInput, checkLogPayload, type LogEntry } from '@omne-harness-lite/session-log'
import { readJsonStrict } from '@omne-harness-lite/content-blocks'
import { readModelLogEnvelope } from '@omne-harness-lite/model-request-runtime'
import { inspectToolJournalEntry } from '@omne-harness-lite/tool-execution-runtime'
import { DatabaseSync } from 'node:sqlite'

export function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value))
  return value as Record<string, unknown>
}
export function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value))
  return value
}
export function string(value: unknown): string {
  assert.equal(typeof value, 'string')
  return value as string
}
export function one<T>(values: readonly T[], label: string): T {
  assert.equal(values.length, 1, label)
  return values[0]!
}
export function json(text: string): unknown {
  const parsed = readJsonStrict(text)
  assert.ok('ok' in parsed)
  return parsed.ok
}
export function journal(file: string, session: string): LogEntry[] {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db
      .prepare(
        'select position, value from sl_entry where session = ? order by position_length, position',
      )
      .all(session)
      .map(row => {
        const checked = checkAppendInput(
          session,
          [json(string(row.value))],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        )
        assert.ok('ok' in checked)
        const position = json(string(row.position))
        assert.ok(typeof position === 'number')
        return {
          ...one(checked.ok.entries, 'one stored entry'),
          session: checked.ok.session,
          position,
        }
      })
  } finally {
    db.close()
  }
}
export function value(entry: LogEntry): Record<string, unknown> {
  const scope = { tenant: entry.tenant, session: entry.session }
  const tool = inspectToolJournalEntry(scope, entry)
  if ('value' in tool) return object(tool.value)
  assert.ok('unrelated' in tool, 'claimed tool fact must validate')
  const payload = checkLogPayload(entry.payload)
  assert.ok('kind' in payload)
  if (payload.kind === 'message') return object(payload.payload.value)
  const model = readModelLogEnvelope(entry.payload)
  assert.ok(!('failure' in model))
  if (model.kind === 'model') return object(model.envelope.value)
  assert.ok(payload.kind === 'fact', 'remaining entry is an owned fact')
  return object(payload.payload.value)
}
