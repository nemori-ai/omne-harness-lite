import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createToolBodyScope } from '@omne-harness/tool'
import { settlementFixture } from './settlement-values.ts'
import { jsonLinesFixture } from './structured-body-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, evidence, ok, operationId } from './runtime-values.ts'
import { writeJsonText } from '@omne-harness/json-text'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture(options: Parameters<typeof settlementFixture>[0] = {}) {
  const f = await settlementFixture(options)
  const recovery = ok(await f.ledger.commands.loadRecovery(f.access))
  const definition = recovery.request.availability.definition
  if (
    recovery.start === null ||
    definition.kind !== 'function' ||
    definition.returns.body.kind !== 'text'
  )
    throw new Error('text writer start required')
  return {
    ...f,
    input: { ...f.access, start: recovery.start, source: evidence('writer-guards'), key: 'first' },
    representation: definition.returns.body,
  }
}

it.each(['admission', 'begin', 'append', 'seal'] as const)(
  'does not reuse a saved %s operation for another writer',
  async phase => {
    const f = await fixture()
    const writer = f.ledger.bodyWrites
    let operation = operationId('guard-begin')
    if (phase === 'admission') {
      const record = (await f.records()).find(
        record => record.kind === 'operation' && record.operation.receipt.kind === 'admit',
      )
      if (record?.kind !== 'operation') throw new Error('admission receipt required')
      operation = record.operation.operation
    } else {
      ok(await writer.begin({ ...f.input, operation, representation: f.representation }))
      if (phase === 'append' || phase === 'seal') {
        operation = operationId('guard-append')
        ok(
          await writer.append({
            ...f.input,
            operation,
            sequence: '1',
            frame: { kind: 'text', block: 'one', text: 'kept', end: true },
          }),
        )
      }
      if (phase === 'seal') {
        operation = operationId('guard-seal')
        ok(await writer.seal({ ...f.input, operation, afterSequence: '1' }))
      }
    }
    expect(
      await writer.begin({
        ...f.input,
        key: 'second',
        operation,
        representation: f.representation,
      }),
    ).toHaveProperty('failure.kind', 'conflict')
    expect(await writer.inspect({ ...f.input, key: 'second' })).toHaveProperty(
      'failure.kind',
      'invalid',
    )
  },
)

it('rejects changed source on the same writer begin operation', async () => {
  const f = await fixture()
  const input = {
    ...f.input,
    operation: operationId('same-begin'),
    representation: f.representation,
  }
  const first = ok(await f.ledger.bodyWrites.begin(input))
  expect(ok(await f.ledger.bodyWrites.begin(input))).toEqual(first)
  expect(
    await f.ledger.bodyWrites.begin({ ...input, source: evidence('other-source') }),
  ).toHaveProperty('failure.kind', 'conflict')
})

it('accepts the body size limit and rejects cumulative excess without consuming a sequence', async () => {
  const f = await fixture({ offloading: { ...configuration().offloading, maxBodyBytes: 4 } })
  const writer = f.ledger.bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('size-begin'),
      representation: f.representation,
    }),
  )
  ok(
    await writer.append({
      ...f.input,
      operation: operationId('size-first'),
      sequence: '1',
      frame: { kind: 'text', block: 'one', text: '1234', end: false },
    }),
  )
  const next = { ...f.input, operation: operationId('size-next'), sequence: '2' }
  expect(
    await writer.append({
      ...next,
      frame: { kind: 'text', block: 'one', text: '5', end: true },
    }),
  ).toHaveProperty('failure.kind', 'too-large')
  expect(ok(await writer.inspect(f.input))).toHaveProperty('nextSequence', '2')
  ok(await writer.append({ ...next, frame: { kind: 'text', block: 'one', text: '', end: true } }))
  expect(
    ok(await writer.seal({ ...f.input, operation: operationId('size-seal'), afterSequence: '2' })),
  ).toHaveProperty('bodyBytes', '4')
})

it('reserves an append operation when its admission commits but its reply is lost', async () => {
  const f = await fixture()
  const writer = f.ledger.bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('pending-begin'),
      representation: f.representation,
    }),
  )
  const operation = operationId('pending-append')
  f.interceptCommit(async input => {
    const answer = await f.harness.memory.commit(input)
    if (
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'body-writer-append')
    )
      return { kind: 'unknown', diagnostic: 'append admission reply lost' }
    return answer
  })
  expect(
    await writer.append({
      ...f.input,
      operation,
      sequence: '1',
      frame: { kind: 'text', block: 'one', text: 'pending', end: true },
    }),
  ).toHaveProperty('failure.kind', 'unknown')
  f.interceptCommit(null)
  expect(ok(await writer.inspect(f.input))).toMatchObject({
    nextSequence: '2',
    confirmedThrough: '0',
  })
  expect(
    await writer.begin({
      ...f.input,
      key: 'second',
      operation,
      representation: f.representation,
    }),
  ).toHaveProperty('failure.kind', 'conflict')
})

it('refuses a fresh writer after final settlement without relying on a previous scope close', async () => {
  const f = await fixture()
  ok(await f.preserve())
  expect(
    await f.ledger.bodyWrites.begin({
      ...f.input,
      operation: operationId('settled-begin'),
      representation: f.representation,
    }),
  ).toHaveProperty('failure.kind', 'closed')
})

it.each(['authorBufferBytes', 'authorBufferItems'] as const)(
  'requires positive %s independently of the other buffer limit',
  async name => {
    const f = await fixture()
    expect(() =>
      createToolBodyScope({
        binding: f.input,
        writes: f.ledger.bodyWrites,
        signal: new AbortController().signal,
        limits: { authorBufferBytes: 4096, authorBufferItems: 16, [name]: 0 },
      }),
    ).toThrow('body writer buffers must have positive safe integer limits')
  },
)

it('does not send queued writes to the provider after failed-close handoff', async () => {
  const f = await fixture()
  const scope = createToolBodyScope({
    binding: f.input,
    writes: f.ledger.bodyWrites,
    signal: new AbortController().signal,
    limits: { authorBufferBytes: 4096, authorBufferItems: 16 },
  })
  ok(await scope.writer.begin('first', f.representation))
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<void>()
  const write = f.materialStore.write.bind(f.materialStore)
  vi.spyOn(f.materialStore, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await released.promise
    return write(input)
  })
  const append = scope.writer.append('first', '1', {
    kind: 'text',
    block: 'one',
    text: 'pending',
    end: true,
  })
  const seal = vi.spyOn(f.ledger.bodyWrites, 'seal')
  const queued = scope.writer.seal('first', '1')
  try {
    await entered.promise
    ok(await scope.finish('failed'))
    expect(await append).toHaveProperty('failure.kind', 'unknown')
    expect(await queued).toHaveProperty('failure.kind', 'closed')
    expect(seal).not.toHaveBeenCalled()
  } finally {
    released.resolve()
    await append
    await queued
  }
})

it('keeps the remaining record-page budget after a short first store read', async () => {
  const lines = ['{}', '{}', '{}']
  let firstShortRead = false
  const f = await settlementFixture({
    ...jsonLinesFixture(lines),
    wrapMaterials: store => ({
      ...store,
      read: input => {
        if (!firstShortRead) return store.read(input)
        firstShortRead = false
        return store.read({ ...input, maxBytes: 1 })
      },
    }),
  })
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('body required')
  firstShortRead = true
  const page = ok(
    await f.ledger.reads.body.read({
      ...f.access,
      result: result.result,
      bodyId: result.value.original.bodyId,
      after: null,
      maxBytes: 5,
    }),
  )
  if (page.kind !== 'json-lines') throw new Error('record page required')
  expect(page.records.map(writeJsonText)).toEqual(['{}'])
  expect(page.next).not.toBeNull()
})
