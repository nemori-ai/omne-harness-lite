import type { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { TenantDomains } from '@omne-harness/sql-contract'
import type { LedgerDueRead, ToolLedgerStore } from '@omne-harness/tool'
import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import {
  createBodySweep,
  createDueTenants,
  type BodySweepInput,
} from '../../../src/rows/tool-runtime/body-sweep.ts'
import {
  lateStore,
  toolRuntimeHolder,
  type ToolSqlPorts,
} from '../../../src/rows/tool-runtime/holder.ts'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { testingTenant } from '@omne-harness/session-contract/testing'

const tenantA = testingTenant('org_app1st0rage000000000000000', 'acc_app1st0rage000000000000000')
const tenantB = testingTenant('org_app2st0rage000000000000000', 'acc_app2st0rage000000000000000')
const textOf = (tenant: TenantId) => {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture tenant')
  return encoded.value
}
const A = textOf(tenantA)
const B = textOf(tenantB)

const START = Date.parse('2026-11-10T00:00:00.000Z')
const instant = (ms: number) => new Date(ms).toISOString() as ToolInstant

function world(
  options: Readonly<{
    tenants?: readonly string[]
    sweep?: BodySweepInput<string>['sweep']
    earliest?: (tenant: string) => number | null | 'unavailable'
    limit?: number
  }> = {},
) {
  let now = START
  const swept: string[] = []
  const indexed: string[] = []
  const warnings: string[] = []
  const due = createDueTenants()
  const dueIndex: ToolLedgerStore['due'] = async tenant => {
    indexed.push(textOf(tenant))
    const at = options.earliest?.(textOf(tenant)) ?? null
    if (at === 'unavailable') return { kind: 'unavailable', diagnostic: 'due read: queue_timeout' }
    const read: LedgerDueRead = {
      kind: 'complete',
      entries:
        at === null ? [] : [{ domain: {} as never, key: 'body', dueAt: instant(START + at) }],
    }
    return read
  }
  const schedule = createBodySweep({
    domains: {
      enumerate: async () => ({
        kind: 'ready' as const,
        revision: '1',
        entries: (options.tenants ?? [A, B]).map(tenant => ({ tenant })),
      }),
    } as unknown as TenantDomains<string>,
    scanner: 'scanner',
    clock: { now: () => instant(now) },
    sweep: async (tenant, at, limit) => {
      swept.push(textOf(tenant))
      return options.sweep === undefined
        ? succeed({ reclaimed: 0, removed: 0 })
        : options.sweep(tenant, at, limit)
    },
    dueIndex,
    due,
    limit: options.limit ?? 10,
    warn: message => void warnings.push(message),
  })
  return {
    schedule,
    due,
    swept,
    indexed,
    warnings,
    dueTenants: () => due.ready(Infinity).length,
    async at(ms: number) {
      now = START + ms
      return schedule.advance()
    },
  }
}

it('a close during a waiting step lets the step finish and the close settle without an error', async () => {
  let release: () => void = () => undefined
  const waiting = new Promise<void>(resolve => {
    release = resolve
  })
  let entered: () => void = () => undefined
  const sweeping = new Promise<void>(resolve => {
    entered = resolve
  })
  const w = world({
    sweep: async () => {
      entered()
      await waiting
      return succeed({ reclaimed: 0, removed: 0 })
    },
  })
  const step = w.schedule.advance()
  await sweeping
  const closing = w.schedule.close()
  release()
  await expect(closing).resolves.toBeUndefined()
  const answer = await step
  expect('failure' in answer ? answer.failure.kind : answer.ok.tenants).not.toBeUndefined()
  expect(await w.schedule.advance()).toMatchObject({ failure: { kind: 'unavailable' } })
})

it('counts the bodies reclaimed and the call domains removed, and asks again while a batch is full', async () => {
  const answers = [
    { reclaimed: 1, removed: 1 },
    { reclaimed: 0, removed: 1 },
  ]
  const w = world({
    tenants: [A],
    sweep: async () => succeed(answers.shift() ?? { reclaimed: 0, removed: 0 }),
    limit: 2,
  })
  expect(await w.at(0)).toEqual({ ok: { tenants: 1, reclaimed: 1, removed: 2, failures: 0 } })
  expect(answers).toEqual([])
})

it('sweeps every tenant once at startup, then only a tenant whose due entry has come', async () => {
  const w = world({ earliest: tenant => (tenant === A ? 5000 : null) })
  await w.at(0)
  expect(w.swept).toEqual([A, B])
  expect(w.indexed).toEqual([A, B])
  for (const ms of [1000, 2000, 3000, 4000, 4999]) await w.at(ms)
  expect(w.swept).toEqual([A, B])
  expect(w.indexed).toEqual([A, B])
  await w.at(5000)
  expect(w.swept).toEqual([A, B, A])
  expect(w.dueTenants()).toBe(1)
})

it('a due entry written in this process brings its tenant back when it comes due', async () => {
  const w = world()
  await w.at(0)
  expect(w.dueTenants()).toBe(0)
  w.due.note(tenantB, instant(START + 30_000))
  for (let ms = 1000; ms < 30_000; ms += 1000) await w.at(ms)
  expect(w.swept).toEqual([A, B])
  await w.at(30_000)
  expect(w.swept).toEqual([A, B, B])
  expect(w.dueTenants()).toBe(0)
})

it('a due entry noted while its tenant is swept is kept for the next visit', async () => {
  let note: () => void = () => undefined
  const w = world({
    tenants: [A],
    sweep: async () => {
      note()
      return succeed({ reclaimed: 0, removed: 0 })
    },
  })
  note = () => w.due.note(tenantA, instant(START + 10_000))
  await w.at(0)
  note = () => undefined
  await w.at(9999)
  expect(w.swept).toEqual([A])
  await w.at(10_000)
  expect(w.swept).toEqual([A, A])
})

it('a tenant that cannot be swept backs off 1, 5 and 30 seconds and does not hold the other', async () => {
  let down = true
  const w = world({
    sweep: async tenant =>
      textOf(tenant) === A && down
        ? fail({
            kind: 'unavailable' as const,
            dependency: 'ledger-store',
            diagnostic: 'queue_timeout',
          })
        : succeed({ reclaimed: 0, removed: 0 }),
  })
  expect(await w.at(0)).toEqual({ ok: { tenants: 1, reclaimed: 0, removed: 0, failures: 1 } })
  expect(w.swept).toEqual([A, B])
  const sweepsOfA = () => w.swept.filter(tenant => tenant === A).length
  let t = 0
  for (const [wait, count] of [
    [1000, 2],
    [5000, 3],
    [30_000, 4],
    [30_000, 5],
  ] as const) {
    await w.at(t + wait - 1)
    expect(sweepsOfA()).toBe(count - 1)
    t += wait
    await w.at(t)
    expect(sweepsOfA()).toBe(count)
  }
  const line = (ms: number) =>
    `body sweep of tenant ${A} failed (queue_timeout); it goes on in ${ms} ms.`
  expect(w.warnings).toEqual([line(1000), line(30_000), line(30_000), line(30_000)])
  expect(w.swept.filter(tenant => tenant === B)).toHaveLength(1)
  down = false
  t += 30_000
  await w.at(t)
  expect(w.dueTenants()).toBe(0)
  down = true
  w.due.note(tenantA, instant(START + t))
  await w.at(t)
  expect(w.warnings.at(-1)).toBe(line(1000))
})

it('a due read that cannot answer keeps the tenant and backs it off', async () => {
  const w = world({ tenants: [A], earliest: () => 'unavailable' })
  expect(await w.at(0)).toEqual({ ok: { tenants: 0, reclaimed: 0, removed: 0, failures: 1 } })
  expect(w.warnings).toEqual([
    `body sweep of tenant ${A} failed (due read: queue_timeout); it goes on in 1000 ms.`,
  ])
  await w.at(999)
  expect(w.swept).toEqual([A])
  await w.at(1000)
  expect(w.swept).toEqual([A, A])
})

it('a tenant listing that fails is retried by the same ladder; the tenants already due are swept meanwhile', async () => {
  let listing = 0
  const due = createDueTenants()
  const swept: string[] = []
  const warnings: string[] = []
  let now = START
  const schedule = createBodySweep({
    domains: {
      enumerate: async () => {
        listing += 1
        return listing === 1
          ? { kind: 'unavailable' as const, diagnostic: 'down' }
          : { kind: 'ready' as const, revision: '1', entries: [{ tenant: A }] }
      },
    } as unknown as TenantDomains<string>,
    scanner: 'scanner',
    clock: { now: () => instant(now) },
    sweep: async tenant => {
      swept.push(textOf(tenant))
      return succeed({ reclaimed: 0, removed: 0 })
    },
    dueIndex: async () => ({ kind: 'complete', entries: [] }),
    due,
    limit: 10,
    warn: message => void warnings.push(message),
  })
  due.note(tenantB, instant(START))
  await schedule.advance()
  expect(swept).toEqual([B])
  expect(warnings).toEqual(['body sweep: tenant enumeration: down; it goes on in 1000 ms.'])
  now = START + 999
  await schedule.advance()
  expect(listing).toBe(1)
  now = START + 1000
  await schedule.advance()
  expect(listing).toBe(2)
  expect(swept).toEqual([B, A])
})

it('the commits of this process note the due entries they write, also when the answer is unknown', async () => {
  const holder = toolRuntimeHolder({ root: {} } as unknown as Context)
  let answer: 'committed' | 'unknown' | 'conflict' = 'committed'
  holder.sql = {
    store: {
      durability: 'durable',
      commit: async () => ({ kind: answer, diagnostic: 'lost', current: '1' }),
    },
  } as unknown as ToolSqlPorts
  const store = lateStore(holder)
  const commit = (tenant: TenantId, ms: number) =>
    store.commit({
      domain: { kind: 'call', tenant, call: 'c' },
      expected: '1',
      revision: '2',
      writes: [{ kind: 'schedule', key: 'body', dueAt: instant(START + ms) }],
    } as never)
  await commit(tenantA, 5000)
  answer = 'unknown'
  await commit(tenantB, 7000)
  answer = 'conflict'
  await commit(testingTenant('org_app3st0rage000000000000000', 'acc_app3st0rage000000000000000'), 1)
  expect(holder.bodyDue.ready(START + 4999)).toEqual([])
  expect(holder.bodyDue.ready(START + 7000).map(slot => textOf(slot.tenant))).toEqual([A, B])
})
