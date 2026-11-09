import type { ToolDefinition } from '@omne-harness/tool-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
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
    expect(visible.join('')).toMatch(/\nreference: tb1\.[\x21-\x7e]+( [\x21-\x7e]+){3}\n/u)
    expect(visible.join('')).toContain('Read it back with Tools(command="read_result")')
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
  const body = (await f.records()).find(
    record => record.kind === 'material' && record.material.purpose === 'body',
  )
  if (body?.kind !== 'material') throw new Error('body was not registered')
  expect(body.material.codec).toMatchObject({ name: 'tool-model-text-utf8-v1', revision: '1' })
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let offset: string | null = '0'
  let restored = ''
  for (let index = 0; index < 2048 && offset !== null; index += 1) {
    const request: Parameters<typeof f.materialStore.read>[0] = {
      ...f.access,
      material: body.material.material,
      offset,
      maxBytes: 5,
    }
    const part = ok(await f.materialStore.read(request))
    expect(part.bytes.byteLength).toBeLessThanOrEqual(5)
    expect(part.bytes.byteLength).toBeGreaterThan(0)
    restored += decoder.decode(part.bytes, { stream: part.next !== null })
    offset = part.next
  }
  expect(offset).toBeNull()
  expect(restored).toBe(`${'汉'.repeat(2731)}🙂\n`)
})

it('commits the bounded deadline, body use and preparation release with the result', async () => {
  const f = await settlementFixture({
    definition: boundedDefinition(),
    value: largeResult(),
    offloading: { ...configuration().offloading, maxRetentionMs: 500 },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const page = await f.resultPage()
  expect(page.value.original).toMatchObject({
    kind: 'offloaded',
    retention: {
      activatedAt: '1970-01-01T00:00:00.000Z',
      expiresAt: '1970-01-01T00:00:00.500Z',
    },
  })
  const commits = f.commits.filter(input =>
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
  )
  expect(commits).toHaveLength(1)
  expect(commits[0]?.writes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'put',
        record: expect.objectContaining({
          kind: 'material-use',
          use: expect.objectContaining({
            kind: 'offloaded-body',
            expiresAt: '1970-01-01T00:00:00.500Z',
          }),
        }),
      }),
      expect.objectContaining({
        kind: 'put',
        record: {
          kind: 'material-time',
          time: { highWatermark: '1970-01-01T00:00:00.000Z' },
        },
      }),
    ]),
  )
  expect(
    (await f.records()).filter(
      record => record.kind === 'material-use' && record.use.kind === 'preparation',
    ),
  ).toEqual([])
})

it.each(['unknown-applied', 'unknown-dropped'] as const)(
  'activates the deadline only at the first committed result after %s',
  async fault => {
    let now = '1970-01-01T00:00:01.000Z'
    let mayRead = true
    let clockSamples = 0
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: largeResult(),
      wrapMaterialClock: () => ({
        sample: async () => {
          if (!mayRead) throw new Error('recall must not sample the clock')
          clockSamples += 1
          return succeed(ok(decodeToolMaterialInstant(now)))
        },
      }),
      wrapMaterials: store => ({
        ...store,
        read: input => {
          if (!mayRead) throw new Error('recall must not reload material')
          return store.read(input)
        },
      }),
    })
    let injected = false
    f.interceptCommit(async input => {
      if (
        !injected &&
        input.writes.some(write => write.kind === 'put' && write.record.kind === 'result')
      ) {
        injected = true
        f.harness.memory.injectCommit(fault)
      }
      return f.harness.memory.commit(input)
    })
    expect(await f.preserve()).toHaveProperty('failure.kind', 'commit-unknown')
    const applied = fault === 'unknown-applied'
    const before = await f.records()
    expect(before.filter(record => record.kind === 'result')).toHaveLength(applied ? 1 : 0)
    expect(
      before.filter(
        record => record.kind === 'material-use' && record.use.kind === 'offloaded-body',
      ),
    ).toHaveLength(applied ? 1 : 0)
    now = '1970-01-01T00:00:10.000Z'
    const samplesBeforeRetry = clockSamples
    mayRead = !applied
    expect(ok(await f.preserve()).phase).toBe('settled')
    if (applied) expect(clockSamples).toBe(samplesBeforeRetry)
    mayRead = true
    const page = await f.resultPage()
    expect(page.value.original).toMatchObject({
      kind: 'offloaded',
      retention: {
        activatedAt: applied ? '1970-01-01T00:00:01.000Z' : now,
        expiresAt: applied ? '1970-01-01T00:00:02.000Z' : '1970-01-01T00:00:11.000Z',
      },
    })
    expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(1)
  },
)

it.each([
  { initialLimit: 8192, laterLimit: 6144, original: 'none' },
  { initialLimit: 6144, laterLimit: 8192, original: 'offloaded' },
] as const)(
  'keeps the original policy after interrupted preparation at $initialLimit bytes',
  async sample => {
    let failWrite = true
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: { ...largeResult(), content: [text('answer', 'x'.repeat(7168))] },
      offloading: {
        ...configuration().offloading,
        maxInlineUtf8Bytes: sample.initialLimit,
        maxRetentionMs: 500,
      },
      wrapMaterials: store => ({
        ...store,
        write: input => {
          if (failWrite)
            return Promise.resolve(
              fail({
                kind: 'unavailable' as const,
                dependency: 'material-store',
                diagnostic: 'injected write outage',
              }),
            )
          return store.write(input)
        },
      }),
    })
    expect(await f.preserve()).toHaveProperty('failure.kind', 'unavailable')
    expect((await f.records()).filter(record => record.kind === 'result')).toHaveLength(0)
    failWrite = false
    f.rebuild(
      {
        ...configuration().offloading,
        maxInlineUtf8Bytes: sample.laterLimit,
        maxRetentionMs: 2_000,
      },
      { ...configuration().readResultArguments, maxBytes: 128, maxStringLength: 128 },
    )
    expect(ok(await f.preserve()).phase).toBe('settled')
    const page = await f.resultPage()
    expect(page.value.original.kind).toBe(sample.original)
    if (sample.original === 'offloaded')
      expect(page.value.original).toMatchObject({
        retention: { expiresAt: '1970-01-01T00:00:00.500Z' },
      })
  },
)

it('releases delivery materials without renewing or releasing the independent body use', async () => {
  const f = await settlementFixture({ definition: boundedDefinition(), value: largeResult() })
  const settled = ok(await f.preserve())
  if (settled.phase !== 'settled' || settled.delivery === null) throw new Error('missing delivery')
  const before = (await f.resultPage()).value.original
  const release = {
    ...f.access,
    operation: operationId('consume-preview'),
    result: settled.result,
    delivery: settled.delivery.delivery,
    consumer: settled.delivery.consumer,
    evidence: {
      kind: 'processed' as const,
      completion: evidence('preview-consumed', settled.delivery.consumer.owner),
    },
  }
  ok(await f.ledger.commands.releaseDelivery(release))
  ok(await f.ledger.commands.releaseDelivery(release))
  const records = await f.records()
  const uses = records.filter(record => record.kind === 'material-use')
  expect(uses).toHaveLength(1)
  expect(uses[0]).toMatchObject({
    use: {
      kind: 'offloaded-body',
      expiresAt: '1970-01-01T00:00:01.000Z',
    },
  })
  const result = records.find(record => record.kind === 'result')
  if (result?.kind !== 'result' || result.result.value.original.kind !== 'offloaded')
    throw new Error('missing committed body')
  if (before.kind !== 'offloaded') throw new Error('missing offloaded result')
  expect(result.result.value.original.body.description.retention).toEqual(before.retention)
  expect(result.result.value.original.body.description.source).toEqual(before.source)
})

it('refuses an overflowing deadline without publishing a result or body use', async () => {
  const f = await settlementFixture({
    definition: boundedDefinition(),
    value: largeResult(),
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant('+275760-09-13T00:00:00.000Z'))),
    }),
  })
  expect(await f.preserve()).toMatchObject({
    failure: {
      kind: 'invalid',
      field: 'retention',
      reason: 'expiry-overflow',
    },
  })
  const records = await f.records()
  expect(records.filter(record => record.kind === 'result')).toHaveLength(0)
  expect(
    records.filter(
      record => record.kind === 'material-use' && record.use.kind === 'offloaded-body',
    ),
  ).toHaveLength(0)
  expect(
    records.some(record => record.kind === 'material-use' && record.use.kind === 'preparation'),
  ).toBe(true)
})

it.each([512, 9216].flatMap(bytes => (['file', 'image'] as const).map(kind => ({ bytes, kind }))))(
  'counts only model text and preserves native and program channels: $bytes $kind',
  async ({ bytes, kind }) => {
    const reference = {
      storage: 'native-files',
      key: kind === 'file' ? 'report.csv' : 'chart.png',
      mediaType: kind === 'file' ? 'text/csv' : 'image/png',
      bytes: '1000000',
      digest: 'sha256:native-report',
    }
    const native = {
      kind,
      id: text('native', '').id,
      visibility: { toHuman: true, toModel: true },
      ref: reference,
      transcript: null,
    }
    const human = {
      ...text('human', 'private'.repeat(1000)),
      visibility: { toHuman: true, toModel: false },
    }
    const data = {
      kind: 'json' as const,
      contract: adoption('program'),
      schema: { id: 'program', revision: '1', digest: 'sha256:program' },
      value: { kind: 'number' as const, lexeme: '12345678901234567890' },
    }
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: {
        content: [
          text('a', 'x'.repeat(bytes / 2)),
          native,
          human,
          text('b', 'y'.repeat(bytes / 2)),
        ],
        data,
        original: { kind: 'none' },
        attachments: [reference],
      },
    })
    const settled = ok(await f.preserve())
    if (settled.phase !== 'settled') throw new Error('missing settled result')
    const delivered = ok(await f.ledger.delivery.read({ ...f.access, result: settled.result }))
    expect(delivered.data).toEqual(data)
    expect(delivered.attachments).toEqual([reference])
    expect(
      delivered.content.filter(block => block.id === native.id || block.id === human.id),
    ).toEqual([native, human])
    expect(delivered.original.kind).toBe(bytes <= 8192 ? 'none' : 'offloaded')
    if (delivered.original.kind === 'offloaded')
      expect(delivered.original.bodyBytes).toBe(String(bytes))
  },
)

it('adopts only a same-call sealed author body and preserves its distinct summary', async () => {
  let source: unknown
  const f = await settlementFixture({
    definition: boundedDefinition(),
    value: async (_raw, ledger, access) => {
      const recovery = ok(await ledger.commands.loadRecovery(access))
      if (recovery.start === null) throw new Error('missing start')
      const sealed = ok(
        await ledger.bodyCustody.preserve({
          ...access,
          start: recovery.start,
          operation: operationId('authored-text'),
          source: evidence('author-text'),
          frames: [text('whole', '完整作者正文'.repeat(20))],
        }),
      )
      source = sealed.source
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source: sealed.source,
          summary: [text('summary', '作者摘要')],
        },
      }
    },
  })
  expect(ok(await f.preserve()).phase).toBe('settled')
  const value = (await f.resultPage()).value
  expect(value.content).toEqual([
    {
      ...text('content', 'Answer: 42'),
      text: expect.stringMatching(/^Answer: 42\n\[offloaded body\]\n/u),
    },
  ])
  expect(value.original).toMatchObject({
    kind: 'offloaded',
    source,
    previewKind: 'author-summary',
    summary: [text('summary', '作者摘要')],
    retention: { expiresAt: '1970-01-01T00:00:01.000Z' },
  })
  expect(
    (await f.records()).filter(
      record => record.kind === 'material-use' && record.use.kind === 'preparation',
    ),
  ).toHaveLength(0)
})

it.each(['raw', 'native'] as const)(
  'refuses %s as an unsealed author body without releasing custody',
  async kind => {
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: raw => ({
        content: [text('answer', 'short')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source:
            kind === 'raw'
              ? raw.content
              : {
                  storage: 'native-files',
                  key: 'report.txt',
                  bytes: '128',
                  digest: 'sha256:native-report',
                  mediaType: 'text/plain',
                },
          summary: [text('summary', 'short')],
        },
      }),
    })
    const before = await f.records()
    const preparations = before.filter(
      record => record.kind === 'material-use' && record.use.kind === 'preparation',
    )
    expect(preparations.length).toBeGreaterThan(0)
    expect(await f.preserve()).toEqual({
      failure: {
        kind: 'invalid',
        field: 'original.source',
        reason: 'same-call-sealed-body-required',
      },
    })
    const after = await f.records()
    expect(after).toEqual(expect.arrayContaining(preparations))
    expect(
      after.filter(record => record.kind === 'result' || record.kind === 'material-cleanup'),
    ).toEqual([])
  },
)

it.each(['content', 'summary'] as const)(
  'bounds author %s by the preview budget, not by the inline threshold',
  async channel => {
    const overBudget = 'x'.repeat(8192 / 8 + 1)
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: async (_raw, ledger, access) => ({
        content: [text('answer', channel === 'content' ? overBudget : 'short')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source: (await sealedText(ledger, access)).source,
          summary: [text('summary', channel === 'summary' ? overBudget : 'short')],
        },
      }),
    })
    expect(await f.preserve()).toEqual({
      failure: { kind: 'invalid', field: 'original.summary', reason: 'author-preview-too-large' },
    })
  },
)

it.each(['content', 'summary'] as const)(
  'refuses oversized author %s while retaining the sealed body',
  async channel => {
    const f = await settlementFixture({
      definition: boundedDefinition(),
      value: async (_raw, ledger, access) => ({
        content: [text('answer', channel === 'content' ? '汉'.repeat(683) : 'short')],
        data: { kind: 'none' },
        attachments: [],
        original: {
          kind: 'offloaded',
          source: (await sealedText(ledger, access)).source,
          summary: [text('summary', channel === 'summary' ? '汉'.repeat(683) : 'short')],
        },
      }),
    })
    expect(await f.preserve()).toEqual({
      failure: {
        kind: 'invalid',
        field: 'original.summary',
        reason: 'author-preview-too-large',
      },
    })
    const records = await f.records()
    expect(
      records.filter(record => record.kind === 'result' || record.kind === 'material-cleanup'),
    ).toEqual([])
    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'body-preparation',
          body: expect.objectContaining({ state: expect.objectContaining({ kind: 'sealed' }) }),
        }),
        expect.objectContaining({
          kind: 'material-use',
          use: expect.objectContaining({
            kind: 'preparation',
            operation: operationId('fixture-author-body'),
          }),
        }),
      ]),
    )
  },
)

it('rechecks author sealing after a competing commit removes its registration', async () => {
  const f = await settlementFixture({
    definition: boundedDefinition(),
    value: async (_raw, ledger, access) => ({
      content: [text('answer', 'short')],
      data: { kind: 'none' },
      attachments: [],
      original: {
        kind: 'offloaded',
        source: (await sealedText(ledger, access)).source,
        summary: [text('summary', 'short')],
      },
    }),
  })
  let removed = false
  f.interceptCommit(async input => {
    if (
      !removed &&
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'result')
    ) {
      removed = true
      expect(
        await f.harness.memory.commit({
          ...input,
          writes: [{ kind: 'delete', key: 'body-preparation:fixture-author-body' }],
        }),
      ).toEqual({ kind: 'committed' })
    }
    return f.harness.memory.commit(input)
  })
  expect(await f.preserve()).toEqual({
    failure: {
      kind: 'invalid',
      field: 'original.source',
      reason: 'same-call-sealed-body-required',
    },
  })
  expect(removed).toBe(true)
  expect(
    (await f.records()).filter(
      record => record.kind === 'result' || record.kind === 'material-cleanup',
    ),
  ).toEqual([])
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
    expect(await f.preserve()).toEqual({
      failure: { kind: 'invalid', field: 'content', reason: 'body-too-large' },
    })
    expect(
      (await f.records()).filter(
        record => record.kind === 'result' || record.kind === 'material-cleanup',
      ),
    ).toEqual([])
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
    expect(await f.preserve()).toMatchObject({
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
