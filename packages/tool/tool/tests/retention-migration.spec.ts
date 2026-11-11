import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { ok } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

it('settles from owned materials without writing a second complete result through retainResult', async () => {
  const f = await settlementFixture()
  const settled = ok(await f.preserve())
  expect(settled.phase).toBe('settled')
  const result = (await f.records()).find(record => record.kind === 'result')
  if (result?.kind !== 'result' || result.result.custody.kind !== 'execution')
    throw new Error('missing result')
  expect(result.result.custody).not.toHaveProperty('retainOperation')
  expect(result.result.custody).not.toHaveProperty('retained')
  expect(result.result.custody.materialized.owner).toBe('@omne-harness/tool')
  expect((await f.records()).find(record => record.kind === 'environment-release')).toMatchObject({
    environmentRelease: { release: { custody: result.result.custody.materialized } },
  })
  expect(ok(await f.preserve())).toEqual(settled)
})
