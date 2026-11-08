import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolLedger, type ToolConfiguration } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { admitCall, auditQueues, startHarness } from './start-values.ts'
import {
  callId,
  configurationOf,
  configuration,
  evidence,
  functionDefinition,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  testSettlementPorts,
  text,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('admits author output during the durable start intent before recordStart returns', async () => {
  let sealed = false
  const h = startHarness({
    bindingPort: base => ({
      ...base,
      start: async (input, environment) => {
        const definition = input.request.availability.definition
        if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
          throw new Error('text required')
        expect(ok(await h.ledger.commands.loadRecovery(input)).state.phase).toBe('starting')
        const binding = { ...input, source: evidence('starting-writer'), key: 'starting' }
        ok(
          await h.ledger.bodyWrites.begin({
            ...binding,
            operation: operationId('starting-begin'),
            representation: definition.returns.body,
          }),
        )
        expect(
          ok(
            await h.ledger.bodyWrites.seal({
              ...binding,
              operation: operationId('starting-seal'),
              afterSequence: '0',
            }),
          ),
        ).toHaveProperty('bodyBytes', '0')
        sealed = true
        return base.start(input, environment)
      },
    }),
  })
  await admitCall(h, 'starting-writer')
  await h.drive('starting-writer')
  expect(sealed).toBe(true)
})

it('recovers an unknown append from durable input after the caller changes its buffer', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const writer = f.rebuild().bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('begin-recovery'),
      representation: definition.returns.body,
    }),
  )
  const write = f.ports.materials.store.write.bind(f.ports.materials.store)
  const writes = vi.spyOn(f.ports.materials.store, 'write').mockImplementationOnce(async input => {
    await write(input)
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  const frame = { kind: 'text', block: 'only', text: '正文🙂', end: true } as const
  expect(
    await writer.append({
      ...f.input,
      operation: operationId('unknown-append'),
      sequence: '1',
      frame,
    }),
  ).toHaveProperty('failure.kind', 'unknown')
  Reflect.set(frame, 'text', 'caller replaced this buffer')
  const restored = f.rebuild().bodyWrites
  expect(ok(await restored.inspect(f.input))).toEqual({
    kind: 'open',
    nextSequence: '2',
    confirmedThrough: '0',
  })
  expect(
    ok(await restored.reconcile({ ...f.access, start: f.input.start, maxOperations: 1 })),
  ).toMatchObject({ examined: 1, pending: 0 })
  const body = ok(
    await restored.seal({
      ...f.input,
      operation: operationId('seal-recovery'),
      afterSequence: '1',
    }),
  )
  expect(body.bodyBytes).toBe('10')
  expect(writes).toHaveBeenCalledTimes(2)
  expect(new TextDecoder().decode(writes.mock.calls[1]?.[0].bytes)).toBe('正文🙂')
  const stored = await f.harness.memory.read({
    kind: 'call',
    tenant: f.access.tenant,
    call: f.access.call,
  })
  if (stored.kind !== 'complete') throw new Error('unreadable fixture')
  const append = stored.records.find(record => record.kind === 'body-writer-append')
  expect(append).toHaveProperty('append.state.kind', 'retained')
  expect(append).not.toHaveProperty('append.state.payload')
})

it('does not reinterpret a begin operation as scope closure', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const writer = f.rebuild().bodyWrites
  const operation = operationId('begin-is-not-close')
  ok(await writer.begin({ ...f.input, operation, representation: definition.returns.body }))
  expect(await writer.close({ ...f.input, operation, exit: 'failed' })).toHaveProperty(
    'failure.kind',
    'conflict',
  )
  expect(
    ok(
      await writer.append({
        ...f.input,
        operation: operationId('still-open'),
        sequence: '1',
        frame: { kind: 'text', block: 'one', text: 'kept open', end: true },
      }),
    ),
  ).toHaveProperty('nextSequence', '2')
})

it('keeps one winner when concurrent appends claim the same sequence', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const writer = f.rebuild().bodyWrites
  const begin = {
    ...f.input,
    operation: operationId('race-begin'),
    representation: definition.returns.body,
  }
  const started = ok(await writer.begin(begin))
  expect(ok(await writer.begin(begin))).toEqual(started)
  const contenders = ['first', 'other'].map(value => ({
    ...f.input,
    operation: operationId(`race-${value}`),
    sequence: '1',
    frame: { kind: 'text', block: 'one', text: value, end: true } as const,
  }))
  const results = await Promise.all(contenders.map(input => writer.append(input)))
  expect(results.filter(result => 'ok' in result)).toHaveLength(1)
  expect(results.filter(result => 'failure' in result)).toMatchObject([
    { failure: { kind: 'conflict' } },
  ])
  expect(ok(await writer.inspect(f.input))).toMatchObject({
    nextSequence: '2',
    confirmedThrough: '1',
  })
  const index = results.findIndex(result => 'ok' in result)
  const winner = contenders[index]
  if (winner === undefined) throw new Error('missing winning input')
  expect(await writer.append(winner)).toEqual(results[index])
  expect(
    ok(await writer.seal({ ...f.input, operation: operationId('race-seal'), afterSequence: '1' })),
  ).toHaveProperty('bodyBytes', '5')
})

it('refuses to publish a writer source as a process file reference', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text required')
  const ledger = f.rebuild()
  ok(
    await ledger.bodyWrites.begin({
      ...f.input,
      operation: operationId('process-begin'),
      representation: definition.returns.body,
    }),
  )
  const body = ok(
    await ledger.bodyWrites.seal({
      ...f.input,
      operation: operationId('process-seal'),
      afterSequence: '0',
    }),
  )
  const batch = {
    start: f.input.start,
    source: evidence('process-source'),
    batch: 'body-reference',
    after: null,
    cursor: 'end',
    events: [
      {
        event: 'process-1',
        fact: {
          kind: 'process',
          blocks: [
            {
              index: 'file',
              mode: 'replace',
              state: 'closed',
              sequence: '1',
              trim: null,
              content: {
                kind: 'file',
                id: text('file', '').id,
                visibility: { toHuman: true, toModel: true },
                ref: body.source,
                transcript: null,
              },
            },
          ],
        },
      },
    ],
  } as const
  expect(
    await ledger.commands.receiveFacts({ ...f.access, start: f.input.start, batch }),
  ).toHaveProperty('failure.reason', 'temporary-body-source-is-not-a-native-resource')
  expect(ok(await ledger.commands.loadRecovery(f.access)).streams).toEqual([])
})

it('checks current qualification before storage on every writer entry', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text required')
  const writer = f.rebuild().bodyWrites
  const input = { ...f.input, principal: principalB, operation: operationId('denied-writer') }
  const read = vi
    .spyOn(f.harness.memory, 'read')
    .mockRejectedValue(new Error('storage unavailable'))
  try {
    const answers = await Promise.all([
      writer.begin({ ...input, representation: definition.returns.body }),
      writer.append({
        ...input,
        sequence: '1',
        frame: { kind: 'text', block: 'one', text: 'hidden', end: true },
      }),
      writer.seal({ ...input, afterSequence: '0' }),
      writer.inspect(input),
      writer.close({ ...input, exit: 'failed' }),
      writer.reconcile({ ...input, maxOperations: 1 }),
    ])
    for (const answer of answers) expect(answer).toHaveProperty('failure.kind', 'denied')
    expect(read).not.toHaveBeenCalled()
  } finally {
    read.mockRestore()
  }
})

it('recognizes the same close but rejects a changed durable source', async () => {
  const f = await fixture()
  const close = { ...f.input, operation: operationId('close-source'), exit: 'failed' } as const
  const receipt = ok(await f.rebuild().bodyWrites.close(close))
  expect(ok(await f.rebuild().bodyWrites.close(close))).toEqual(receipt)
  expect(
    await f.rebuild().bodyWrites.close({ ...close, source: evidence('different-close-source') }),
  ).toHaveProperty('failure.kind', 'conflict')
})

async function fixture(configuration: Partial<ToolConfiguration> = {}) {
  const harness = startHarness()
  await admitCall(harness, 'body-writer')
  await harness.drive('body-writer')
  const access = { principal: principalA, tenant: tenantA, call: callId('body-writer') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('missing start')
  const ports = testSettlementPorts(harness.memory)
  const rebuild = () =>
    createToolLedger(
      harness.memory,
      guards(),
      createMemoryToolClock(),
      { ...configurationOf({}), ...configuration },
      ports,
    )
  const input = {
    ...access,
    start: recovery.start,
    source: evidence('author-body-writer'),
    key: 'answer',
  }
  return { harness, ports, rebuild, access, input, request: recovery.request }
}

it('rejects excess staging without consuming sequence and resumes after durable recovery', async () => {
  const f = await fixture({ authorBufferBytes: 256, authorBufferItems: 1 })
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const writer = f.rebuild().bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('bounded-begin'),
      representation: definition.returns.body,
    }),
  )
  vi.spyOn(f.ports.materials.store, 'write').mockImplementationOnce(async input =>
    fail({ kind: 'commit-unknown', operation: input.operation }),
  )
  const first = {
    ...f.input,
    operation: operationId('bounded-first'),
    sequence: '1',
    frame: { kind: 'text', block: 'a', text: 'first', end: true },
  } as const
  expect(await writer.append(first)).toHaveProperty('failure.kind', 'unknown')
  const second = {
    ...f.input,
    operation: operationId('bounded-second'),
    sequence: '2',
    frame: { kind: 'text', block: 'b', text: 'second', end: true },
  } as const
  expect(await writer.append(second)).toHaveProperty('failure.kind', 'capacity')
  expect(ok(await writer.inspect(f.input))).toHaveProperty('nextSequence', '2')
  ok(
    await f.rebuild().bodyWrites.reconcile({ ...f.access, start: f.input.start, maxOperations: 1 }),
  )
  const receipt = ok(await writer.append(second))
  expect(receipt.nextSequence).toBe('3')
  expect(ok(await writer.append(second))).toEqual(receipt)
  expect(
    await writer.append({ ...second, frame: { ...second.frame, text: 'different' } }),
  ).toHaveProperty('failure.kind', 'conflict')
  expect(
    ok(
      await writer.seal({ ...f.input, operation: operationId('bounded-seal'), afterSequence: '2' }),
    ),
  ).toHaveProperty('bodyBytes', '11')
})

it('recovers an admitted seal after closure without admitting another writer', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const writer = f.rebuild().bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('close-recovery-begin'),
      representation: definition.returns.body,
    }),
  )
  ok(
    await writer.append({
      ...f.input,
      operation: operationId('close-recovery-append'),
      sequence: '1',
      frame: { kind: 'text', block: 'one', text: 'retained after close', end: true },
    }),
  )
  const write = f.ports.materials.store.write.bind(f.ports.materials.store)
  vi.spyOn(f.ports.materials.store, 'write').mockImplementationOnce(async input => {
    await write(input)
    return fail({ kind: 'commit-unknown', operation: input.operation })
  })
  const seal = { ...f.input, operation: operationId('close-recovery-seal'), afterSequence: '1' }
  expect(await writer.seal(seal)).toHaveProperty('failure.kind', 'unknown')
  const close = {
    ...f.input,
    operation: operationId('close-recovery-close'),
    exit: 'returned',
  } as const
  expect(ok(await writer.close(close))).toMatchObject({
    pendingOperations: [seal.operation],
    unsealedKeys: ['answer'],
  })
  expect(
    await writer.begin({
      ...f.input,
      key: 'another',
      operation: operationId('after-close-begin'),
      representation: definition.returns.body,
    }),
  ).toHaveProperty('failure.kind', 'closed')
  const restored = f.rebuild().bodyWrites
  expect(
    ok(await restored.reconcile({ ...f.access, start: f.input.start, maxOperations: 1 })),
  ).toMatchObject({ examined: 1, pending: 0 })
  const body = ok(await restored.seal(seal))
  expect(body.bodyBytes).toBe('20')
  expect(ok(await restored.inspect(f.input))).toEqual({ kind: 'sealed', body })
  const closed = ok(await restored.close(close))
  expect(closed.pendingOperations).toEqual([])
  expect(closed.unsealedKeys).toEqual([])
})

it('adopts a writer body into paged results and starts retention at publication', async () => {
  let now = 100
  const definition = functionDefinition()
  if (definition.kind !== 'function') throw new Error('function definition required')
  const f = await settlementFixture({
    definition: {
      ...definition,
      returns: {
        ...definition.returns,
        offloading: {
          inline: { kind: 'system' },
          retention: { kind: 'bounded', maxRetentionMs: 1000 },
        },
      },
    },
    offloading: { ...configuration().offloading, maxRetentionMs: 1000 },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    value: async (_raw, ledger, access) => {
      const recovery = ok(await ledger.commands.loadRecovery(access))
      if (
        recovery.start === null ||
        recovery.request.availability.definition.kind !== 'function' ||
        recovery.request.availability.definition.returns.body.kind !== 'text'
      )
        throw new Error('function start required')
      const input = {
        ...access,
        start: recovery.start,
        source: evidence('paged-writer'),
        key: 'answer',
      }
      ok(
        await ledger.bodyWrites.begin({
          ...input,
          operation: operationId('paged-begin'),
          representation: recovery.request.availability.definition.returns.body,
        }),
      )
      ok(
        await ledger.bodyWrites.append({
          ...input,
          operation: operationId('paged-append'),
          sequence: '1',
          frame: { kind: 'text', block: 'one', text: '甲🙂乙', end: true },
        }),
      )
      const body = ok(
        await ledger.bodyWrites.seal({
          ...input,
          operation: operationId('paged-seal'),
          afterSequence: '1',
        }),
      )
      expect(body).not.toHaveProperty('retention')
      return {
        content: [text('answer', '摘要')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: body.source, summary: [text('summary', '摘要')] },
      }
    },
  })
  now = 5000
  expect(ok(await f.preserve()).phase).toBe('settled')
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('offloaded body required')
  expect(result.value.original.retention.expiresAt).toBe('1970-01-01T00:00:06.000Z')
  const input = {
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null,
    maxBytes: 4,
  }
  const first = ok(await f.ledger.reads.body.read(input))
  expect(first.text).toBe('甲')
  const second = ok(await f.ledger.reads.body.read({ ...input, after: first.next }))
  expect(second.text).toBe('🙂')
  const third = ok(await f.ledger.reads.body.read({ ...input, after: second.next }))
  expect(third.text).toBe('乙')
  expect(third.next).toBeNull()
  now = 6000
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'not-found')
  expect(
    (await f.records()).filter(
      record => record.kind === 'material-use' && record.use.kind === 'preparation',
    ),
  ).toEqual([])
})

it('preserves ordered text fragments across reconstruction and seals one readable body', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text declaration required')
  const first = f.rebuild().bodyWrites
  expect(
    ok(
      await first.begin({
        ...f.input,
        operation: operationId('body-begin'),
        representation: definition.returns.body,
      }),
    ),
  ).toMatchObject({ key: 'answer', nextSequence: '1' })
  expect(
    ok(
      await first.append({
        ...f.input,
        operation: operationId('body-frame-1'),
        sequence: '1',
        frame: { kind: 'text', block: 'one', text: '正文', end: false },
      }),
    ),
  ).toHaveProperty('nextSequence', '2')
  const reconstructed = f.rebuild().bodyWrites
  expect(
    ok(
      await reconstructed.append({
        ...f.input,
        operation: operationId('body-frame-2'),
        sequence: '2',
        frame: { kind: 'text', block: 'one', text: '🙂\nend', end: true },
      }),
    ),
  ).toHaveProperty('nextSequence', '3')
  const body = ok(
    await reconstructed.seal({
      ...f.input,
      operation: operationId('body-seal'),
      afterSequence: '2',
    }),
  )
  expect(body.bodyBytes).toBe('14')
  expect(body).not.toHaveProperty('retention')
  expect(ok(await f.rebuild().bodyWrites.inspect(f.input))).toEqual({ kind: 'sealed', body })
  expect(
    ok(await f.rebuild().bodyCustody.inspect({ ...f.input, operation: operationId('body-seal') })),
  ).toEqual({ kind: 'sealed', body })
  const stored = await f.harness.memory.read({
    kind: 'call',
    tenant: f.access.tenant,
    call: f.access.call,
  })
  if (stored.kind !== 'complete') throw new Error('unreadable fixture')
  const material = stored.records.find(
    record => record.kind === 'material' && record.material.purpose === 'body',
  )
  if (material?.kind !== 'material') throw new Error('missing body material')
  const page = ok(
    await f.ports.materials.store.read({
      ...f.access,
      material: material.material.material,
      offset: '0',
      maxBytes: 32,
    }),
  )
  expect(new TextDecoder('utf-8', { fatal: true }).decode(page.bytes)).toBe('正文🙂\nend')
  expect(page.next).toBeNull()
})

it('keeps open and sealed unassociated writers discoverable in the durable maintenance inventory', async () => {
  const f = await fixture()
  const definition = f.request.availability.definition
  if (definition.kind !== 'function' || definition.returns.body.kind !== 'text')
    throw new Error('text required')
  const hint = async () => {
    const read = await f.harness.memory.read({ kind: 'call', ...f.access })
    if (read.kind !== 'complete') throw new Error('unreadable fixture')
    return read.records.find(record => record.kind === 'material-maintenance-hint')
  }
  const writer = f.rebuild().bodyWrites
  ok(
    await writer.begin({
      ...f.input,
      operation: operationId('inventory-begin'),
      representation: definition.returns.body,
    }),
  )
  expect(await hint()).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
  ok(
    await writer.seal({ ...f.input, operation: operationId('inventory-seal'), afterSequence: '0' }),
  )
  expect(await hint()).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
})
