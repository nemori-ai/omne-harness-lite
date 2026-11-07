import { expect, it, vi } from 'vitest'
import { settlementFixture } from './settlement-values.ts'
import { ok, testSettlementPorts, text } from './runtime-values.ts'

it('keeps content and summary in independent materials and recovers without the original envelope', async () => {
  const value = {
    content: [text('body', '正文独立内容🙂')],
    data: { kind: 'none' as const },
    original: {
      kind: 'offloaded' as const,
      source: {
        storage: 'files',
        key: 'native-body',
        mediaType: 'text/plain',
        bytes: '40',
        digest: 'sha256:native-body',
      },
      summary: [text('summary', '作者提供不同摘要')],
    },
    attachments: [],
  }
  const f = await settlementFixture({ value })
  const settled = ok(await f.preserve())
  if (settled.phase !== 'settled') throw new Error('missing result')
  const records = await f.records()
  const record = records.find(record => record.kind === 'result')
  if (record?.kind !== 'result' || !('kind' in record.result.value))
    throw new Error('result contains its body')
  const channels = record.result.value
  if (channels.original.kind !== 'offloaded') throw new Error('missing original')
  expect(channels.content.material).not.toEqual(channels.original.summary.material)
  expect(JSON.stringify(records)).not.toContain('正文独立内容')
  expect(JSON.stringify(records)).not.toContain('作者提供不同摘要')
  const store = testSettlementPorts(f.harness.memory).materials.store
  const originalRead = store.read.bind(store)
  const read = vi.spyOn(store, 'read').mockImplementation(input => {
    if (input.material.id === f.pointer.envelope.material.id) throw new Error('envelope removed')
    return originalRead(input)
  })
  expect((await f.resultPage()).value).toEqual(value)
  read.mockRejectedValue(new Error('all byte storage is unavailable'))
  read.mockClear()
  expect((await f.load()).result).toEqual({ version: settled.result, source: record.result.source })
  expect(read).not.toHaveBeenCalled()
  expect(
    await f.ledger.reads.result({ ...f.access, result: settled.result, after: null }),
  ).toHaveProperty('failure.kind', 'unavailable')
})

it.each(['corrupt', 'truncated', 'bad-page'] as const)(
  'rejects %s result material instead of exposing a partial result',
  async fault => {
    const f = await settlementFixture()
    const settled = ok(await f.preserve())
    if (settled.phase !== 'settled') throw new Error('missing result')
    const store = testSettlementPorts(f.harness.memory).materials.store
    const read = store.read.bind(store)
    vi.spyOn(store, 'read').mockImplementation(async input => {
      const answer = await read(input)
      if ('failure' in answer) return answer
      if (fault === 'bad-page') Reflect.set(answer.ok, 'bytes', [])
      else if (fault === 'truncated') Reflect.set(answer.ok, 'bytes', answer.ok.bytes.slice(1))
      else answer.ok.bytes[0] = (answer.ok.bytes[0] ?? 0) ^ 1
      return answer
    })
    expect(
      await f.ledger.reads.result({ ...f.access, result: settled.result, after: null }),
    ).toHaveProperty('failure.kind', 'unavailable')
  },
)

it.each(['unknown-applied', 'unknown-dropped', 'unknown-delayed'] as const)(
  'reuses the original result slots after preparation is %s',
  async fault => {
    const f = await settlementFixture()
    f.harness.memory.injectCommit(fault)
    expect(await f.preserve()).toHaveProperty('failure.kind', 'unavailable')
    expect((await f.records()).some(record => record.kind === 'result')).toBe(false)
    expect((await f.load()).state.phase).toBe('running')
    ok(await f.preserve())
    expect((await f.resultPage()).value).toEqual(f.final.result)
    const records = await f.records()
    expect(records.filter(record => record.kind === 'result')).toHaveLength(1)
    const channels = records.filter(
      record => record.kind === 'material' && record.material.material.id.startsWith('result:'),
    )
    expect(channels).toHaveLength(3)
    if (fault === 'unknown-delayed')
      expect(f.harness.memory.landDelayed()).toEqual([{ kind: 'conflict' }])
  },
)

it('restores a complete delivery value independently of the model result page limit', async () => {
  const value = {
    content: [text('large', '完整正文🙂'.repeat(10000))],
    data: { kind: 'none' as const },
    original: { kind: 'none' as const },
    attachments: [],
  }
  const f = await settlementFixture({ value })
  const settled = ok(await f.preserve())
  if (settled.phase !== 'settled') throw new Error('missing result')
  expect(await f.ledger.delivery.read({ ...f.access, result: settled.result })).toEqual({
    ok: value,
  })
})

it('refuses a delivery value when recover authority is revoked during material IO', async () => {
  let revoked = false
  const f = await settlementFixture({
    wrapAccess: guard => ({
      qualify: input =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : guard.qualify(input),
    }),
  })
  const settled = ok(await f.preserve())
  if (settled.phase !== 'settled') throw new Error('missing result')
  const store = testSettlementPorts(f.harness.memory).materials.store
  const read = store.read.bind(store)
  vi.spyOn(store, 'read').mockImplementation(async input => {
    const page = await read(input)
    revoked = true
    return page
  })
  expect(await f.ledger.delivery.read({ ...f.access, result: settled.result })).toHaveProperty(
    'failure.kind',
    'denied',
  )
})
