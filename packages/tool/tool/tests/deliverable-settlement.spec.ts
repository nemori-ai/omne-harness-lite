// A result is committed only when every page of it can be read back (I-2 at settlement): a block
// that fits the threshold L in UTF-8 may still exceed the result page once JSON-encoded.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { ok, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const PAGE = 16_384
/** 64 UTF-8 bytes a line; `\t` encodes as two JSON bytes, so the encoded line is 128 bytes. */
const INDENTED_LINE = `${'\t'.repeat(63)}\n`
/** 10 240 UTF-8 bytes, within L = 65 536; 20 480 encoded bytes, over the page. */
const INDENTED_TEXT = INDENTED_LINE.repeat(160)
const encodedBytes = (block: unknown) => Buffer.byteLength(JSON.stringify(block))
const hidden = (id: string, value: string) => ({
  ...text(id, value),
  visibility: { toHuman: true, toModel: false },
})

it('offloads a result within L whose encoded text block exceeds the result page', async () => {
  const f = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('answer', INDENTED_TEXT)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const page = await f.resultPage()
  expect(page.value.original).toMatchObject({
    kind: 'offloaded',
    bodyBytes: String(Buffer.byteLength(INDENTED_TEXT)),
    previewKind: 'mechanical',
  })
  expect(page.next).toBeNull()
  for (const block of page.value.content) expect(encodedBytes(block)).toBeLessThanOrEqual(PAGE)
})

it.each([
  {
    name: 'a block hidden from the model',
    block: hidden('human', INDENTED_TEXT),
  },
  {
    name: 'a native block',
    block: {
      kind: 'file' as const,
      id: text('native', '').id,
      visibility: { toHuman: true, toModel: true },
      ref: {
        storage: 'native-files',
        key: 'x'.repeat(PAGE),
        mediaType: 'text/csv',
        bytes: '1000000',
        digest: 'sha256:native-report',
      },
      transcript: null,
    },
  },
])('refuses at planning $name that no offloading can shrink below the page', async ({ block }) => {
  const f = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('answer', 'small'), block],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(f.planned).toEqual({
    failure: { kind: 'invalid', field: 'content[1]', reason: 'block-exceeds-result-page' },
  })
  expect((await f.load()).result).toBeNull()
})

it('refuses at planning an authored first screen whose hidden block exceeds the page', async () => {
  const f = await settlementFixture({
    resultPageBytes: PAGE,
    value: async (ledger, access) => {
      const sealed = await sealedText(ledger, access, 'the authored body')
      return {
        content: [hidden('human', INDENTED_TEXT), text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: sealed.source, summary: [text('summary', 'brief')] },
      }
    },
  })
  expect(f.planned).toEqual({
    failure: { kind: 'invalid', field: 'content[0]', reason: 'block-exceeds-result-page' },
  })
})

it('keeps inline a result whose every block fits the page', async () => {
  const f = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('answer', INDENTED_LINE.repeat(100)), hidden('human', INDENTED_LINE)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const page = await f.resultPage()
  expect(page.value.original.kind).toBe('none')
  expect(page.value.content).toHaveLength(2)
})

it('refuses at planning a first screen that the configured page cannot carry', async () => {
  const f = await settlementFixture({
    resultPageBytes: 1024,
    value: {
      content: [text('answer', 'line of body text\n'.repeat(4096))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(f.planned).toEqual({
    failure: { kind: 'invalid', field: 'content', reason: 'first-screen-exceeds-result-page' },
  })
})
