import { expect, it } from 'vitest'
import { LOG_MESSAGE_ROLES, messageIdEquals, parseMessageId } from '@omne-harness/message'

const BODY = 'abcdefghijklmnopqrstuv'
const OTHER = 'abcdefghijklmnopqrstuw'

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

it('parses a msg_ id and rejects empty, prefix, and body failures', () => {
  const parsed = parseMessageId(`msg_${BODY}`)
  expect(parsed).toEqual({ ok: true, value: `msg_${BODY}` })
  expect(parseMessageId('')).toEqual({ ok: false, error: 'empty' })
  expect(parseMessageId(BODY)).toEqual({ ok: false, error: 'prefix' })
  expect(parseMessageId('msg_short')).toEqual({ ok: false, error: 'body' })
  expect(parseMessageId(`msg_${'a'.repeat(21)}`)).toEqual({ ok: false, error: 'body' })
  expect(parseMessageId(`msg_${'a'.repeat(64)}`).ok).toBe(true)
  expect(parseMessageId(`msg_${'a'.repeat(65)}`)).toEqual({ ok: false, error: 'body' })
  expect(parseMessageId(`msg_${BODY}!`)).toEqual({ ok: false, error: 'body' })
})

it('compares parsed ids by exact text', () => {
  const left = parseMessageId(`msg_${BODY}`)
  const right = parseMessageId(`msg_${OTHER}`)
  const same = parseMessageId(`msg_${BODY}`)
  if (!left.ok || !right.ok || !same.ok) throw new Error('expected message ids')
  expect(messageIdEquals(left.value, same.value)).toBe(true)
  expect(messageIdEquals(left.value, right.value)).toBe(false)
})

it('exports exactly the message runtime names, with no mint function and no tool-part helper', async () => {
  const root = (await import('@omne-harness/message')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'LOG_MESSAGE_ROLES',
    'judgeMessage',
    'judgePart',
    'messageIdEquals',
    'parseMessageId',
  ])
})
