import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { userMessage, userMessageId, userTextMessage } from '@omne-harness/session-protocol'

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

const PICTURE = {
  storage: 'local',
  key: 'k1',
  mediaType: 'image/png',
  bytes: '11',
  digest: 'sha256:k1',
}
const RECORDING = { ...PICTURE, key: 'k2', mediaType: 'audio/wav' }
const visibility = object([
  ['toHuman', flag(true)],
  ['toModel', flag(true)],
])
const referring = (kind: string, id: string, ref: typeof PICTURE) =>
  object([
    ['kind', string(kind)],
    ['id', string(id)],
    ['visibility', visibility],
    ['ref', object(Object.entries(ref).map(([key, value]) => [key, string(value)] as const))],
    ['transcript', { kind: 'null' }],
  ])
const blocksOf = (message: unknown) =>
  (message as { entries: { key: string; value: { items: unknown[] } }[] }).entries.find(
    each => each.key === 'blocks',
  )?.value.items

it('a message of words and attachments holds the words first, then each attachment as a block that refers to it', async () => {
  const [text, inputId, digest] = VECTORS[0]
  const message = await userMessage({
    inputId,
    text,
    attachments: [
      { kind: 'image', ref: PICTURE },
      { kind: 'voice', ref: RECORDING },
    ],
  })
  expect(message).toEqual(
    object([
      ['id', string(`msg_${digest}`)],
      ['role', string('user')],
      [
        'blocks',
        {
          kind: 'array',
          items: [
            blocksOf(expected(text, digest))?.[0],
            referring('image', `blk_${digest}_1`, PICTURE),
            referring('voice', `blk_${digest}_2`, RECORDING),
          ],
        },
      ],
    ]),
  )
})

it('attachments alone make a message with no text block; words alone are the text message as before', async () => {
  const [text, inputId, digest] = VECTORS[1]
  const alone = await userMessage({
    inputId,
    text: '',
    attachments: [{ kind: 'file', ref: PICTURE }],
  })
  expect(blocksOf(alone)).toEqual([referring('file', `blk_${digest}_1`, PICTURE)])
  expect(await userMessage({ inputId, text, attachments: [] })).toEqual(expected(text, digest))
  expect(await userMessage({ inputId, text: '', attachments: [] })).toEqual(expected('', digest))
  expect(await userTextMessage(text, inputId)).toEqual(expected(text, digest))
})
