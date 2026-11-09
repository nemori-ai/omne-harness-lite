import { textPage } from './body-read-values.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, ok, text, principalB } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('deletes the expired body bytes after recording deletion authority in the original call', async () => {
  let now = 0
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 8192, maxRetentionMs: 10 },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    value: {
      content: [text('body', '中🙂'.repeat(1200))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const body = (await f.records()).find(
    row => row.kind === 'material' && row.material.purpose === 'body',
  )
  if (body?.kind !== 'material') throw new Error('body material missing')
  now = 10
  ok(await f.ledger.maintenance.expire(f.access))
  let idle = false
  for (let i = 0; i < 20; i += 1) {
    const progress = ok(await f.ledger.maintenance.reclaim(f.access))
    if (progress.kind === 'idle') {
      idle = true
      break
    }
  }
  expect(idle).toBe(true)
  expect(
    await f.materialStore.read({
      ...f.access,
      material: body.material.material,
      offset: '0',
      maxBytes: 8,
    }),
  ).toHaveProperty('failure.kind', 'unavailable')
  const after = await f.records()
  expect(
    after.find(
      row =>
        row.kind === 'material' && row.material.writeOperation === body.material.writeOperation,
    ),
  ).toMatchObject({ material: { state: { kind: 'deleted' } } })
  expect(after.filter(row => row.kind === 'material-cleanup')).toHaveLength(0)
})

async function expiredFixture(options: Parameters<typeof settlementFixture>[0] = {}) {
  let now = 0
  const f = await settlementFixture({
    ...options,
    offloading: {
      ...configuration().offloading,
      maxInlineUtf8Bytes: 8192,
      maxRetentionMs: 10,
      maxPageLeaseMs: 20,
    },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    value: options.value ?? {
      content: [text('body', '中🙂'.repeat(1200))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  now = 10
  ok(await f.ledger.maintenance.expire(f.access))
  return f
}

async function drain(f: Awaited<ReturnType<typeof expiredFixture>>) {
  for (let i = 0; i < 32; i += 1)
    if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'idle') return
  throw new Error('material reclamation did not finish')
}

it.each(['applied', 'dropped'] as const)(
  'does not delete bytes after an %s unknown authorization commit',
  async mode => {
    const f = await expiredFixture()
    const erase = vi.spyOn(f.materialStore, 'erase')
    f.interceptCommit(async input => {
      if (
        input.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'material' &&
            write.record.material.state.kind === 'deleting',
        )
      ) {
        if (mode === 'applied') await f.harness.memory.commit(input)
        return { kind: 'unknown', diagnostic: 'injected authorization uncertainty' }
      }
      return f.harness.memory.commit(input)
    })
    expect(await f.ledger.maintenance.reclaim(f.access)).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    expect(erase).not.toHaveBeenCalled()
    f.interceptCommit(null)
    f.rebuild({ ...configuration().offloading, maxInlineUtf8Bytes: 8192, maxRetentionMs: 10 })
    await drain(f)
    expect((await f.records()).filter(row => row.kind === 'material-cleanup')).toHaveLength(0)
  },
)

it.each(['applied', 'dropped'] as const)(
  'recovers an %s unknown confirmation without deleting the material again',
  async mode => {
    const f = await expiredFixture()
    const erase = vi.spyOn(f.materialStore, 'erase')
    f.interceptCommit(async input => {
      if (
        input.writes.some(
          write =>
            write.kind === 'put' &&
            write.record.kind === 'material' &&
            write.record.material.state.kind === 'deleted',
        )
      ) {
        if (mode === 'applied') await f.harness.memory.commit(input)
        return { kind: 'unknown', diagnostic: 'injected confirmation uncertainty' }
      }
      return f.harness.memory.commit(input)
    })
    expect(await f.ledger.maintenance.reclaim(f.access)).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    const first = erase.mock.calls[0]?.[0]
    if (first === undefined) throw new Error('erase was not attempted')
    f.interceptCommit(null)
    await drain(f)
    expect(erase.mock.calls.filter(([input]) => input.operation === first.operation)).toHaveLength(
      1,
    )
  },
)

it('replays the original operation after pending without confirming physical deletion early', async () => {
  let pending = true
  const f = await expiredFixture({
    wrapMaterials: store => ({
      ...store,
      erase: async input => {
        if (pending) {
          pending = false
          return succeed({ kind: 'pending' })
        }
        return store.erase(input)
      },
    }),
  })
  const erase = vi.spyOn(f.materialStore, 'erase')
  expect(ok(await f.ledger.maintenance.reclaim(f.access))).toEqual({ kind: 'pending' })
  const first = erase.mock.calls[0]?.[0]
  if (first === undefined) throw new Error('erase was not attempted')
  expect(
    ok(
      await f.materialStore.read({
        ...f.access,
        material: first.material,
        offset: '0',
        maxBytes: 1,
      }),
    ).bytes,
  ).toHaveLength(1)
  expect(
    (await f.records()).filter(
      row => row.kind === 'material' && row.material.state.kind === 'deleted',
    ),
  ).toHaveLength(0)
  f.rebuild(configuration().offloading)
  await drain(f)
  const retries = erase.mock.calls.filter(([input]) => input.operation === first.operation)
  expect(retries).toHaveLength(2)
  expect(retries[1]?.[0]).toEqual(first)
})

it('recognizes deletion after a lost provider answer without replaying it', async () => {
  let lost = true
  const f = await expiredFixture({
    wrapMaterials: store => ({
      ...store,
      erase: async input => {
        const result = await store.erase(input)
        if (lost) {
          lost = false
          throw new Error('lost provider answer')
        }
        return result
      },
    }),
  })
  const erase = vi.spyOn(f.materialStore, 'erase')
  expect(await f.ledger.maintenance.reclaim(f.access)).toHaveProperty('failure.kind', 'unavailable')
  const first = erase.mock.calls[0]?.[0]
  if (first === undefined) throw new Error('erase was not attempted')
  await drain(f)
  expect(erase.mock.calls.filter(([input]) => input.operation === first.operation)).toHaveLength(1)
})

it('rechecks maintenance authority between inspection and deletion', async () => {
  let revoked = false
  const f = await expiredFixture({
    wrapMaterials: store => ({
      ...store,
      inspectErase: async input => {
        const result = await store.inspectErase(input)
        revoked = true
        return result
      },
    }),
    wrapAccess: access => ({
      qualify: input =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : access.qualify(input),
    }),
  })
  const erase = vi.spyOn(f.materialStore, 'erase')
  expect(await f.ledger.maintenance.reclaim(f.access)).toHaveProperty('failure.kind', 'denied')
  expect(erase).not.toHaveBeenCalled()
})

it('keeps an admitted page alive across body expiry and reclaims after the page releases its use', async () => {
  let now = 0
  let hold = false
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const f = await settlementFixture({
    offloading: {
      ...configuration().offloading,
      maxInlineUtf8Bytes: 8192,
      maxRetentionMs: 10,
      maxPageLeaseMs: 20,
    },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    wrapMaterials: store => ({
      ...store,
      read: async input => {
        if (hold) {
          entered.resolve()
          await resume.promise
        }
        return store.read(input)
      },
    }),
    value: {
      content: [text('body', '中🙂'.repeat(1200))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('body is not offloaded')
  hold = true
  const page = f.ledger.reads.body.read({
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null,
    maxBytes: 8,
  })
  await entered.promise
  now = 10
  ok(await f.ledger.maintenance.expire(f.access))
  try {
    let blocked = false
    for (let i = 0; i < 8; i += 1) {
      if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'blocked') {
        blocked = true
        break
      }
    }
    expect(blocked).toBe(true)
  } finally {
    resume.resolve()
  }
  expect(textPage(ok(await page)).text).toBe('中🙂')
  await drain(f)
})

it('advances past a failing material and remembers the selection after rebuilding the ledger', async () => {
  let failedOperation: string | undefined
  const f = await expiredFixture({
    wrapMaterials: store => ({
      ...store,
      erase: async input => {
        failedOperation ??= input.operation
        if (input.operation === failedOperation) throw new Error('one material is unavailable')
        return store.erase(input)
      },
    }),
  })
  expect(await f.ledger.maintenance.reclaim(f.access)).toHaveProperty('failure.kind', 'unavailable')
  f.rebuild(configuration().offloading)
  expect(ok(await f.ledger.maintenance.reclaim(f.access))).toEqual({ kind: 'deleted' })
  expect(
    (await f.records()).filter(
      row => row.kind === 'material' && row.material.state.kind === 'deleting',
    ),
  ).toHaveLength(1)
})

it('rejects foreign maintenance before reading or deleting materials', async () => {
  const f = await expiredFixture()
  const inspect = vi.spyOn(f.materialStore, 'inspectErase')
  const erase = vi.spyOn(f.materialStore, 'erase')
  const before = await f.records()
  expect(await f.ledger.maintenance.reclaim({ ...f.access, principal: principalB })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(inspect).not.toHaveBeenCalled()
  expect(erase).not.toHaveBeenCalled()
  expect(await f.records()).toEqual(before)
})

it('keeps raw bytes that also have native and process uses while reclaiming the expired model body', async () => {
  const f = await expiredFixture({
    value: raw => ({
      content: [text('body', 'long model body '.repeat(560))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [raw.content],
    }),
    process: raw => [
      {
        index: 'output',
        mode: 'replace',
        state: 'open',
        sequence: '0',
        trim: null,
        content: {
          kind: 'file',
          id: text('process', '').id,
          visibility: { toHuman: true, toModel: false },
          ref: raw.content,
          transcript: null,
        },
      },
    ],
  })
  const records = await f.records()
  const protectedUses = records.filter(
    row =>
      row.kind === 'material-use' &&
      ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
  )
  expect(
    new Set(protectedUses.flatMap(row => (row.kind === 'material-use' ? [row.use.kind] : []))),
  ).toEqual(new Set(['native-reference', 'process-history', 'delivery']))
  const raw = records.find(row => row.kind === 'material' && row.material.purpose === 'raw')
  if (raw?.kind !== 'material') throw new Error('raw material is missing')
  await drain(f)
  expect(
    ok(
      await f.materialStore.read({
        ...f.access,
        material: raw.material.material,
        offset: '0',
        maxBytes: 100,
      }),
    ).bytes,
  ).toEqual(new TextEncoder().encode('original bytes'))
  expect(
    (await f.records()).filter(
      row =>
        row.kind === 'material-use' &&
        ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
    ),
  ).toEqual(protectedUses)
  expect(
    (await f.records()).find(row => row.kind === 'material' && row.material.purpose === 'body'),
  ).toMatchObject({ material: { state: { kind: 'deleted' } } })
})

it.each(['inspect-material', 'erase-material', 'erase-authorization'] as const)(
  'isolates the durable deletion grant from provider changes to %s',
  async mutation => {
    const changed: boolean[] = []
    let pendingAuthorization = mutation === 'erase-authorization'
    const f = await expiredFixture({
      wrapMaterials: store => ({
        ...store,
        inspectErase: async input => {
          const result = await store.inspectErase(input)
          if (mutation === 'inspect-material')
            changed.push(Reflect.set(input.material.provider, 'revision', 'provider-mutated'))
          return result
        },
        erase: async input => {
          if (pendingAuthorization) {
            pendingAuthorization = false
            return succeed({ kind: 'pending' })
          }
          const result = await store.erase(input)
          if (mutation === 'erase-material')
            changed.push(Reflect.set(input.material, 'generation', 'provider-mutated'))
          if (mutation === 'erase-authorization')
            changed.push(Reflect.set(input.authorization, 'digest', 'provider-mutated'))
          return result
        },
      }),
    })
    await drain(f)
    expect(changed.length).toBeGreaterThan(0)
    expect((await f.records()).filter(row => row.kind === 'material-cleanup')).toHaveLength(0)
    const body = (await f.records()).find(
      row => row.kind === 'material' && row.material.purpose === 'body',
    )
    expect(body).toMatchObject({ material: { state: { kind: 'deleted' } } })
  },
)
