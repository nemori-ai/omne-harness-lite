import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createToolMaterialMaintenance } from '@omne-harness/tool'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, guards, ok, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('expires and reclaims the original call through the narrow maintenance entry', async () => {
  let now = 0
  const clock = {
    sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
  }
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 2048, maxRetentionMs: 10 },
    wrapMaterialClock: () => clock,
    value: {
      content: [text('body', 'long body '.repeat(210))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const before = await f.load()
  const maintenance = createToolMaterialMaintenance({
    store: f.harness.memory,
    access: guards().access,
    materials: { clock, store: f.materialStore },
    ledgerCommitAttempts: 4,
  })
  now = 10
  expect(ok(await maintenance.expire(f.access))).toMatchObject({
    expiredBodies: 1,
    cleanupPending: true,
  })
  for (let step = 0; step < 16; step += 1) {
    if (ok(await maintenance.reclaim(f.access)).kind === 'idle') break
  }
  expect((await f.records()).filter(row => row.kind === 'material-cleanup')).toEqual([])
  expect((await f.records()).find(row => row.kind === 'material-maintenance-hint')).toEqual({
    kind: 'material-maintenance-hint',
    hint: { kind: 'none' },
  })
  expect((await f.load()).state).toEqual(before.state)
})
