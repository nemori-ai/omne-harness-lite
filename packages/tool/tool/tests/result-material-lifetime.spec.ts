import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { refProcess, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { ok, operationId, evidence, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it.each(['content', 'attachments', 'original-source', 'original-summary', 'process'] as const)(
  'keeps raw custody when %s still references it at settlement',
  async location => {
    const f = await settlementFixture({
      value: raw => {
        const reference = {
          kind: 'file' as const,
          id: text('raw-reference', '').id,
          visibility: { toHuman: true, toModel: true },
          ref: raw.content,
          transcript: null,
        }
        return {
          content: location === 'content' ? [reference] : [text('answer', 'done')],
          data: { kind: 'none' },
          attachments: location === 'attachments' ? [raw.content] : [],
          original:
            location === 'original-source' || location === 'original-summary'
              ? {
                  kind: 'offloaded',
                  source:
                    location === 'original-source'
                      ? raw.content
                      : { ...raw.content, storage: 'external', key: 'independent-body' },
                  summary:
                    location === 'original-summary' ? [reference] : [text('summary', 'short')],
                }
              : { kind: 'none' },
        }
      },
      process: raw =>
        location === 'process'
          ? [
              {
                ...refProcess('raw-history'),
                content: {
                  kind: 'file',
                  id: text('raw-process', '').id,
                  visibility: { toHuman: true, toModel: false },
                  ref: raw.content,
                  transcript: null,
                },
              },
            ]
          : [],
    })
    const before = await f.records()
    const raw = before.find(
      record => record.kind === 'material' && record.material.purpose === 'raw',
    )
    if (raw?.kind !== 'material') throw new Error('fixture has no raw material')
    const preparation = before.find(
      record =>
        record.kind === 'material-use' &&
        record.use.kind === 'preparation' &&
        record.use.operation === raw.material.writeOperation,
    )
    expect(preparation).toBeDefined()
    expect(ok(await f.preserve()).phase).toBe('settled')
    const after = await f.records()
    expect(after).toContainEqual(preparation)
    expect(
      after.flatMap(record =>
        record.kind === 'material-cleanup' ? [record.cleanup.material] : [],
      ),
    ).not.toContainEqual(raw.material.material)
    const commit = f.commits.find(input =>
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
    )
    expect(commit).toBeDefined()
    expect(commit?.writes).not.toContainEqual({
      kind: 'delete',
      key: `material-use:preparation:${raw.material.writeOperation}`,
    })
  },
)

it('adopts the final channels and releases envelope and replaced raw preparation in the same result commit', async () => {
  const f = await settlementFixture()
  const before = await f.records()
  const envelope = before.find(
    record => record.kind === 'material' && record.material.purpose === 'final',
  )
  if (envelope?.kind !== 'material') throw new Error('fixture has no final envelope')
  const raw = before.find(record => record.kind === 'material' && record.material.purpose === 'raw')
  if (raw?.kind !== 'material') throw new Error('fixture has no raw material')
  const result = ok(await f.preserve())
  if (result.phase !== 'settled') throw new Error('result did not settle')
  const records = await f.records()
  const uses = records.flatMap(record => (record.kind === 'material-use' ? [record.use] : []))
  expect(uses).toHaveLength(3)
  expect(uses).toEqual(
    expect.arrayContaining([expect.objectContaining({ kind: 'delivery', result: result.result })]),
  )
  expect(uses.some(use => use.kind === 'preparation')).toBe(false)
  const committed = f.commits.filter(commit =>
    commit.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
  )
  expect(committed).toHaveLength(1)
  const writes = committed[0]?.writes ?? []
  expect(writes).toContainEqual({
    kind: 'delete',
    key: `material-use:preparation:${envelope.material.writeOperation}`,
  })
  expect(writes).toContainEqual({
    kind: 'delete',
    key: `material-use:preparation:${raw.material.writeOperation}`,
  })
  const cleanup = writes.flatMap(write =>
    write.kind === 'put' && write.record.kind === 'material-cleanup' ? [write.record.cleanup] : [],
  )
  expect(cleanup.map(item => item.material)).toEqual(
    expect.arrayContaining([raw.material.material, envelope.material.material]),
  )
  expect(cleanup).toHaveLength(2)
  expect(
    writes.filter(write => write.kind === 'put' && write.record.kind === 'material-use'),
  ).toHaveLength(3)
})

it('records cleanup responsibility when raw, envelope and delivery uses end', async () => {
  const f = await settlementFixture()
  const state = ok(await f.preserve())
  if (state.phase !== 'settled' || state.delivery === null) throw new Error('missing delivery')
  expect((await f.records()).filter(record => record.kind === 'material-cleanup')).toHaveLength(2)
  const release = {
    ...f.access,
    operation: operationId('release-material-delivery'),
    result: state.result,
    delivery: state.delivery.delivery,
    consumer: state.delivery.consumer,
    evidence: {
      kind: 'processed' as const,
      completion: evidence('independently-consumed', state.delivery.consumer.owner),
    },
  }
  const released = ok(await f.ledger.commands.releaseDelivery(release))
  const after = await f.records()
  expect(after.filter(record => record.kind === 'material-use')).toEqual([])
  expect(after.filter(record => record.kind === 'material-cleanup')).toHaveLength(5)
  expect(ok(await f.ledger.commands.releaseDelivery(release))).toEqual(released)
  expect((await f.records()).filter(record => record.kind === 'material-cleanup')).toHaveLength(5)
})

it.each(['unknown-applied', 'unknown-dropped'] as const)(
  'keeps result uses and envelope release atomic across %s',
  async fault => {
    const f = await settlementFixture()
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
    const uncertain = await f.records()
    const applied = fault === 'unknown-applied'
    expect(uncertain.filter(record => record.kind === 'result')).toHaveLength(applied ? 1 : 0)
    expect(
      uncertain.filter(record => record.kind === 'material-use' && record.use.kind === 'delivery'),
    ).toHaveLength(applied ? 3 : 0)
    expect(uncertain.filter(record => record.kind === 'material-cleanup')).toHaveLength(
      applied ? 2 : 0,
    )
    const state = ok(await f.preserve())
    expect(state.phase).toBe('settled')
    const after = await f.records()
    expect(
      after.filter(record => record.kind === 'material-use' && record.use.kind === 'preparation'),
    ).toEqual([])
    expect(
      after.filter(record => record.kind === 'material-use' && record.use.kind === 'delivery'),
    ).toHaveLength(3)
    expect(after.filter(record => record.kind === 'material-cleanup')).toHaveLength(2)
  },
)

it('rechecks prepared ownership after another commit removes a use', async () => {
  const f = await settlementFixture()
  let removed = false
  f.interceptCommit(async input => {
    if (
      !removed &&
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'result')
    ) {
      const use = input.writes.find(
        write =>
          write.kind === 'delete' && write.key.startsWith('material-use:preparation:result-slot:'),
      )
      if (use === undefined) throw new Error('missing prepared result slot')
      removed = true
      expect(await f.harness.memory.commit({ ...input, writes: [use] })).toEqual({
        kind: 'committed',
      })
    }
    return f.harness.memory.commit(input)
  })
  expect(await f.preserve()).toMatchObject({
    failure: { kind: 'invalid', field: 'material', reason: 'preparation-use-required' },
  })
  expect(
    (await f.records()).filter(
      record => record.kind === 'result' || record.kind === 'material-cleanup',
    ),
  ).toEqual([])
})

it.each(['unknown-applied', 'unknown-dropped'] as const)(
  'recovers delivery cleanup after %s without duplicating duties',
  async fault => {
    const f = await settlementFixture()
    const state = ok(await f.preserve())
    if (state.phase !== 'settled' || state.delivery === null) throw new Error('missing delivery')
    const input = {
      ...f.access,
      operation: operationId('release-unknown'),
      result: state.result,
      delivery: state.delivery.delivery,
      consumer: state.delivery.consumer,
      evidence: {
        kind: 'processed' as const,
        completion: evidence('consumed', state.delivery.consumer.owner),
      },
    }
    f.harness.memory.injectCommit(fault)
    expect(await f.ledger.commands.releaseDelivery(input)).toHaveProperty(
      'failure.kind',
      'commit-unknown',
    )
    const applied = fault === 'unknown-applied'
    const uncertain = await f.records()
    expect(uncertain.filter(record => record.kind === 'material-use')).toHaveLength(applied ? 0 : 3)
    expect(uncertain.filter(record => record.kind === 'material-cleanup')).toHaveLength(
      applied ? 5 : 2,
    )
    const receipt = ok(await f.ledger.commands.releaseDelivery(input))
    const after = await f.records()
    expect(after.filter(record => record.kind === 'material-use')).toEqual([])
    expect(after.filter(record => record.kind === 'material-cleanup')).toHaveLength(5)
    expect(
      after.filter(
        record =>
          record.kind === 'material-cleanup' &&
          record.cleanup.basis.digest === receipt.evidence.digest,
      ),
    ).toHaveLength(3)
  },
)
