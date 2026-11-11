// The application's sweep schedule closes cleanly while a step is still waiting on the Tool sweep.
import { expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { createBodySweep } from '../../../src/rows/tool-runtime/body-sweep.ts'
import { tenantCodec } from '@omne-harness/legal-identity'
import { testingTenant } from '@omne-harness/session-contract/testing'

const encoded = tenantCodec.encode(
  testingTenant('org_app1st0rage000000000000000', 'acc_app1st0rage000000000000000'),
)
if (!encoded.ok) throw new Error('fixture tenant')
const tenant = encoded.value

it('a close during a waiting step lets the step finish and the close settle without an error', async () => {
  let release: () => void = () => undefined
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  let entered: () => void = () => undefined
  const sweeping = new Promise<void>(resolve => {
    entered = resolve
  })
  const domains = {
    enumerate: async () => ({ kind: 'listed' as const, entries: [{ tenant }, { tenant }] }),
  } as unknown as TenantDomains<string>
  const schedule = createBodySweep({
    domains,
    scanner: 'scanner',
    clock: { now: () => '2026-11-10T00:00:00.000Z' as ToolInstant },
    sweep: async () => {
      entered()
      await waiting
      return succeed({ reclaimed: 0, removed: 0 })
    },
    limit: 10,
  })
  const step = schedule.advance()
  await sweeping
  const closing = schedule.close()
  release()
  await expect(closing).resolves.toBeUndefined()
  const answer = await step
  expect('failure' in answer ? answer.failure.kind : answer.ok.tenants).not.toBeUndefined()
  expect(await schedule.advance()).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('counts the bodies reclaimed and the call domains removed, and asks again while a batch is full', async () => {
  const answers = [
    { reclaimed: 1, removed: 1 },
    { reclaimed: 0, removed: 1 },
  ]
  const schedule = createBodySweep({
    domains: {
      enumerate: async () => ({ kind: 'listed' as const, entries: [{ tenant }] }),
    } as unknown as TenantDomains<string>,
    scanner: 'scanner',
    clock: { now: () => '2026-11-10T00:00:00.000Z' as ToolInstant },
    sweep: async () => succeed(answers.shift() ?? { reclaimed: 0, removed: 0 }),
    limit: 2,
  })
  expect(await schedule.advance()).toEqual({
    ok: { tenants: 1, reclaimed: 1, removed: 2, failures: 0, roundComplete: true },
  })
  expect(answers).toEqual([])
})
