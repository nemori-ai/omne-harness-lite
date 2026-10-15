import { expect, it } from 'vitest'
import { LOG_MESSAGE_ROLES, messageIdEquals, parseMessageId } from '@omne-harness/message'

const BODY = 'abcdefghijklmnopqrstuv'

it('exports the six log roles and does not export a mint function', async () => {
  expect([...LOG_MESSAGE_ROLES]).toEqual([
    'user',
    'assistant',
    'tool',
    'tool_internal',
    'system_reminder',
    'compaction',
  ])
  const root = (await import('@omne-harness/message')) as Record<string, unknown>
  expect(root.mintMessageId).toBeUndefined()
})

it('rejects a string without the msg_ prefix', () => {
  expect(parseMessageId(BODY).ok).toBe(false)
  expect(parseMessageId(`msg_${BODY}`).ok).toBe(true)
})

it('compares parsed ids by exact text', () => {
  const parsed = parseMessageId(`msg_${BODY}`)
  if (!parsed.ok) throw new Error('expected a message id')
  expect(messageIdEquals(parsed.value, parsed.value)).toBe(true)
})
