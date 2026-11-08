import { textPage } from './body-read-values.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeToolBodyId,
  decodeToolResultVersion,
  decodeToolMaterialInstant,
} from '@omne-harness/tool-contract/provider'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, ok, text, principalB, operationId, evidence } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function bodyFixture(options: Parameters<typeof settlementFixture>[0] = {}) {
  const f = await settlementFixture({
    ...options,
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024, ...options.offloading },
    value: options.value ?? {
      content: [text('body', '中🙂'.repeat(150))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('expected offloaded body')
  return {
    f,
    input: {
      ...f.access,
      result: result.result,
      bodyId: result.value.original.bodyId,
      after: null,
      maxBytes: 8,
    },
  }
}

const instant = (ms: number) => ok(decodeToolMaterialInstant(new Date(ms).toISOString()))

it('distinguishes a known unsettled call from a missing result without reading material', async () => {
  const f = await settlementFixture()
  const read = vi.spyOn(f.materialStore, 'read')
  expect(
    await f.ledger.reads.body.read({
      ...f.access,
      result: ok(decodeToolResultVersion('v1')),
      bodyId: ok(decodeToolBodyId('body-not-yet-settled')),
      after: null,
      maxBytes: 64,
    }),
  ).toEqual({ failure: { kind: 'not-settled' } })
  expect(read).not.toHaveBeenCalled()
})

it('rejects invalid UTF-8 without replacement text and releases its page lease', async () => {
  let corrupt = false
  const { f, input } = await bodyFixture({
    wrapMaterials: store => ({
      ...store,
      read: async request =>
        corrupt
          ? succeed({ bytes: new Uint8Array([0xff]), next: String(BigInt(request.offset) + 1n) })
          : store.read(request),
    }),
  })
  corrupt = true
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'unavailable')
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toHaveLength(0)
})

it('returns one empty final page for an explicitly sealed empty body', async () => {
  const { f, input } = await bodyFixture({
    value: async (_raw, ledger, access) => ({
      content: [],
      data: { kind: 'none' },
      attachments: [],
      original: {
        kind: 'offloaded',
        source: (await sealedText(ledger, access, '')).source,
        summary: [text('summary', 'empty body')],
      },
    }),
  })
  expect(ok(await f.ledger.reads.body.read(input))).toMatchObject({
    text: '',
    position: '0',
    bodyBytes: '0',
    next: null,
  })
})

it('applies the system page cap even when the caller requests more bytes', async () => {
  const { f, input } = await bodyFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024, maxPageBytes: 4 },
  })
  const page = ok(await f.ledger.reads.body.read({ ...input, maxBytes: 1000 }))
  expect(textPage(page).text).toBe('中')
  expect(page.next).not.toBeNull()
})

it('reads original source bytes under the body lease and rejects further bytes after expiry', async () => {
  let now = 0
  const { f, input } = await bodyFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024, maxRetentionMs: 10 },
    wrapMaterialClock: () => ({ sample: async () => succeed(instant(now)) }),
  })
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('missing original')
  const request = {
    ...f.access,
    result: input.result,
    attachment: result.value.original.source,
    after: null,
    maxBytes: 2,
  }
  const page = ok(await f.ledger.reads.content.read(request))
  expect(page.bytes).toEqual(Uint8Array.from(Buffer.from('中🙂'.repeat(150)).subarray(0, 2)))
  expect(await f.ledger.reads.body.read({ ...input, after: page.next })).toHaveProperty(
    'failure.kind',
    'invalid-cursor',
  )
  now = 10
  expect(await f.ledger.reads.content.read({ ...request, after: page.next })).toHaveProperty(
    'failure',
    { kind: 'not-found', target: 'body', reason: 'expired' },
  )
})

it('reads the body after reliable delivery release and deletion of the delivery channels', async () => {
  const { f, input } = await bodyFixture()
  const recovery = await f.load()
  const delivery = recovery.state.delivery
  if (delivery === null) throw new Error('missing delivery')
  ok(
    await f.ledger.commands.releaseDelivery({
      ...f.access,
      result: input.result,
      delivery: delivery.delivery,
      consumer: delivery.consumer,
      operation: operationId('release-body-preview'),
      evidence: {
        kind: 'processed',
        completion: evidence('body-preview-consumed', delivery.consumer.owner),
      },
    }),
  )
  const channels = (await f.records()).flatMap(row =>
    row.kind === 'material' && row.material.purpose === 'result' ? [row.material] : [],
  )
  expect(channels.length).toBeGreaterThan(0)
  for (const [index, channel] of channels.entries()) {
    ok(
      await f.materialStore.erase({
        ...f.access,
        material: channel.material,
        operation: operationId(`erase-delivery-channel-${index}`),
        authorization: evidence('fixture-confirmed-delivery-release'),
      }),
    )
  }
  expect(
    await f.ledger.reads.result({ ...f.access, result: input.result, after: null }),
  ).toHaveProperty('failure')
  expect(textPage(ok(await f.ledger.reads.body.read(input))).text).toBe('中🙂')
})

it('does not expose a replaced raw copy as a route around the body lifetime', async () => {
  const { f, input } = await bodyFixture()
  const read = vi.spyOn(f.materialStore, 'read')
  expect(await f.ledger.reads.content.raw(input)).toHaveProperty(
    'failure.reason',
    'released-material',
  )
  expect(
    await f.ledger.reads.content.read({ ...input, attachment: f.final.raw.content }),
  ).toHaveProperty('failure.reason', 'released-material')
  expect(read).not.toHaveBeenCalled()
})

it('preserves an independent native raw reference when the body expires', async () => {
  let now = 0
  const { f, input } = await bodyFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024, maxRetentionMs: 10 },
    wrapMaterialClock: () => ({ sample: async () => succeed(instant(now)) }),
    value: raw => ({
      content: [text('answer', '中🙂'.repeat(150))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [raw.content],
    }),
  })
  now = 10
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.reason', 'expired')
  expect(ok(await f.ledger.reads.content.raw(input))).toEqual(f.final.raw)
  const bytes = ok(
    await f.ledger.reads.content.read({ ...input, attachment: f.final.raw.content, maxBytes: 32 }),
  )
  expect(new TextDecoder().decode(bytes.bytes)).toBe('original bytes')
})

it('rejects a foreign principal before ledger and material IO', async () => {
  const { f, input } = await bodyFixture()
  const ledgerRead = vi.spyOn(f.harness.memory, 'read')
  const materialRead = vi.spyOn(f.materialStore, 'read')
  expect(await f.ledger.reads.body.read({ ...input, principal: principalB })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(ledgerRead).not.toHaveBeenCalled()
  expect(materialRead).not.toHaveBeenCalled()
})

it('rejects a cursor from another body and releases a lease when the page budget is too small', async () => {
  const { f, input } = await bodyFixture()
  const page = ok(await f.ledger.reads.body.read(input))
  expect(
    await f.ledger.reads.body.read({
      ...input,
      after: page.next?.replace('sha256:', 'other:') ?? 'bad',
    }),
  ).toHaveProperty('failure.kind', 'invalid-cursor')
  expect(await f.ledger.reads.body.read({ ...input, maxBytes: 2 })).toHaveProperty('failure', {
    kind: 'invalid',
    field: 'maxBytes',
    reason: 'first-character-does-not-fit',
  })
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toEqual([])
})

it('finishes an admitted page after body expiry but denies the next page and latches expiry', async () => {
  let now = 0
  let advance = false
  const { f, input } = await bodyFixture({
    offloading: {
      ...configuration().offloading,
      maxInlineUtf8Bytes: 1024,
      maxRetentionMs: 10,
      maxPageLeaseMs: 100,
    },
    wrapMaterialClock: () => ({ sample: async () => succeed(instant(now)) }),
    wrapMaterials: store => ({
      ...store,
      read: async request => {
        const result = await store.read(request)
        if (advance) now = 10
        return result
      },
    }),
  })
  advance = true
  const page = ok(await f.ledger.reads.body.read(input))
  expect(textPage(page).text).not.toBe('')
  expect(await f.ledger.reads.body.read({ ...input, after: page.next })).toHaveProperty('failure', {
    kind: 'not-found',
    target: 'body',
    reason: 'expired',
  })
  expect((await f.records()).filter(row => row.kind === 'body-expiration')).toHaveLength(1)
  now = 0
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.reason', 'expired')
})

it('discards a page when its lease expires during material IO', async () => {
  let now = 0
  let advance = false
  const { f, input } = await bodyFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024, maxPageLeaseMs: 10 },
    wrapMaterialClock: () => ({ sample: async () => succeed(instant(now)) }),
    wrapMaterials: store => ({
      ...store,
      read: async request => {
        const result = await store.read(request)
        if (advance) now = 10
        return result
      },
    }),
  })
  advance = true
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure', {
    kind: 'unavailable',
    dependency: 'body-reader',
    diagnostic: 'page lease expired',
  })
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toEqual([])
})

it('rejects a clock sample below the persisted page watermark before material IO', async () => {
  let now = 0
  const { f, input } = await bodyFixture({
    wrapMaterialClock: () => ({ sample: async () => succeed(instant(now)) }),
  })
  now = 5
  ok(await f.ledger.reads.body.read(input))
  now = 4
  const read = vi.spyOn(f.materialStore, 'read')
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'unavailable')
  expect(read).not.toHaveBeenCalled()
})

it.each(['applied', 'dropped'] as const)(
  'does not read on an unknown %s admission and safely admits a later retry',
  async mode => {
    const { f, input } = await bodyFixture()
    const read = vi.spyOn(f.materialStore, 'read')
    f.interceptCommit(async command => {
      if (
        command.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'material-use' &&
            write.record.use.kind === 'page-lease',
        )
      ) {
        if (mode === 'applied') await f.harness.memory.commit(command)
        return { kind: 'unknown', diagnostic: 'injected uncertainty' }
      }
      return f.harness.memory.commit(command)
    })
    expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'unavailable')
    expect(read).not.toHaveBeenCalled()
    f.interceptCommit(null)
    expect(textPage(ok(await f.ledger.reads.body.read(input))).text).toBe('中🙂')
    const leases = (await f.records()).filter(
      row => row.kind === 'material-use' && row.use.kind === 'page-lease',
    )
    expect(leases).toHaveLength(mode === 'applied' ? 1 : 0)
  },
)

it.each(['applied', 'dropped'] as const)(
  'does not publish a page on an unknown %s completion',
  async mode => {
    const { f, input } = await bodyFixture()
    f.interceptCommit(async command => {
      if (
        command.writes.some(
          write => write.kind === 'delete' && write.key.startsWith('material-use:page-lease:'),
        )
      ) {
        if (mode === 'applied') await f.harness.memory.commit(command)
        return { kind: 'unknown', diagnostic: 'injected uncertainty' }
      }
      return f.harness.memory.commit(command)
    })
    expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure', {
      kind: 'unavailable',
      dependency: 'body-reader',
      diagnostic: 'page completion commit is unknown',
    })
    expect(
      (await f.records()).filter(
        row => row.kind === 'material-use' && row.use.kind === 'page-lease',
      ),
    ).toHaveLength(mode === 'applied' ? 0 : 1)
  },
)

it('rechecks disclosure authority after the completion commit', async () => {
  let revoked = false
  const { f, input } = await bodyFixture({
    wrapAccess: access => ({
      qualify: request =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : access.qualify(request),
    }),
  })
  f.interceptCommit(async command => {
    const result = await f.harness.memory.commit(command)
    if (
      command.writes.some(
        write => write.kind === 'delete' && write.key.startsWith('material-use:page-lease:'),
      )
    )
      revoked = true
    return result
  })
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'denied')
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toEqual([])
})

it('does not enter material IO when authority is revoked during admission commit', async () => {
  let revoked = false
  const { f, input } = await bodyFixture({
    wrapAccess: access => ({
      qualify: request =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : access.qualify(request),
    }),
  })
  const read = vi.spyOn(f.materialStore, 'read')
  f.interceptCommit(async command => {
    const result = await f.harness.memory.commit(command)
    if (
      command.writes.some(
        write =>
          write.kind === 'put' &&
          write.record.kind === 'material-use' &&
          write.record.use.kind === 'page-lease',
      )
    )
      revoked = true
    return result
  })
  expect(await f.ledger.reads.body.read(input)).toHaveProperty('failure.kind', 'denied')
  expect(read).not.toHaveBeenCalled()
})

it('keeps independent leases for two concurrent reads of the same page', async () => {
  let hold = false
  const entered = Promise.withResolvers<void>()
  const gates: ReturnType<typeof Promise.withResolvers<void>>[] = []
  const { f, input } = await bodyFixture({
    wrapMaterials: store => ({
      ...store,
      read: async request => {
        if (hold) {
          const gate = Promise.withResolvers<void>()
          gates.push(gate)
          if (gates.length === 2) entered.resolve()
          await gate.promise
        }
        return store.read(request)
      },
    }),
  })
  hold = true
  const first = f.ledger.reads.body.read(input)
  const second = f.ledger.reads.body.read(input)
  await entered.promise
  const before = (await f.records()).flatMap(row =>
    row.kind === 'material-use' && row.use.kind === 'page-lease' ? [row.use.id] : [],
  )
  expect(new Set(before).size).toBe(2)
  const [firstGate, secondGate] = gates
  if (firstGate === undefined || secondGate === undefined) throw new Error('missing read gates')
  firstGate.resolve()
  ok(await first)
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toHaveLength(1)
  secondGate.resolve()
  expect(textPage(ok(await second)).text).toBe('中🙂')
  expect(
    (await f.records()).filter(row => row.kind === 'material-use' && row.use.kind === 'page-lease'),
  ).toEqual([])
})

it('accepts a valid provider that returns partial bytes of the first character', async () => {
  let short = false
  const { f, input } = await bodyFixture({
    wrapMaterials: store => ({
      ...store,
      read: request => store.read({ ...request, maxBytes: short ? 1 : request.maxBytes }),
    }),
  })
  short = true
  const page = ok(await f.ledger.reads.body.read(input))
  expect(textPage(page).text).toBe('中')
  expect(page.next).not.toBeNull()
})

it('reads UTF-8 text pages without splitting characters or dropping a BOM', async () => {
  const body = '\uFEFF中🙂'.repeat(103)
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 1024 },
    value: {
      content: [text('one', body)],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('expected offloading')
  const input = {
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null,
    maxBytes: 4,
  }
  let after: string | null = null
  let restored = ''
  for (let index = 0; index < 309; index += 1) {
    const request: Parameters<typeof f.ledger.reads.body.read>[0] = { ...input, after }
    const page = ok(await f.ledger.reads.body.read(request))
    expect(page.kind).toBe('text')
    expect(page.position).toBe(String(Buffer.byteLength(restored)))
    expect(Buffer.byteLength(textPage(page).text)).toBeLessThanOrEqual(4)
    expect(textPage(page).text.length).toBeGreaterThan(0)
    expect(page.bodyId).toBe(input.bodyId)
    restored += textPage(page).text
    after = page.next
    if (after === null) break
  }
  expect(after).toBeNull()
  expect(restored).toBe(body)
})
