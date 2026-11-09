import type { ToolBodyPage } from '@omne-harness/tool-contract'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  adoption,
  configuration,
  evidence,
  functionDefinition,
  ok,
  operationId,
  text,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it.each([
  { content: `${'汉'.repeat(2730)}aa`, bytes: '8192', original: 'none' },
  { content: '汉'.repeat(2731), bytes: '8193', original: 'offloaded' },
] as const)('uses UTF-8 bytes at the declared inline boundary: $bytes', async sample => {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  const f = await settlementFixture({
    definition: {
      ...definition,
      returns: {
        ...definition.returns,
        offloading: {
          inline: { kind: 'bounded', maxInlineUtf8Bytes: 8192 },
          retention: { kind: 'bounded', maxRetentionMs: 1_000 },
        },
      },
    },
    value: {
      content: [text('answer', sample.content)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const page = await f.resultPage()
  expect(page.value.original.kind).toBe(sample.original)
  if (sample.original === 'none') {
    expect(page.value.content).toEqual([text('answer', sample.content)])
  } else {
    expect(page.value.original).toMatchObject({
      bodyBytes: '8193',
      previewKind: 'mechanical',
    })
    const visible = page.value.content.flatMap(block =>
      block.kind === 'text' && block.visibility.toModel ? [block.text] : [],
    )
    expect(Buffer.byteLength(visible.join(''), 'utf8')).toBeLessThanOrEqual(8192)
    expect(visible.join('')).not.toBe(sample.content)
    expect(visible.join('')).toContain(
      'Retention: 1000 ms from result publication; reads do not renew it.',
    )
    expect(visible.join('')).toContain(
      'The body may already have expired when this result is delivered.',
    )
    expect(visible.join('')).toMatch(
      /\nUSAGE: Tools\(command="read_result", params=\{"kind":"body","reference":"tb1\.[\x21-\x7e]+( [\x21-\x7e]+){3}","after":null\}\)\n/u,
    )
    expect(visible.join('')).toContain('Read it back with:\nUSAGE: Tools(command="read_result"')
  }
})

it('refuses at startup a system threshold that the header and preview cannot fit', async () => {
  await expect(
    settlementFixture({ offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024 } }),
  ).rejects.toThrow('configuration.offloading: header-and-preview-exceed-threshold')
})

function boundedDefinition() {
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('fixture must define a function')
  return {
    ...definition,
    returns: {
      ...definition.returns,
      offloading: {
        inline: { kind: 'bounded' as const, maxInlineUtf8Bytes: 8192 },
        retention: { kind: 'bounded' as const, maxRetentionMs: 1_000 },
      },
    },
  }
}

const largeResult = () => ({
  content: [text('answer', '汉'.repeat(2731))],
  data: { kind: 'none' as const },
  original: { kind: 'none' as const },
  attachments: [],
})

it('stores only model text as a range-readable UTF-8 body while preserving the other channels', async () => {
  const hidden = { ...text('human', 'human-only'), visibility: { toHuman: true, toModel: false } }
  const f = await settlementFixture({
    definition: boundedDefinition(),
    value: {
      content: [text('first', '汉'.repeat(2731)), hidden, text('last', '🙂\n')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const page = await f.resultPage()
  expect(page.value.content).toContainEqual(hidden)
  expect(page.value.original).toMatchObject({
    kind: 'offloaded',
    bodyBytes: '8198',
    source: { bytes: '8198' },
  })
  if (page.value.original.kind !== 'offloaded') throw new Error('body was not offloaded')
  const entry = (await f.records()).find(
    record => record.kind === 'body-entry' && record.body.state.kind === 'linked',
  )
  if (entry?.kind !== 'body-entry') throw new Error('body was not linked')
  let after: string | null = null
  let restored = ''
  for (let index = 0; index < 4096; index += 1) {
    const part: ToolBodyPage = ok(
      await f.ledger.reads.body.read({
        ...f.access,
        result: page.result,
        bodyId: page.value.original.bodyId,
        after,
        maxBytes: 5,
      }),
    )
    if (part.kind !== 'text') throw new Error('text page expected')
    expect(Buffer.byteLength(part.text, 'utf8')).toBeLessThanOrEqual(5)
    expect(part.text.length).toBeGreaterThan(0)
    restored += part.text
    after = part.next
    if (after === null) break
  }
  expect(after).toBeNull()
  expect(restored).toBe(`${'汉'.repeat(2731)}🙂\n`)
})

it.each([64, 65])('enforces the body hard limit before inline selection: %i bytes', async bytes => {
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 8192, maxBodyBytes: 64 },
    value: {
      content: [text('answer', 'x'.repeat(bytes))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  if (bytes === 64) {
    expect(ok(await f.preserve()).phase).toBe('settled')
    expect((await f.resultPage()).value.original).toEqual({ kind: 'none' })
  } else {
    expect(f.planned).toEqual({
      failure: { kind: 'invalid', field: 'content', reason: 'body-too-large' },
    })
    expect((await f.records()).filter(record => record.kind === 'result')).toEqual([])
  }
})

it.each([{ maxBytes: 128 }, { maxStringLength: 64 }, { maxItems: 2 }, { maxMembers: 2 }])(
  'does not publish an offloaded preview whose read instruction exceeds %j',
  async limit => {
    const f = await settlementFixture({
      readResultArguments: {
        maxBytes: 65_536,
        maxDepth: 32,
        maxItems: 4096,
        maxMembers: 256,
        maxStringLength: 32_768,
        maxNumberLength: 64,
        ...limit,
      },
      offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 8192 },
      value: {
        content: [text('body', 'x'.repeat(9000))],
        original: { kind: 'none' },
        data: { kind: 'none' },
        attachments: [],
      },
    })
    expect(f.planned).toMatchObject({
      failure: {
        kind: 'invalid',
        field: 'readResultArguments',
        reason: 'read-instruction-not-callable',
      },
    })
    expect((await f.records()).some(row => row.kind === 'result')).toBe(false)
  },
)

it('settles equal bodies using each fixed command limit after a definition replacement', async () => {
  const base = boundedDefinition()
  const { parameters, returns, ...metadata } = base
  const definition = (first: number, second: number): ToolDefinition => ({
    ...metadata,
    kind: 'commands',
    encoding: 'wrapped',
    commands: (
      [
        ['first', first],
        ['second', second],
      ] as const
    ).map(([name, limit]) => ({
      name,
      summary: name,
      parameters: { kind: 'declared', value: parameters },
      returns: {
        ...returns,
        offloading: {
          ...returns.offloading,
          inline: { kind: 'bounded', maxInlineUtf8Bytes: limit },
        },
      },
    })),
  })
  const original = definition(2048, 4096)
  const value = { ...largeResult(), content: [text('answer', 'x'.repeat(3072))] }
  const oldFirst = await settlementFixture({ definition: original, command: 'first', value })
  const oldSecond = await settlementFixture({ definition: original, command: 'second', value })
  const replacement = definition(4096, 2048)
  const newFirst = await settlementFixture({ definition: replacement, command: 'first', value })
  const newSecond = await settlementFixture({ definition: replacement, command: 'second', value })
  for (const [fixture, expected, fixed] of [
    [oldFirst, 'offloaded', original],
    [oldSecond, 'none', original],
    [newFirst, 'none', replacement],
    [newSecond, 'offloaded', replacement],
  ] as const) {
    expect((await fixture.load()).request.availability.definition).toEqual(fixed)
    expect(ok(await fixture.preserve()).phase).toBe('settled')
    const result = (await fixture.resultPage()).value
    expect(result.original.kind).toBe(expected)
    if (expected === 'none') expect(result.content).toEqual(value.content)
    else expect(result.original).toMatchObject({ bodyBytes: '3072' })
    expect((await fixture.load()).request.availability.definition).toEqual(fixed)
  }
})
