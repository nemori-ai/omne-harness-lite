import { describe, expect, it } from 'vitest'
import { windowOf } from '../src/model/range.ts'
import { createUsageReads, refusalOf } from '../src/view/reads.ts'
import { TENANT } from './fixtures/dom.ts'
import { fakeUsage, result } from './fixtures/fake-usage.ts'

const window = windowOf('week', new Date(2026, 10, 19, 15, 30))
const shape = (groupBy: readonly ('source' | 'model')[]) => ({ session: null, window, groupBy })

describe('the reads of the usage protocol within one refresh', () => {
  it('asks once per distinct question and gives each question its own answer', async () => {
    const fake = fakeUsage(call => ({
      outcome: 'succeeded',
      body: result(call.body['groupBy'] as string[]),
    }))
    const reads = createUsageReads(fake.client, () => 'UTC')
    const [bySource, again, byModel] = await Promise.all([
      reads.query(TENANT, shape(['source'])),
      reads.query(TENANT, shape(['source'])),
      reads.query(TENANT, shape(['model'])),
    ])
    expect(fake.calls).toHaveLength(2)
    expect(again).toBe(bySource)
    if (bySource.kind !== 'ready' || byModel.kind !== 'ready') throw new Error('not ready')
    expect(bySource.value.groups.map(cell => cell.key[0])).toEqual(['model', 'tool'])
    expect(byModel.value.groups.map(cell => cell.key[0])).toEqual([
      'openai/gpt-5.6-sol',
      'anthropic/claude',
    ])
    expect(fake.calls[0]?.body).toMatchObject({
      scope: { kind: 'tenant' },
      zone: 'UTC',
      bucket: 'day',
      groupBy: ['source'],
    })
  })

  it('asks a session by its scope, and its occupancy apart from its statistics', async () => {
    const fake = fakeUsage()
    const reads = createUsageReads(fake.client, () => 'UTC')
    await reads.query(TENANT, { session: 's1', window, groupBy: [] })
    await reads.occupancy(TENANT, 's1')
    await reads.occupancy(TENANT, 's1')
    expect(
      fake.calls.map(call => [call.operation, call.body['scope'] ?? call.body['session']]),
    ).toEqual([
      ['query-usage', { kind: 'session', session: 's1' }],
      ['read-context-occupancy', 's1'],
    ])
  })

  it('asks again after a refresh and tells the listeners, until one leaves', async () => {
    const fake = fakeUsage()
    const reads = createUsageReads(fake.client, () => 'UTC')
    const heard: number[] = []
    const leave = reads.subscribe(() => heard.push(reads.generation()))
    await reads.query(TENANT, shape([]))
    const before = reads.generation()
    reads.refresh()
    await reads.query(TENANT, shape([]))
    expect(fake.calls).toHaveLength(2)
    expect(heard).toEqual([reads.generation()])
    expect(reads.generation()).not.toBe(before)
    leave()
    reads.refresh()
    expect(heard).toHaveLength(1)
  })

  it('says why a read was refused, an unreadable tenant and a client that throws included', async () => {
    const outcomes = [
      'denied',
      'basis-unavailable',
      'not-found',
      'invalid',
      'limited',
      'unsupported',
      'unavailable',
      'uncertain',
    ]
    expect(outcomes.map(refusalOf)).toEqual([
      '没有权限，或登录已失效。',
      '服务端暂时读不出用量，稍后再试。',
      '没有这个会话。',
      '这次查询的条件不对。',
      '这段时间的数据太多，换一个短一些的时间段。',
      '不支持这个范围。',
      '连不上服务，稍后再试。',
      '结果不确定，稍后刷新。',
    ])
    expect(refusalOf('strange')).toBe('读取没有成功（strange）。')
    const fake = fakeUsage(call =>
      call.operation === 'query-usage' ? { outcome: 'limited' } : undefined,
    )
    const reads = createUsageReads(fake.client, () => 'UTC')
    expect(await reads.query(TENANT, shape([]))).toEqual({
      kind: 'refused',
      text: refusalOf('limited'),
    })
    const unreadable = { kind: 'refused', text: '外壳给的租户读不懂。' }
    expect(await reads.query('not a tenant', shape([]))).toEqual(unreadable)
    expect(await reads.occupancy('not a tenant', 's1')).toEqual(unreadable)
    const throwing = createUsageReads(
      {
        'query-usage': () => Promise.reject(new Error('down')),
        'read-context-occupancy': () => Promise.reject(new Error('down')),
      } as never,
      () => 'UTC',
    )
    expect(await throwing.query(TENANT, shape([]))).toEqual({
      kind: 'refused',
      text: '连不上服务，稍后再试。',
    })
  })
})
