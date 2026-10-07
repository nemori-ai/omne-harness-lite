import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import { expect, it } from 'vitest'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import { judgeMessage } from '@omne-harness-lite/messages'
import { messageLogPayload, type LogEntry } from '@omne-harness-lite/session-log'
import {
  inspectModelLogEntry,
  inspectModelMessageEntry,
} from '@omne-harness-lite/model-request-runtime'
const tenant = unwrap(parseTenantId({ organization: 'message-org', account: 'message-user' }))
const scope = { session: 'message-session', tenant }
function entry(value: unknown): LogEntry {
  const parsed = judgeMessage(value)
  if ('rejected' in parsed) throw Error('message fixture is invalid')
  const copied = copyJsonValue(messageLogPayload(parsed.ok))
  if ('failed' in copied) throw Error('fixture is not JSON')
  return {
    ...scope,
    session: scope.session as LogEntry['session'],
    position: 1,
    readKeys: ['other-owner/messages'],
    dedupeKey: 'other-owner/key',
    payload: copied.ok,
  }
}
const at = '2026-10-07T00:00:00Z'
it('validates a generic user body and preserves other-owner keys without a history prefix', () => {
  const row = entry({ id: 'user', type: 'user', createdAt: at, blocks: [] })
  const result = inspectModelMessageEntry({ ...scope, entry: row, purpose: { kind: 'message' } })
  expect(result).toMatchObject({ ok: { entry: row } })
  expect(
    inspectModelLogEntry({
      ...scope,
      entry: row,
      purpose: { kind: 'message' },
      messagePrefix: null,
    }),
  ).toEqual({ invalidValue: true, reason: 'message_prefix' })
})
it('checks a compaction body without certifying its historical references', () => {
  const row = entry({
    id: 'compact',
    type: 'compaction',
    createdAt: at,
    blocks: [],
    silenced: [{ messageId: 'missing-message', blockId: 'missing-block' }],
  })
  expect(
    inspectModelMessageEntry({ ...scope, entry: row, purpose: { kind: 'message' } }),
  ).toHaveProperty('ok')
  expect(
    inspectModelLogEntry({ ...scope, entry: row, purpose: { kind: 'message' }, messagePrefix: [] }),
  ).toEqual({ invalidValue: true, reason: 'message_in_log' })
})
it('does not certify forged model namespace keys or execute an entry getter', () => {
  const row = entry({ id: 'user', type: 'user', createdAt: at, blocks: [] })
  expect(
    inspectModelMessageEntry({
      ...scope,
      entry: { ...row, readKeys: ['mrr/3/forged'] },
      purpose: { kind: 'message' },
    }),
  ).toEqual({ invalidValue: true, reason: 'key_set' })
  let calls = 0
  expect(
    inspectModelMessageEntry({
      ...scope,
      entry: {
        get payload() {
          calls++
          return row.payload
        },
      },
      purpose: { kind: 'message' },
    }),
  ).toEqual({ invalidValue: true, reason: 'not_json' })
  expect(calls).toBe(0)
})
it('rejects a fact purpose through the message-only entry', () => {
  expect(
    inspectModelMessageEntry({ ...scope, entry: {}, purpose: { kind: 'record' } as never }),
  ).toEqual({ invalidValue: true, reason: 'purpose' })
})
