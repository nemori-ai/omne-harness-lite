import { expect, test, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createSessionImageBytes } from '../src/session-image-bytes.ts'

function message(visible = true) {
  const result = judgeMessage({
    id: 'image-tool',
    type: 'tool',
    callId: 'image-call',
    createdAt: '2026-10-10T00:00:00Z',
    blocks: [
      {
        id: 'result',
        kind: 'tool_result',
        callId: 'image-call',
        outcome: 'completed',
        visibility: { toHuman: true, toModel: visible },
        blocks: [
          {
            id: 'image',
            kind: 'image',
            mediaType: 'image/png',
            visibility: { toHuman: true, toModel: true },
            data: { storage: 'cli-tool-results', key: 'image', bytes: 3, mediaType: 'image/png' },
          },
        ],
      },
    ],
  })
  if (!('ok' in result)) throw new Error('invalid test message')
  return result.ok
}
test('reads fixed bytes without changing the original history messages', async () => {
  const original = [message()]
  const source = new Uint8Array([1, 2, 3])
  const read = vi.fn(async () => source)
  const prepare = createSessionImageBytes(read, { maxImages: 8, maxBytes: 10 })
  const result = await prepare(original)
  source.fill(9)
  expect(result).toMatchObject({
    imageBytes: [{ reference: { key: 'image' }, bytes: new Uint8Array([1, 2, 3]) }],
  })
  expect(original[0]!.blocks[0]).toMatchObject({ blocks: [{ data: { key: 'image' } }] })
  expect(read).toHaveBeenCalledTimes(1)
})
test('does not read images hidden by their parent', async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const original = [message(false)]
  expect(await createSessionImageBytes(read, { maxImages: 1, maxBytes: 1 })(original)).toEqual({
    imageBytes: [],
  })
  expect(read).not.toHaveBeenCalled()
})
test('refuses oversized content before IO and unavailable or inconsistent bytes before model use', async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2]))
  await expect(
    createSessionImageBytes(read, { maxImages: 1, maxBytes: 2 })([message()]),
  ).rejects.toThrow('limit')
  expect(read).not.toHaveBeenCalled()
  expect(await createSessionImageBytes(read, { maxImages: 1, maxBytes: 3 })([message()])).toEqual({
    unavailable: true,
  })
})

test('resolves visible media renderings and applies limits before reading them', async () => {
  const nested = message().blocks[0]!
  if (nested.kind !== 'tool_result') throw new Error('test result required')
  const parsed = judgeMessage({
    id: 'rendered',
    type: 'user',
    createdAt: '2026-10-10T00:00:00Z',
    blocks: [
      {
        id: 'voice',
        kind: 'voice',
        mediaType: 'audio/wav',
        data: { inline: 'AQID' },
        visibility: { toHuman: true, toModel: true },
        transcript: 'Original audio',
        renderings: [{ producedBy: 'system', blocks: nested.blocks }],
      },
    ],
  })
  if (!('ok' in parsed)) throw new Error('valid rendering required')
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]))
  await expect(
    createSessionImageBytes(read, { maxImages: 1, maxBytes: 2 })([parsed.ok]),
  ).rejects.toThrow('limit')
  expect(read).not.toHaveBeenCalled()
  expect(
    await createSessionImageBytes(read, { maxImages: 1, maxBytes: 3 })([parsed.ok]),
  ).toMatchObject({
    imageBytes: [{ reference: { key: 'image' }, bytes: new Uint8Array([1, 2, 3]) }],
  })
  const hidden = judgeMessage({
    ...parsed.ok,
    blocks: parsed.ok.blocks.map(block => ({
      ...block,
      visibility: { toHuman: true, toModel: false },
    })),
  })
  if (!('ok' in hidden)) throw new Error('valid hidden rendering required')
  read.mockClear()
  expect(await createSessionImageBytes(read, { maxImages: 1, maxBytes: 1 })([hidden.ok])).toEqual({
    imageBytes: [],
  })
  expect(read).not.toHaveBeenCalled()
})
