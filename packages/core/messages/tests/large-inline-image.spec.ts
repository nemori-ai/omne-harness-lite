import { expect, it } from 'vitest'
import { judgeMessage, validate } from '@omne-harness-lite/messages'

it.each([4 * 1024 * 1024, 4 * 1024 * 1024 + 1])(
  'judges a user message with %i inline image bytes through the real Schema resource graph',
  bytes => {
    const inline = Buffer.alloc(bytes).toString('base64')
    function message(value: string) {
      return {
        id: 'user-image',
        type: 'user',
        createdAt: '2026-09-29T00:00:00Z',
        blocks: [
          {
            id: 'image',
            kind: 'image',
            mediaType: 'image/png',
            visibility: { toHuman: true, toModel: true },
            data: { inline: value },
          },
        ],
      }
    }
    expect(validate('UserMessage', message(inline)).valid).toBe(true)
    expect('ok' in judgeMessage(message(inline))).toBe(true)
    const malformed = message(inline.slice(0, -1) + '!')
    expect(validate('UserMessage', malformed).valid).toBe(false)
    expect('rejected' in judgeMessage(malformed)).toBe(true)
  },
)
