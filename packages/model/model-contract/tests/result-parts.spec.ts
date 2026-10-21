import { invocationReference } from './reference-input.ts'
import { expect, it } from 'vitest'
import { ScriptedModelError } from '@omne-harness/model-contract/testing'
import { canonical, validateParts } from '../src/testing/result-pages.ts'
import { judgePart } from '@omne-harness/message'
import type { ResultPart, ResultPage, ResultTrim, Termination } from '@omne-harness/model-contract'
import {
  access,
  admission,
  callRef,
  evidence,
  must,
  operation,
  scriptedProvider,
  textBlock,
  version,
} from './scripted-support.ts'

function bytes(value: unknown): number {
  return Buffer.byteLength(
    JSON.stringify(value, (_key, entry: unknown) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.fromEntries(Object.entries(entry).sort())
        : entry,
    ),
    'utf8',
  )
}
async function setup(capacity = '100000', blocks = '100') {
  const subject = scriptedProvider()
  must(
    await subject.provider.runtime.calls.admit(
      admission('a', { capacity: { bytes: capacity, blocks, attachmentBytes: '0' } }),
    ),
  )
  const read = async () => {
    const started = must(
      await subject.provider.runtime.consumption.beginRead({
        ...access('a'),
        operation: operation('read'),
        result: version('a'),
      }),
    )
    if (started.kind !== 'started' || started.value.kind !== 'reading')
      throw new Error('read fixture')
    return { started, page: started.value.page }
  }
  const settle = (
    parts: readonly ResultPart[],
    target: number,
    termination: Termination = { kind: 'completed', reason: 'limit' },
  ) =>
    subject.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination,
      parts,
      source: evidence('settlement'),
      pageSize: 10,
      pageTargetBytes: target,
    })
  return { ...subject, read, settle }
}
async function rejectsSettlement(
  f: Awaited<ReturnType<typeof setup>>,
  parts: unknown,
  target = 1024,
) {
  const lookup = {
    ...access('a'),
    reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
  }
  const before = await f.provider.runtime.calls.inspect(lookup)
  let rejected: unknown
  try {
    Reflect.apply(f.settle, undefined, [parts, target])
  } catch (error) {
    rejected = error
  }
  expect(rejected).toBeInstanceOf(ScriptedModelError)
  expect(rejected).toMatchObject({ reason: 'invalid-script' })
  expect(await f.provider.runtime.calls.inspect(lookup)).toEqual(before)
  expect(
    await f.provider.runtime.consumption.beginRead({
      ...access('a'),
      operation: operation('read'),
      result: version('a'),
    }),
  ).toMatchObject({ failure: { kind: 'not-settled' } })
}

for (const target of [1, 2, 1024])
  for (const content of ['text', 'thinking', 'voice', 'tool-arguments'] as const) {
    it(`delivers whole oversized sealed and ${content} partial values at page target ${target}`, async () => {
      const f = await setup()
      const partial: ResultPart = {
        kind: 'partial',
        content,
        value: '界'.repeat(1400) + '\ud800',
        trims: [{ removed: '1', reason: 'trim'.repeat(400) }],
      }
      const tool = judgePart({
        kind: 'tool_call',
        id: 'tool',
        visibility: { toHuman: true, toModel: true },
        callId: 'call',
        name: 'demo',
        arguments: { kind: 'string', value: 'x'.repeat(4096) },
      })
      if ('rejected' in tool || tool.ok.kind !== 'tool_call') throw new Error('tool fixture')
      const parts: ResultPart[] = [
        { kind: 'sealed', block: tool.ok, trims: [] },
        { kind: 'sealed', block: textBlock('large', 'x'.repeat(4096)), trims: [] },
        partial,
        { kind: 'partial', content: 'tool-arguments', value: '{}', trims: [] },
      ]
      f.settle(parts, target)
      const read = await f.read()
      const pages: ResultPage[] = [read.page]
      let next = read.page.next
      while (next !== null) {
        const input = { ...access('a'), read: read.started.read, after: next }
        const state = must(await f.provider.runtime.consumption.readNext(input))
        if (state.kind !== 'reading') throw new Error('read ended')
        expect(must(await f.provider.runtime.consumption.readNext(input))).toEqual(state)
        pages.push(state.page)
        next = state.page.next
      }
      expect(pages.map(page => page.parts)).toEqual(parts.map(part => [part]))
      expect(bytes(pages[0]?.parts)).toBeGreaterThan(target)
      for (const page of pages) expect(bytes(page)).toBeLessThanOrEqual(100000)
      expect(
        await f.provider.runtime.consumption.readNext({
          ...access('a'),
          read: read.started.read,
          after: '999',
        }),
      ).toMatchObject({ failure: { field: 'after' } })
    })
  }
it('uses exact canonical-array bytes, freezes the scripted result and refuses an unissued page boundary', async () => {
  const expected: ResultPart[] = [
    { kind: 'partial', content: 'text', value: '界\ud800', trims: [] },
    { kind: 'sealed', block: textBlock('second', 'two'), trims: [] },
    { kind: 'partial', content: 'thinking', value: 'last', trims: [] },
  ]
  for (const target of [bytes(expected.slice(0, 2)) - 1, bytes(expected.slice(0, 2))]) {
    const f = await setup()
    const input = {
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'limit' } as const,
      parts: structuredClone(expected),
      source: evidence('settlement'),
      pageSize: 10,
      pageTargetBytes: target,
    }
    f.controller.settle(input)
    Object.assign(input, { pageSize: 1, pageTargetBytes: 1 })
    Object.assign(input.parts[0] ?? {}, { value: 'tampered' })
    const read = await f.read()
    expect(read.page.parts).toEqual(
      expected.slice(0, target === bytes(expected.slice(0, 2)) ? 2 : 1),
    )
    expect(
      await f.provider.runtime.consumption.readNext({
        ...access('a'),
        read: read.started.read,
        after: '3',
      }),
    ).toMatchObject({ failure: { field: 'after' } })
  }
})
it('rejects invalid page targets, malformed partials and capacity overflow before publishing settlement', async () => {
  const f = await setup('1000')
  for (const target of [0, -1, 1.5, Infinity, NaN]) {
    expect(() => f.settle([], target)).toThrow('pageTargetBytes')
    await rejectsSettlement(f, [], target)
  }
  expect(() =>
    f.settle([{ kind: 'partial', content: 'text', value: 'x'.repeat(2000), trims: [] }], 1),
  ).toThrow('capacity')
  const lookup = must(
    await f.provider.runtime.calls.inspect({
      ...access('a'),
      reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
    }),
  )
  expect(lookup.kind === 'found' && lookup.state.phase).toBe('accepted')
  f.settle([{ kind: 'partial', content: 'text', value: 'kept', trims: [] }], 1)
  expect((await f.read()).page.parts).toEqual([
    { kind: 'partial', content: 'text', value: 'kept', trims: [] },
  ])
})
it('counts long settlement evidence and diagnostics in the complete page hard bound', async () => {
  const f = await setup('8000')
  const termination: Termination = {
    kind: 'failed',
    fault: { cause: 'upstream-protocol', diagnostic: 'x'.repeat(3000), upstreamStatus: null },
  }
  f.controller.settle({
    ...callRef('a'),
    version: version('a'),
    termination,
    parts: [{ kind: 'partial', content: 'text', value: 'kept', trims: [] }],
    source: { ...evidence('settlement'), record: 'e'.repeat(2000) },
    pageSize: 2,
    pageTargetBytes: 1,
  })
  const page = (await f.read()).page
  expect(page.settlement.termination).toEqual(termination)
  expect(page.settlement.source.record).toBe('e'.repeat(2000))
  expect(bytes(page)).toBeLessThanOrEqual(8000)
})
it('refuses malformed parts and trims atomically and accepts the legal successor', async () => {
  const f = await setup()
  const partial = { kind: 'partial', content: 'text', value: 'kept', trims: [] }
  for (const parts of [
    {},
    '',
    [null],
    [{ ...partial, kind: 'invented' }],
    [{ ...partial, content: 'tool_call' }],
    [{ ...partial, value: 1 }],
    [{ ...partial, block: textBlock('invented', 'x') }],
    [{ ...partial, trims: {} }],
    [{ ...partial, trims: '' }],
    [{ ...partial, trims: null }],
    ...[
      null,
      { removed: '1', reason: 'cut', extra: true },
      { removed: 1, reason: 'cut' },
      ...['x1', '1x', '01', '1.a', '-1', ''].map(removed => ({ removed, reason: 'cut' })),
      { removed: '1', reason: 1 },
      { removed: '1', reason: '' },
    ].map(trim => [{ ...partial, trims: [trim] }]),
  ])
    await rejectsSettlement(f, parts)
  const tool = judgePart({
    kind: 'tool_call',
    id: 'tool',
    visibility: { toHuman: true, toModel: true },
    callId: 'call',
    name: 'demo',
    arguments: { kind: 'string', value: '{}' },
  })
  if ('rejected' in tool || tool.ok.kind !== 'tool_call') throw new Error('tool fixture')
  await rejectsSettlement(f, [
    {
      kind: 'sealed',
      block: tool.ok,
      trims: [{ removed: '1', reason: 'cut' }],
    },
  ])
  const parts: ResultPart[] = [
    {
      kind: 'partial',
      content: 'text',
      value: 'kept',
      trims: [
        { removed: '12', reason: 'whole units' },
        { removed: '1.25', reason: 'fractional units' },
      ],
    },
  ]
  f.settle(parts, 1024)
  expect((await f.read()).page.parts).toEqual(parts)
})

it('rejects sparse parts and trims atomically and then delivers the original real trims', async () => {
  const f = await setup()
  const trims: [ResultTrim, ResultTrim] = [
    { removed: '1', reason: 'first' },
    { removed: '2', reason: 'second' },
  ]
  const parts: [ResultPart, ResultPart] = [
    { kind: 'partial', content: 'text', value: 'actual', trims },
    { kind: 'sealed', block: textBlock('sealed', 'complete'), trims },
  ]
  const before = await f.provider.runtime.calls.inspect({
    ...access('a'),
    reference: invocationReference({
      ...access('a'),
      admission: operation('admit-a'),
    }),
  })
  for (const middle of [false, true]) {
    function holes<T>(value: T): T[] {
      const values = [value]
      if (middle) {
        values.length = 3
        values[2] = value
      } else Reflect.deleteProperty(values, '0')
      return values
    }
    const invalidParts = [
      holes(parts[0]),
      ...parts.map(part => [{ ...part, trims: holes(trims[0]) }]),
    ]
    for (const invalid of invalidParts) {
      await rejectsSettlement(f, invalid)
      expect(
        await f.provider.runtime.calls.inspect({
          ...access('a'),
          reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
        }),
      ).toEqual(before)
      expect(
        await f.provider.runtime.consumption.beginRead({
          ...access('a'),
          operation: operation('read'),
          result: version('a'),
        }),
      ).toMatchObject({ failure: { kind: 'not-settled' } })
    }
  }
  f.settle(parts, 100000)
  trims.reverse()
  expect((await f.read()).page.parts).toEqual(
    parts.map(part => ({
      ...part,
      trims: [
        { removed: '1', reason: 'first' },
        { removed: '2', reason: 'second' },
      ],
    })),
  )
})

it('rejects an invalid sealed block without settling and accepts the legal successor', async () => {
  const f = await setup()
  const block = textBlock('valid', 'kept')
  const before = await f.provider.runtime.calls.inspect({
    ...access('a'),
    reference: invocationReference({
      ...access('a'),
      admission: operation('admit-a'),
    }),
  })
  let rejected: unknown
  try {
    Reflect.apply(f.settle, undefined, [
      [{ kind: 'sealed', block: { ...block, id: '' }, trims: [] }],
      1024,
    ])
  } catch (error) {
    rejected = error
  }
  expect(rejected).toBeInstanceOf(ScriptedModelError)
  expect(rejected).toMatchObject({ reason: 'invalid-script' })
  expect(
    await f.provider.runtime.calls.inspect({
      ...access('a'),
      reference: invocationReference({ ...access('a'), admission: operation('admit-a') }),
    }),
  ).toEqual(before)
  expect(
    await f.provider.runtime.consumption.beginRead({
      ...access('a'),
      operation: operation('read'),
      result: version('a'),
    }),
  ).toMatchObject({ failure: { kind: 'not-settled' } })
  const parts: ResultPart[] = [{ kind: 'sealed', block, trims: [] }]
  f.settle(parts, 1024)
  expect((await f.read()).page.parts).toEqual(parts)
})

it('canonical result encoding refuses holes without changing dense array bytes', () => {
  const single: number[] = []
  single.length = 1
  const middle = [1, 2, 3]
  Reflect.deleteProperty(middle, '1')
  for (const value of [single, middle, { nested: [single] }])
    expect(() => canonical(value)).toThrow(
      expect.objectContaining({ name: 'ScriptedModelError', reason: 'invalid-script' }),
    )
  expect(canonical([])).toBe('[]')
  expect(canonical([null])).toBe('[null]')
  expect(canonical([{ z: '界\ud800', a: [true, 'x'] }])).toBe('[{"a":[true,"x"],"z":"界\\ud800"}]')
})

it('enforces aggregate capacity at the independently encoded C and C-1 even when each page fits', async () => {
  const parts: ResultPart[] = ['first', 'second'].map(value => ({
    kind: 'partial',
    content: 'text',
    value: value.repeat(100),
    trims: [],
  }))
  const settlement = {
    version: version('a'),
    termination: { kind: 'completed', reason: 'limit' },
    cursor: '2',
    source: evidence('settlement'),
  }
  // The contract reserves the maximum cursor wrapper in addition to every result part.
  const capacity = bytes({ parts, settlement, next: String(Number.MAX_SAFE_INTEGER) })
  for (const [index, part] of parts.entries())
    expect(bytes({ parts: [part], settlement, next: index === 0 ? '1' : null })).toBeLessThan(1000)
  expect(capacity).toBeGreaterThan(1000)
  for (const limit of [1000, capacity - 1]) {
    const f = await setup(String(limit))
    await rejectsSettlement(f, parts, 1)
    const successor = parts.slice(0, 1)
    f.settle(successor, 1)
    expect((await f.read()).page.parts).toEqual(successor)
  }
  const f = await setup(String(capacity))
  f.settle(parts, 1)
  const first = await f.read()
  expect(first.page.parts).toEqual(parts.slice(0, 1))
  expect(first.page.next).toBe('1')
  expect(
    must(
      await f.provider.runtime.consumption.readNext({
        ...access('a'),
        read: first.started.read,
        after: '1',
      }),
    ),
  ).toEqual({ kind: 'reading', page: { parts: parts.slice(1), settlement, next: null } })
})

it('accepts one result part at blocks 1 and atomically refuses two', async () => {
  const f = await setup('100000', '1')
  const part: ResultPart = { kind: 'partial', content: 'text', value: 'x', trims: [] }
  await rejectsSettlement(f, [part, part], 1)
  f.settle([part], 1)
  expect((await f.read()).page.parts).toEqual([part])
})

it('preserves legal sealed thinking, voice, image and file values without reading media', async () => {
  const f = await setup()
  const visibility = { toHuman: true, toModel: true }
  const parts: ResultPart[] = [
    { kind: 'thinking', id: 'thinking', visibility, text: 'kept thought' },
    { kind: 'voice', id: 'voice', visibility, mediaType: 'audio/wav', inline: 'AA==' },
    { kind: 'image', id: 'image', visibility, mediaType: 'image/png', inline: 'AA==' },
    {
      kind: 'file',
      id: 'file',
      visibility,
      storage: 'unopened',
      key: 'key',
      mediaType: 'text/plain',
    },
  ].map(input => {
    const part = judgePart(input)
    if (
      'rejected' in part ||
      (part.ok.kind !== 'thinking' &&
        part.ok.kind !== 'voice' &&
        part.ok.kind !== 'image' &&
        part.ok.kind !== 'file')
    )
      throw new Error('media fixture')
    return { kind: 'sealed', block: part.ok, trims: [] }
  })
  f.settle(parts, 100000)
  expect((await f.read()).page.parts).toEqual(parts)
})

it('preserves result validation messages and first-failure priority', () => {
  const partial = { kind: 'partial', content: 'text', value: 'kept', trims: [] }
  const cases = [
    { parts: [null], message: 'invalid result part' },
    { parts: [{ ...partial, trims: {}, extra: true }], message: 'invalid result part' },
    { parts: [{ ...partial, trims: [null], extra: true }], message: 'unknown result part field' },
    { parts: [{ ...partial, kind: 'invented', trims: [null] }], message: 'invalid result trim' },
    { parts: [{ ...partial, kind: 'invented' }], message: 'invalid partial result' },
    { parts: [{ kind: 'sealed', block: null, trims: [] }], message: 'invalid sealed result' },
  ]
  for (const { parts, message } of cases)
    expect(() => Reflect.apply(validateParts, undefined, [parts])).toThrow(message)
  const sparse = [partial]
  sparse.length = 2
  expect(() => Reflect.apply(validateParts, undefined, [sparse])).toThrow(
    'parts must be a dense array',
  )
})
