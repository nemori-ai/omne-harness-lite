import { describe, expect, it } from 'vitest'
import type { ToolUsageFact } from '@omne-harness/tool-contract/provider'
import { createToolAccounts, type ToolAccountsGuard } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import type { AccessVerdict } from '../src/ledger-guards.ts'
import { callId, principalA, tenantA, tenantB } from './runtime-values.ts'

const account = (revision: string): ToolUsageFact['account'] =>
  ({ subject: { kind: 'tool_execution', id: 'c' }, revision, receipt: 'received' }) as never

function fact(name: string, start: string | null, work = 'exec-1', revision = '1'): ToolUsageFact {
  return {
    call: callId(name),
    consumer: { owner: 'agent', work, position: 'p', purpose: 'main' },
    tool: 'Shell',
    start,
    outcome: { kind: 'completed' },
    account: account(revision),
  }
}

/** A memory store holding these facts under their tenants, and the read over it with this verdict. */
async function accountsOver(
  rows: readonly (readonly [typeof tenantA, ToolUsageFact])[],
  verdict: AccessVerdict = { kind: 'allowed' },
) {
  const store = createMemoryToolLedgerStore()
  for (const [tenant, item] of rows) {
    const domain = { kind: 'call' as const, tenant, call: item.call }
    const read = await store.read(domain)
    if (read.kind !== 'complete') throw new Error('fixture store')
    await store.commit({
      domain,
      expected: read.revision,
      revision: `${String(Number(read.revision) + 1)}` as never,
      writes: [{ kind: 'usage', fact: item }],
    })
  }
  const asked: unknown[] = []
  const guard: ToolAccountsGuard<typeof principalA> = {
    qualify: input => (asked.push(input), Promise.resolve(verdict)),
  }
  const accounts = createToolAccounts(store, guard)
  const list = (query: Partial<Parameters<typeof accounts.list>[0]> = {}) =>
    accounts.list({
      principal: principalA,
      tenant: tenantA,
      range: null,
      consumer: null,
      order: 'ascending',
      after: null,
      limit: 10,
      ...query,
    })
  return { list, asked, store }
}

const T = (seconds: number) => new Date(Date.UTC(2026, 10, 19, 12, 0, seconds)).toISOString()

describe('the usage of a tenant, listed by start and consumer (C18)', () => {
  it('lists the dated calls in start order, counts the undated ones, and asks the guard for the tenant', async () => {
    const r = await accountsOver([
      [tenantA, fact('b', T(2))],
      [tenantA, fact('a', T(1))],
      [tenantA, fact('u', null)],
    ])
    const page = await r.list()
    expect(page).toMatchObject({ ok: { undated: 1, next: null } })
    if (!('ok' in page)) throw new Error('page')
    expect(page.ok.entries.map(item => item.call)).toEqual([callId('a'), callId('b')])
    expect(r.asked).toEqual([{ principal: principalA, tenant: tenantA }])
    const down = await r.list({ order: 'descending' })
    expect('ok' in down && down.ok.entries.map(item => item.call)).toEqual([
      callId('b'),
      callId('a'),
    ])
  })

  it('answers another tenant as if the calls did not exist', async () => {
    const r = await accountsOver([[tenantB, fact('theirs', T(1))]])
    expect(await r.list()).toEqual({ ok: { entries: [], undated: 0, next: null } })
  })

  it('keeps one row per call, the later write replacing the account', async () => {
    const r = await accountsOver([
      [tenantA, fact('once', T(1), 'exec-1', '1')],
      [tenantA, fact('once', T(1), 'exec-1', '2')],
    ])
    const page = await r.list()
    expect('ok' in page && page.ok.entries.map(item => item.account.revision)).toEqual(['2'])
  })

  it('takes a range on the start, both ends included, and a consumer scope with the works under it', async () => {
    const r = await accountsOver([
      [tenantA, fact('early', T(1), 'exec-1')],
      [tenantA, fact('mid', T(2), 'exec-1/step-2')],
      [tenantA, fact('late', T(3), 'exec-2')],
      [tenantA, fact('other', T(2), 'exec-10')],
      [tenantA, fact('none', null, 'exec-2')],
    ])
    const ranged = await r.list({ range: { from: T(2), to: T(3) } })
    expect('ok' in ranged && ranged.ok.entries.map(item => item.call)).toEqual([
      callId('mid'),
      callId('other'),
      callId('late'),
    ])
    const scoped = await r.list({ consumer: { owner: 'agent', works: ['exec-1'] } })
    expect('ok' in scoped && scoped.ok.entries.map(item => item.call)).toEqual([
      callId('early'),
      callId('mid'),
    ])
    expect(scoped).toMatchObject({ ok: { undated: 0 } })
    const other = await r.list({ consumer: { owner: 'agent', works: ['exec-2'] } })
    expect(other).toMatchObject({ ok: { undated: 1 } })
    const foreign = await r.list({ consumer: { owner: 'someone', works: ['exec-1'] } })
    expect(foreign).toMatchObject({ ok: { entries: [], undated: 0 } })
  })

  it('pages with a cursor bound to the query, and refuses it for another query or a forged one', async () => {
    const r = await accountsOver([
      [tenantA, fact('a', T(1))],
      [tenantA, fact('b', T(1))],
      [tenantA, fact('c', T(2))],
    ])
    const first = await r.list({ limit: 2 })
    if (!('ok' in first) || first.ok.next === null) throw new Error('a first page with more')
    expect(first.ok.entries.map(item => item.call)).toEqual([callId('a'), callId('b')])
    const second = await r.list({ limit: 2, after: first.ok.next })
    expect(second).toMatchObject({ ok: { next: null } })
    expect('ok' in second && second.ok.entries.map(item => item.call)).toEqual([callId('c')])
    expect(await r.list({ limit: 2, after: first.ok.next, order: 'descending' })).toEqual({
      failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
    })
    for (const forged of ['tu1.bm90LWpzb24', 'other', ''])
      expect(await r.list({ after: forged }), forged).toEqual({
        failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
      })
  })

  it('refuses a query of the wrong shape', async () => {
    const r = await accountsOver([])
    const refused = (field: string, reason: string) => ({
      failure: { kind: 'invalid', field, reason },
    })
    expect(await r.list({ limit: 0 })).toEqual(refused('limit', 'out-of-range'))
    expect(await r.list({ limit: 501 })).toEqual(refused('limit', 'out-of-range'))
    expect(await r.list({ limit: 1.5 })).toEqual(refused('limit', 'out-of-range'))
    expect(await r.list({ order: 'sideways' as never })).toEqual(refused('order', 'value'))
    for (const consumer of [
      { owner: '', works: ['w'] },
      { owner: 'o', works: [] },
      { owner: 'o', works: [''] },
      { owner: 'o', works: Array.from({ length: 65 }, (_, at) => `w${String(at)}`) },
    ])
      expect(await r.list({ consumer }), JSON.stringify(consumer)).toEqual(
        refused('consumer', 'shape'),
      )
    expect(await r.list({ range: { from: 'yesterday', to: T(1) } })).toEqual(
      refused('range', 'instant'),
    )
    expect(await r.list({ range: { from: T(2), to: T(1) } })).toEqual(refused('range', 'order'))
    expect(await r.list({ range: { from: T(1), to: T(1) } })).toMatchObject({ ok: {} })
  })

  it('answers denied or unavailable as the guard does, before it reads anything', async () => {
    const denied = await accountsOver([[tenantA, fact('a', T(1))]], {
      kind: 'denied',
      reason: 'not-member',
    })
    expect(await denied.list()).toEqual({ failure: { kind: 'denied', action: 'account' } })
    const down = await accountsOver([], { kind: 'unavailable', diagnostic: 'offline' })
    expect(await down.list()).toEqual({
      failure: { kind: 'unavailable', dependency: 'tool-access', diagnostic: 'offline' },
    })
  })
})
