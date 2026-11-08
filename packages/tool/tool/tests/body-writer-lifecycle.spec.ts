import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { evidence, ok, operationId, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it.each(['append', 'seal'] as const)(
  'does not revive %s when its material reply arrives after final settlement',
  async phase => {
    const f = await settlementFixture()
    const recovery = ok(await f.ledger.commands.loadRecovery(f.access))
    const definition = recovery.request.availability.definition
    if (
      recovery.start === null ||
      definition.kind !== 'function' ||
      definition.returns.body.kind !== 'text'
    )
      throw new Error('text writer start required')
    const input = {
      ...f.access,
      start: recovery.start,
      source: evidence('late-writer'),
      key: 'late',
    }
    ok(
      await f.ledger.bodyWrites.begin({
        ...input,
        operation: operationId('late-begin'),
        representation: definition.returns.body,
      }),
    )
    const append = {
      ...input,
      operation: operationId('late-append'),
      sequence: '1',
      frame: { kind: 'text', block: 'one', text: 'late material', end: true },
    } as const
    if (phase === 'seal') ok(await f.ledger.bodyWrites.append(append))
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const write = f.materialStore.write.bind(f.materialStore)
    vi.spyOn(f.materialStore, 'write').mockImplementationOnce(async value => {
      const answer = await write(value)
      entered.resolve()
      await release.promise
      return answer
    })
    const pending =
      phase === 'append'
        ? f.ledger.bodyWrites.append(append)
        : f.ledger.bodyWrites.seal({
            ...input,
            operation: operationId('late-seal'),
            afterSequence: '1',
          })
    await entered.promise
    try {
      ok(await f.preserve())
      for (let i = 0; i < 12; i++)
        if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'idle') break
    } finally {
      release.resolve()
    }
    expect(await pending).toHaveProperty('failure')
    expect(ok(await f.ledger.bodyWrites.inspect(input))).toHaveProperty('kind', 'failed')
    expect(ok(await f.ledger.bodyWrites.reconcile({ ...input, maxOperations: 1 }))).toMatchObject({
      examined: 0,
      pending: 0,
    })
    const records = await f.records()
    expect(
      records.filter(record => record.kind === 'material-use' && record.use.kind === 'preparation'),
    ).toEqual([])
    expect(records.find(record => record.kind === 'body-writer-append')).not.toHaveProperty(
      'append.state.payload',
    )
    expect(
      records.find(
        record =>
          record.kind === 'material' &&
          record.material.purpose === (phase === 'append' ? 'body-fragment' : 'body'),
      ),
    ).toHaveProperty('material.state.kind', 'deleted')
  },
)

it.each(['original', 'changed-metadata'] as const)(
  'rejects a temporary writer attachment with %s',
  async variant => {
    const f = await settlementFixture({
      value: async (_raw, ledger, access) => {
        const recovery = ok(await ledger.commands.loadRecovery(access))
        const definition = recovery.request.availability.definition
        if (
          recovery.start === null ||
          definition.kind !== 'function' ||
          definition.returns.body.kind !== 'text'
        )
          throw new Error('text writer start required')
        const input = {
          ...access,
          start: recovery.start,
          source: evidence('attachment-writer'),
          key: 'attachment',
        }
        ok(
          await ledger.bodyWrites.begin({
            ...input,
            operation: operationId('attachment-begin'),
            representation: definition.returns.body,
          }),
        )
        const body = ok(
          await ledger.bodyWrites.seal({
            ...input,
            operation: operationId('attachment-seal'),
            afterSequence: '0',
          }),
        )
        return {
          content: [text('answer', 'not a durable artifact')],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [
            variant === 'original' ? body.source : { ...body.source, mediaType: 'text/plain' },
          ],
        }
      },
    })
    expect(await f.preserve()).toHaveProperty('failure.kind', 'invalid')
    expect((await f.load()).state.phase).toBe('running')
    expect(
      (await f.records()).find(
        record =>
          record.kind === 'material-use' &&
          record.use.kind === 'preparation' &&
          record.use.operation === operationId('attachment-seal'),
      ),
    ).toBeDefined()
  },
)

it('reclaims sealed writer material when the final result does not adopt it', async () => {
  const f = await settlementFixture({
    value: async (_raw, ledger, access) => {
      const recovery = ok(await ledger.commands.loadRecovery(access))
      const definition = recovery.request.availability.definition
      if (
        recovery.start === null ||
        definition.kind !== 'function' ||
        definition.returns.body.kind !== 'text'
      )
        throw new Error('text writer start required')
      const input = {
        ...access,
        start: recovery.start,
        source: evidence('unused-writer'),
        key: 'unused',
      }
      ok(
        await ledger.bodyWrites.begin({
          ...input,
          operation: operationId('unused-begin'),
          representation: definition.returns.body,
        }),
      )
      ok(
        await ledger.bodyWrites.append({
          ...input,
          operation: operationId('unused-append'),
          sequence: '1',
          frame: { kind: 'text', block: 'one', text: 'temporary draft', end: true },
        }),
      )
      ok(
        await ledger.bodyWrites.seal({
          ...input,
          operation: operationId('unused-seal'),
          afterSequence: '1',
        }),
      )
      return {
        content: [text('answer', 'final answer')],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [],
      }
    },
  })
  const materials = (await f.records()).flatMap(record =>
    record.kind === 'material' &&
    (record.material.purpose === 'body' || record.material.purpose === 'body-fragment')
      ? [record.material.material]
      : [],
  )
  expect(materials).toHaveLength(2)
  ok(await f.preserve())
  expect(
    (await f.records()).filter(
      record => record.kind === 'material-use' && record.use.kind === 'preparation',
    ),
  ).toEqual([])
  let idle = false
  for (let i = 0; i < 12; i++) {
    if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'idle') {
      idle = true
      break
    }
  }
  expect(idle).toBe(true)
  for (const material of materials)
    expect(
      await f.materialStore.read({ ...f.access, material, offset: '0', maxBytes: 32 }),
    ).toHaveProperty('failure.kind', 'unavailable')
})
