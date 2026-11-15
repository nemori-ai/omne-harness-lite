import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { userMessageId, userTextMessage } from '@omne-harness/session-protocol'

const VECTORS = [
  ['你好', '0b9f3c1e-2d0a-4a43-9a43-0e0c7c8f0a11', 'PvVx7o2LLpjzz5WwHxSAndt5Y9el1x4ykpOp7Mchb_E'],
  ['-- multi\nline --', 'input-9', 'TZ6VjVgckoiO7Xuzs6ICbz1ZIKAFI3W5DS13oT-XdSo'],
] as const

const string = (value: string) => ({ kind: 'string', value })
const flag = (value: boolean) => ({ kind: 'boolean', value })
const object = (entries: readonly (readonly [string, unknown])[]) => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key, value })),
})

const expected = (text: string, digest: string) =>
  object([
    ['id', string(`msg_${digest}`)],
    ['role', string('user')],
    [
      'blocks',
      {
        kind: 'array',
        items: [
          object([
            ['kind', string('text')],
            ['id', string(`blk_${digest}`)],
            [
              'visibility',
              object([
                ['toHuman', flag(true)],
                ['toModel', flag(true)],
              ]),
            ],
            ['text', string(text)],
          ]),
        ],
      },
    ],
  ])

it('fixed (text, inputId) pairs give the fixed value trees', async () => {
  for (const [text, inputId, digest] of VECTORS)
    expect(await userTextMessage(text, inputId)).toEqual(expected(text, digest))
})

it('derives the identifiers from the SHA-256 of the input id, across block boundaries', async () => {
  const ids = [0, 1, 54, 55, 56, 63, 64, 65, 119, 120, 1000].map(length =>
    Array.from({ length }, (_, index) => String.fromCharCode(97 + (index % 26))).join(''),
  )
  for (const inputId of [...ids, '界'.repeat(40), '🙂-input']) {
    const digest = createHash('sha256').update(inputId, 'utf8').digest('base64url')
    expect(await userTextMessage('x', inputId)).toEqual(expected('x', digest))
    expect(await userMessageId(inputId)).toBe(`msg_${digest}`)
  }
})
