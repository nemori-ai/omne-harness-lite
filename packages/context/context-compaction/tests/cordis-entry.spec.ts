import { judgeMessage } from '@omne-harness/message'
import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { agentCompactionKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { CompactionTaskRef } from '@omne-harness/agent-contract'
import { createContextCompactionPlugin } from '@omne-harness/context-compaction/cordis'
import type { CompactionRecord, CompactionStore } from '@omne-harness/context-compaction'
import { succeed } from '@omne-harness/operation-result'
import { access, adoption, ok, request } from './request-fixture.ts'

function memory(): CompactionStore {
  const records = new Map<string, CompactionRecord>()
  const key = (ref: CompactionTaskRef) => JSON.stringify([ref.authority, ref.tenant, ref.task])
  return {
    read: async ref => succeed(records.get(key(ref)) ?? null),
    async change(ref, decide) {
      const result = decide(records.get(key(ref)) ?? null)
      if ('failure' in result) return result
      if (result.ok.record !== null) records.set(key(ref), result.ok.record)
      return succeed(result.ok.value)
    },
    async pending({ authority, after, limit }) {
      const all = [...records.entries()]
        .filter(
          ([k, record]) =>
            record.state.ref.authority === authority &&
            (after === null || k > after) &&
            (record.state.phase === 'pending' || record.state.physical !== 'settled'),
        )
        .sort(([a], [b]) => a.localeCompare(b))
      const page = all.slice(0, limit)
      return succeed({
        refs: page.map(([, value]) => value.state.ref),
        next: all.length > limit ? (page.at(-1)?.[0] ?? null) : null,
      })
    },
  }
}

it('injects the independent provider and returns its complete rule result through the Agent service', async () => {
  const ctx = new Context()
  const input = request()
  const store = memory()
  let calls = 0
  const plugin = createContextCompactionPlugin({
    inject: ['compactionFixture'],
    pollMs: 5,
    create: async () => ({
      authority: input.ref.authority,
      adoption,
      store,
      authorize: async () => succeed(undefined),
      custody: async () => succeed(undefined),
      executor: {
        async advance(request, generation) {
          calls++
          const message = judgeMessage({
            role: 'compaction',
            id: request.input.outputMessageId,
            blocks: [
              {
                kind: 'text',
                id: 'summary',
                text: 'rule summary',
                visibility: { toModel: true, toHuman: true },
              },
            ],
            covers: { from: request.input.history.origin, to: request.input.history.upper },
            retained: [],
            derivation: generation,
          })
          if (!('ok' in message) || message.ok.role !== 'compaction')
            throw new Error('fixture message')
          return succeed({
            phase: 'terminal',
            physical: 'settled',
            outcome: { kind: 'completed', message: message.ok },
          })
        },
        cancel: async () => succeed('settled'),
      },
    }),
  })
  const fiber = await ctx.plugin(plugin)
  expect(ctx.get(agentCompactionKey)).toBeUndefined()
  const backend = await ctx.plugin({
    name: 'compaction-fixture',
    apply(inner: Context) {
      inner.provide('compactionFixture', true)
    },
  })
  await expect.poll(() => ctx.get(agentCompactionKey)).toBeDefined()
  const service = ctx.get(agentCompactionKey)
  if (service === undefined) throw new Error('service absent')
  expect(ok(await service.admit({ ...access, request: input })).phase).toBe('pending')
  await expect
    .poll(async () => ok(await service.inspect({ ...access, ref: input.ref })))
    .toMatchObject({
      kind: 'found',
      state: {
        phase: 'terminal',
        outcome: {
          kind: 'completed',
          message: { id: input.input.outputMessageId, role: 'compaction' },
        },
      },
    })
  expect(calls).toBe(1)
  await backend.dispose()
  expect(ctx.get(agentCompactionKey)).toBeUndefined()
  expect(ok(await store.read(input.ref))?.state.phase).toBe('terminal')
  await fiber.dispose()
})

it('recovers previously admitted work from the durable store when a new plugin instance starts', async () => {
  const store = memory()
  const input = request()
  ok(
    await store.change(input.ref, () =>
      succeed({
        record: {
          request: input,
          execution: null,
          cancellation: null,
          acknowledgment: null,
          state: {
            ref: input.ref,
            revision: '1',
            phase: 'pending',
            knowledge: 'accepted',
            physical: 'pending',
          },
        },
        value: undefined,
      }),
    ),
  )
  const ctx = new Context()
  const fiber = await ctx.plugin(
    createContextCompactionPlugin({
      inject: [],
      pollMs: 5,
      create: async () => ({
        authority: input.ref.authority,
        adoption,
        store,
        authorize: async () => succeed(undefined),
        custody: async () => succeed(undefined),
        executor: {
          advance: async () =>
            succeed({
              phase: 'terminal',
              physical: 'settled',
              outcome: {
                kind: 'cannot-fit',
                reason: 'protected-floor',
                diagnostic: 'protected history',
              },
            }),
          cancel: async () => succeed('settled'),
        },
      }),
    }),
  )
  await expect
    .poll(async () => ok(await store.read(input.ref))?.state)
    .toMatchObject({
      phase: 'terminal',
      outcome: { kind: 'cannot-fit', reason: 'protected-floor' },
    })
  await fiber.dispose()
})
