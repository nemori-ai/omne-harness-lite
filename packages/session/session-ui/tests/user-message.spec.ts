// The page builds the `send-input` message with WebCrypto; the SDK builds it with `node:crypto`.
// Both are held to the same vectors, here and in `packages/access/sdk/tests/user-message.spec.ts`.
import { expect, it } from 'vitest'
import { userMessageId, userTextMessage } from '../src/model/user-message.ts'

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

it('U1 写定的 (text, inputId) 得到写定的值树', async () => {
  for (const [text, inputId, digest] of VECTORS)
    expect(await userTextMessage(text, inputId)).toEqual(expected(text, digest))
})

it('U2 消息编号与值树里的 id 相同', async () => {
  const tree = await userTextMessage('x', 'input-1')
  const id = tree.entries.find(entry => entry.key === 'id')?.value
  expect(id).toEqual({ kind: 'string', value: await userMessageId('input-1') })
})
