import { expect, it, vi } from 'vitest'
import { createIndependentToolScope } from '@omne-harness/tool'
import {
  defaultResultPolicy,
  renderToolResult,
  decodeToolResultVersion,
} from '@omne-harness/tool-contract/provider'
import { createLocalTextResults } from '@omne-harness/tool-host-local'
import { createMemoryToolContent } from '@omne-harness/tool/testing'
import { writeJsonText } from '@omne-harness/json-text'
import {
  createCalendarToolModule,
  type CalendarToolEnvironment,
} from '@omne-harness/calendar-tools'
import { calendarResolveResultSchema } from '@omne-harness/calendar-contract'
import {
  author,
  argumentsOf,
  context,
  domainError,
  queries,
  value,
  access,
  operationId,
  evidence,
} from './world.ts'

export async function run(
  service: typeof queries,
  input: unknown,
  prepared: CalendarToolEnvironment = {
    calendarContext: { kind: 'ok' as const, value: context() },
  },
) {
  const { operation } = await author(service)
  if (operation.author.kind !== 'ordinary') throw new Error('Expected ordinary author')
  const args = value(operation.author.parameters.parse(argumentsOf(input)))
  const scope = value(
    createIndependentToolScope({
      signal: new AbortController().signal,
      limits: {
        authorBufferBytes: 10000,
        authorBufferItems: 100,
        authorWaitHistoryBytes: 10000,
        authorWaitHistoryItems: 100,
      },
      process: null,
      waits: null,
    }),
  )
  const returned = await operation.author.executor.execute(args, prepared, scope.context)
  value(await scope.finish('returned'))
  const checked = value(operation.author.output.check({ arguments: args, value: returned }))
  const rendered = value(
    renderToolResult(checked, operation.author, createLocalTextResults(), defaultResultPolicy),
  )
  return { operation, returned, rendered }
}

it('routes list/get/effective and all five computations through the minted author', async () => {
  const calls: unknown[] = []
  const service = {
    list: vi.fn(async (...args: Parameters<typeof queries.list>) => {
      calls.push(args)
      return domainError()
    }),
    get: vi.fn(async (...args: Parameters<typeof queries.get>) => {
      calls.push(args)
      return domainError()
    }),
    effective: vi.fn(async (...args: Parameters<typeof queries.effective>) => {
      calls.push(args)
      return domainError()
    }),
    resolve: vi.fn(async (...args: Parameters<typeof queries.resolve>) => {
      calls.push(args)
      return domainError()
    }),
  }
  const inputs = [
    { action: 'list', input: { limit: 3 } },
    { action: 'get', input: { calendarId: 'test' } },
    { action: 'effective' },
    ...[
      { kind: 'day', date: '2026-01-01' },
      { kind: 'count', from: '2026-01-01', to: '2026-01-02' },
      { kind: 'shift', date: '2026-01-01', offset: -1 },
      { kind: 'next', after: '2026-01-01', count: 5 },
      { kind: 'nth', periodStart: '2026-01-01', periodEnd: '2026-01-31', ordinal: 'last' },
    ].map(query => ({
      action: 'resolve',
      input: { selection: { kind: 'effective' }, version: { kind: 'latest' }, query },
    })),
  ]
  for (const input of inputs) {
    const result = await run(service, input)
    expect(result.returned).toEqual(domainError())
    expect(result.rendered.content[0]).toHaveProperty('text', JSON.stringify(domainError()))
  }
  expect(service.list).toHaveBeenCalledOnce()
  expect(service.get).toHaveBeenCalledOnce()
  expect(service.effective).toHaveBeenCalledOnce()
  expect(service.resolve).toHaveBeenCalledTimes(5)
  expect(calls).toEqual(
    inputs.map(input => ('input' in input ? [context(), input.input] : [context()])),
  )
})

it('rejects duplicate JSON keys, identity fields and incomplete arguments at the real codec', async () => {
  const { operation } = await author()
  for (const text of [
    '{"action":"list","action":"effective"}',
    '{"action":"effective","tenant":"other"}',
    '{"action":"list","input":{"authContext":"forged"}}',
  ]) {
    expect(
      operation.author.parameters.parse({ original: text, effective: text, complete: true }),
    ).toHaveProperty('failure.kind', 'invalid')
  }
  expect(
    operation.author.parameters.parse({ ...argumentsOf({ action: 'effective' }), complete: false }),
  ).toHaveProperty('failure.kind', 'incomplete')
})

it('preserves complete calculation basis and long output through public custody and tenant-scoped readback', async () => {
  const basis = {
    calendarId: 'test',
    versionId: 'v1',
    publicationGeneration: 1,
    coverage: { from: '2026-01-01', to: '2026-12-31' },
    inspectedRange: { from: '2026-01-01', to: '2026-01-01' },
    knowledgeAsOf: '2026-01-01T00:00:00.000Z',
    contentHash: 'a'.repeat(64),
    provenanceRefs: ['source-' + '完整'.repeat(50000)],
  }
  const result = calendarResolveResultSchema.parse({
    kind: 'ok',
    value: {
      calendarId: 'test',
      versionId: 'v1',
      coverageStart: '2026-01-01',
      coverageEnd: '2026-12-31',
      result: {
        kind: 'day',
        value: {
          kind: 'ok',
          date: '2026-01-01',
          classification: 'workingDay',
          working: true,
          holiday: false,
          override: false,
          provenanceRefs: basis.provenanceRefs,
          basis,
        },
      },
    },
  })
  const { rendered, operation, returned } = await run(
    { ...queries, resolve: async () => result },
    {
      action: 'resolve',
      input: {
        selection: { kind: 'effective' },
        version: { kind: 'latest' },
        query: { kind: 'day', date: '2026-01-01' },
      },
    },
  )
  expect(rendered.data.kind).toBe('json')
  if (rendered.data.kind !== 'json') throw new Error('Missing structured result')
  expect(JSON.parse(writeJsonText(rendered.data.value))).toEqual(result)
  const bytes = value(operation.author.codec.encode(returned))
  expect(bytes.byteLength).toBeGreaterThan(100000)
  const content = createMemoryToolContent<string>()
  const raw = value(
    await content.custody.preserve({
      ...access(),
      operation: operationId('preserve'),
      codec: operation.author.codec.adoption,
      source: evidence('output'),
      bytes,
    }),
  )
  value(
    await content.custody.retainResult({
      ...access(),
      operation: operationId('retain'),
      raw,
      value: rendered,
    }),
  )
  const read = {
    ...access(),
    result: value(decodeToolResultVersion('result-1')),
    attachment: raw.content,
    after: null,
    maxBytes: bytes.length,
  }
  const page = value(await content.reader.read(read))
  expect(value(operation.author.codec.decode(page.bytes))).toEqual(result)
  expect(await content.reader.read({ ...read, ...access('bob') })).toHaveProperty('failure')
  expect(rendered).not.toHaveProperty('detailRef')
  expect(rendered.original).toEqual({ kind: 'none' })
})

it('does not turn provider exceptions or invalid return shape into a successful result', async () => {
  await expect(
    run(
      {
        ...queries,
        effective: async () => {
          throw new Error('provider disconnected')
        },
      },
      { action: 'effective' },
    ),
  ).rejects.toThrow('provider disconnected')
  const { operation } = await author()
  expect(
    operation.author.output.check({
      arguments: { action: 'effective' },
      value: { kind: 'ok', value: [] },
    }),
  ).toHaveProperty('failure')
})

it('keeps denied or missing trusted environment results intact without calling the service', async () => {
  const effective = vi.fn(queries.effective)
  for (const code of ['forbidden', 'missing_environment'] as const) {
    const result = await run(
      { ...queries, effective },
      { action: 'effective' },
      { calendarContext: domainError(code) },
    )
    expect(result.returned).toEqual(domainError(code))
    expect(result.rendered.content[0]).toHaveProperty('text', JSON.stringify(domainError(code)))
  }
  expect(effective).not.toHaveBeenCalled()
  const { operation } = await author()
  expect(operation.author.codec.decode(new Uint8Array([255]))).toHaveProperty('failure')
})

it('rejects construction injection and invalid encoded results through public outcomes', async () => {
  const module = createCalendarToolModule(queries)
  for (const construction of [
    { kind: 'null' },
    { kind: 'array', items: [] },
    { kind: 'object', entries: [{ key: 'principal', value: { kind: 'string', value: 'forged' } }] },
  ] as const) {
    expect(module.createAuthor(construction)).toMatchObject({
      failure: {
        field: 'construction',
        reason: expect.stringContaining('no construction settings'),
      },
    })
  }
  const { operation, loaded } = await author()
  expect(loaded.definition).toMatchObject({
    backgroundAllowed: false,
    requiredCapabilities: ['calendar.read'],
    declarations: { inputModalities: ['text'], outputModalities: ['text'] },
  })
  expect(operation.author.codec.encode({ kind: 'ok', value: [] })).toMatchObject({
    failure: { reason: expect.any(String) },
  })
  expect(operation.author.codec.decode(new TextEncoder().encode('{}'))).toMatchObject({
    failure: { reason: expect.any(String) },
  })
  expect(operation.author.codec.decode(new Uint8Array([255]))).toMatchObject({
    failure: { reason: 'utf8' },
  })
  if (operation.author.program.kind !== 'json') throw new Error('JSON schema missing')
  const definition = await operation.author.program.schema.ref.load()
  expect(definition).toMatchObject({ engine: 'zod', revision: '1', numbers: 'exact-or-reject' })
})

it('refuses output beyond its declared byte budget without emitting clipped bytes', async () => {
  const { operation } = await author()
  if (operation.returns.program.kind !== 'json') throw new Error('Missing result budget')
  const error = domainError()
  const oversized = {
    ...error,
    error: { ...error.error, message: 'x'.repeat(operation.returns.program.maxBytes) },
  }
  expect(operation.author.codec.encode(oversized)).toEqual({ failure: { reason: 'budget' } })
})
