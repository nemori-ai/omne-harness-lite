import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { observeToolLedgerCommit, type ToolLifecycleObservation } from '@omne-harness/tool'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, evidence, ok, operationId, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('observes confirmed lifecycle facts without copying payloads or keeping segments', async () => {
  const events: ToolLifecycleObservation[] = []
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048, maxRetentionMs: 10 },
    value: {
      content: [text('secret', 'SECRET_BODY_'.repeat(500))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  f.interceptCommit(
    observeToolLedgerCommit(
      input => f.harness.memory.commit(input),
      event => events.push(event),
    ),
  )
  const state = ok(await f.preserve())
  if (state.phase !== 'settled' || state.delivery === null) throw new Error('missing delivery')
  ok(
    await f.ledger.commands.releaseDelivery({
      ...f.access,
      operation: operationId('telemetry-release'),
      result: state.result,
      delivery: state.delivery.delivery,
      consumer: state.delivery.consumer,
      evidence: {
        kind: 'processed',
        completion: evidence('consumed', state.delivery.consumer.owner),
      },
    }),
  )
  expect(new Set(events.map(event => event.phase))).toEqual(
    new Set(['result-commit', 'offload', 'delivery-release']),
  )
  expect(events.filter(event => event.phase === 'offload')).toMatchObject([
    { items: 1, bytes: 6000 },
  ])
  expect(JSON.stringify(events)).not.toContain('SECRET_BODY_')
  expect(
    events.every(event => event.tenant === f.access.tenant && event.call === f.access.call),
  ).toBe(true)
})

it.each(['unknown', 'conflict', 'unavailable'] as const)(
  'reports %s without claiming a committed lifecycle transition',
  async kind => {
    const f = await settlementFixture()
    ok(await f.preserve())
    const input = f.commits.find(input =>
      input.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
    )!
    const answer =
      kind === 'conflict'
        ? { kind, current: input.revision }
        : { kind, diagnostic: 'SECRET_DATABASE_PATH' }
    const events: ToolLifecycleObservation[] = []
    const result = await observeToolLedgerCommit(
      async () => answer,
      event => events.push(event),
    )(input)
    expect(result).toBe(answer)
    expect(events).toMatchObject([{ phase: 'failure', failure: kind }])
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events)).not.toContain('SECRET_DATABASE_PATH')
  },
)

it('preserves the exact commit answer and thrown error when the observer throws', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const input = f.commits.find(input =>
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'result'),
  )!
  const committed = { kind: 'committed' as const, revision: input.revision }
  const observe = () => {
    throw new Error('telemetry failed')
  }
  expect(await observeToolLedgerCommit(async () => committed, observe)(input)).toBe(committed)
  const error = new Error('storage failure')
  await expect(
    observeToolLedgerCommit(async () => {
      throw error
    }, observe)(input),
  ).rejects.toBe(error)
})
