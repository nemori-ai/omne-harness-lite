// A result is committed only when every page of it can be read back (I-2 at settlement): a block
// that fits the threshold L in UTF-8 may still exceed the result page once JSON-encoded.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, functionDefinition, ok, text } from './runtime-values.ts'

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

it('judges the page bound on the encoded block: equal stays inline, one byte more offloads', async () => {
  const envelope = encodedBytes(text('answer', ''))
  const exact = 'x'.repeat(PAGE - envelope)
  const inline = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('answer', exact)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await inline.preserve())
  expect((await inline.resultPage()).value.original.kind).toBe('none')
  const over = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('answer', `${exact}y`)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await over.preserve())
  expect((await over.resultPage()).value.original.kind).toBe('offloaded')
})

it('keeps an unshrinkable block of exactly one page beside an offloaded body and refuses one byte more', async () => {
  const exact = 'x'.repeat(PAGE - encodedBytes(hidden('human', '')))
  const settle = (value: string) =>
    settlementFixture({
      resultPageBytes: PAGE,
      value: {
        content: [text('answer', INDENTED_TEXT), hidden('human', value)],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      },
    })
  const equal = await settle(exact)
  ok(await equal.preserve())
  const first = await equal.resultPage()
  expect(first.value.original.kind).toBe('offloaded')
  expect(first.value.content.map(block => block.id)).toContain('answer')
  expect((await settle(`${exact}y`)).planned).toEqual({
    failure: { kind: 'invalid', field: 'content[1]', reason: 'block-exceeds-result-page' },
  })
})

it('carries a first screen whose encoded block equals the page and refuses a page one byte smaller', async () => {
  const value = {
    content: [text('answer', 'line of body text\n'.repeat(4096))],
    data: { kind: 'none' as const },
    original: { kind: 'none' as const },
    attachments: [],
  }
  const measured = await settlementFixture({ resultPageBytes: PAGE, value })
  ok(await measured.preserve())
  const [screen] = (await measured.resultPage()).value.content
  const size = encodedBytes(screen)
  const equal = await settlementFixture({ resultPageBytes: size, value })
  ok(await equal.preserve())
  expect((await equal.resultPage()).value.original.kind).toBe('offloaded')
  expect((await settlementFixture({ resultPageBytes: size - 1, value })).planned).toEqual({
    failure: { kind: 'invalid', field: 'content', reason: 'first-screen-exceeds-result-page' },
  })
})

it('collapses every model text block into one first screen whose body is their concatenation', async () => {
  const f = await settlementFixture({
    resultPageBytes: PAGE,
    value: {
      content: [text('a', INDENTED_TEXT), hidden('human', 'private'), text('b', 'tail\n')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const page = await f.resultPage()
  const screens = page.value.content.filter(
    block => block.kind === 'text' && block.visibility.toModel,
  )
  expect(screens.map(block => block.id)).toEqual(['a'])
  expect(page.value.content.map(block => block.id)).toEqual(['a', 'human'])
  expect(page.value.original).toMatchObject({
    kind: 'offloaded',
    bodyBytes: String(Buffer.byteLength(INDENTED_TEXT) + Buffer.byteLength('tail\n')),
    summary: screens,
  })
})

it('refuses model text that is not well-formed Unicode, in a plain result and in an authored summary', async () => {
  const plain = await settlementFixture({
    value: {
      content: [text('answer', 'lone \uD800 surrogate')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(plain.planned).toEqual({
    failure: { kind: 'invalid', field: 'content', reason: 'invalid-unicode-text' },
  })
  const authored = await settlementFixture({
    value: async (ledger, access) => {
      const sealed = await sealedText(ledger, access, 'the authored body')
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source: sealed.source,
          summary: [text('summary', 'bad \uDC00')],
        },
      }
    },
  })
  expect(authored.planned).toEqual({
    failure: { kind: 'invalid', field: 'original.summary', reason: 'invalid-unicode-text' },
  })
})

it('admits an author first screen of exactly P bytes and refuses one byte more', async () => {
  const P = 1024
  const screen = async (bytes: number) =>
    (
      await settlementFixture({
        value: async (ledger, access) => {
          const sealed = await sealedText(ledger, access, 'the authored body')
          return {
            content: [text('content', 'x'.repeat(bytes))],
            data: { kind: 'none' },
            attachments: [],
            original: { kind: 'offloaded', source: sealed.source, summary: [] },
          }
        },
      })
    ).planned
  expect(await screen(P)).toHaveProperty('ok')
  expect(await screen(P + 1)).toEqual({
    failure: { kind: 'invalid', field: 'original.summary', reason: 'author-preview-too-large' },
  })
})

it('refuses to offload under a declaration without a body, and an authored header the read budget cannot carry', async () => {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const bodiless = await settlementFixture({
    definition: { ...definition, returns: { ...definition.returns, body: { kind: 'none' } } },
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048 },
    value: {
      content: [text('answer', 'line\n'.repeat(1000))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(bodiless.planned).toMatchObject({
    failure: {
      kind: 'unsupported',
      reason: 'automatic offloading requires a model body declaration',
    },
  })
  const narrow = await settlementFixture({
    readResultArguments: { ...configuration().readResultArguments, maxBytes: 64 },
    value: async (ledger, access) => {
      const sealed = await sealedText(ledger, access, 'the authored body')
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: sealed.source, summary: [] },
      }
    },
  })
  expect(narrow.planned).toEqual({
    failure: {
      kind: 'invalid',
      field: 'readResultArguments',
      reason: 'read-instruction-not-callable',
    },
  })
})
