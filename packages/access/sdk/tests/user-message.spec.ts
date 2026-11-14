import { expect, it } from 'vitest'
import { userTextMessage } from '../src/user-message.ts'

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

it('fixed (text, inputId) pairs give the fixed value trees', () => {
  for (const [text, inputId, digest] of VECTORS)
    expect(userTextMessage(text, inputId)).toEqual(expected(text, digest))
})
