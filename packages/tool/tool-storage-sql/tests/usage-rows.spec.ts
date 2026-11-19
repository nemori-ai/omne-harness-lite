// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import type { LedgerDomain, LedgerUsageQuery } from '@omne-harness/tool'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import { decodeToolRevision, type ToolUsageFact } from '@omne-harness/tool-contract/provider'
import {
  domainNameOf,
  openApp,
  TENANT_A,
  TENANT_B,
  textOf,
  UNREGISTERED,
  type App,
} from './fixtures/app.ts'

const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

async function app(): Promise<App> {
  const created = await openApp({})
  opened.push(created)
  return created
}

function decoded<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error('fixture identity is not legal')
  return answer.ok
}

const call = (text: string): ToolCallId => decoded(decodeToolCallId(text))
const T = (seconds: number) => new Date(Date.UTC(2026, 10, 19, 12, 0, seconds)).toISOString()

function fact(name: string, start: string | null, work = 'exec-1', revision = '1'): ToolUsageFact {
  return {
    call: call(name),
    consumer: { owner: 'agent', work, position: 'p', purpose: 'main' },
    tool: 'Shell',
    start,
    outcome: { kind: 'failed', cause: 'executor' },
    account: {
      subject: { kind: 'tool_execution', id: name },
      usage: [],
      cost: [],
      trimmed: { state: 'known', lexeme: '0', unit: 'bytes' },
      place: 'tool-ledger',
      duration: 'PT1.000S',
      receipt: revision === '1' ? 'received' : 'late',
      revision,
    },
  }
}

/** Writes the usage row of each fact in its call domain, one commit per fact. */
async function written(a: App, rows: readonly (readonly [typeof TENANT_A, ToolUsageFact])[]) {
  const revisions = new Map<string, number>()
  for (const [tenant, item] of rows) {
    const key = `${textOf(tenant)}/${item.call}`
    const at = revisions.get(key) ?? 0
    const domain: LedgerDomain = { kind: 'call', tenant, call: item.call }
    expect(
      await a.store.commit({
        domain,
        expected: decoded(decodeToolRevision(String(at))),
        revision: decoded(decodeToolRevision(String(at + 1))),
        writes: [{ kind: 'usage', fact: item }],
      }),
    ).toEqual({ kind: 'committed' })
    revisions.set(key, at + 1)
  }
}

const query = (over: Partial<LedgerUsageQuery> = {}): LedgerUsageQuery => ({
  tenant: TENANT_A,
  range: null,
  consumer: null,
  order: 'ascending',
  after: null,
  limit: 10,
  ...over,
})

const calls = (read: Awaited<ReturnType<App['store']['usage']>>) =>
  read.kind === 'page' ? read.facts.map(item => item.call) : read

describe('the usage rows of the SQL ledger (C18)', () => {
  it('keeps the fact as written, one row per call, the later write replacing it', async () => {
    const a = await app()
    await written(a, [
      [TENANT_A, fact('c1', T(1))],
      [TENANT_A, fact('c1', T(1), 'exec-1', '2')],
    ])
    const read = await a.store.usage(query())
    expect(read).toEqual({
      kind: 'page',
      facts: [fact('c1', T(1), 'exec-1', '2')],
      undated: 0,
      more: false,
    })
  })

  it('keeps the row after the call domain is dropped, as the sweep drops it', async () => {
    const a = await app()
    await written(a, [[TENANT_A, fact('c1', T(1))]])
    expect(
      await a.store.commit({
        domain: { kind: 'call', tenant: TENANT_A, call: call('c1') },
        expected: decoded(decodeToolRevision('1')),
        revision: decoded(decodeToolRevision('0')),
        writes: [{ kind: 'drop' }],
      }),
    ).toEqual({ kind: 'committed' })
    const left = a.sqlite.inspect(
      domainNameOf(TENANT_A),
      'SELECT key FROM tl_record WHERE tenant = ?',
      [textOf(TENANT_A)],
    )
    expect(left).toEqual([])
    expect(calls(await a.store.usage(query()))).toEqual([call('c1')])
  })

  it('orders by start then call either way, takes a range and a consumer scope, and counts the undated', async () => {
    const a = await app()
    await written(a, [
      [TENANT_A, fact('c2', T(2), 'exec-1/step')],
      [TENANT_A, fact('c1', T(2))],
      [TENANT_A, fact('c3', T(3), 'exec-2')],
      [TENANT_A, fact('c4', T(1), 'exec-10')],
      [TENANT_A, fact('c5', null, 'exec-1')],
    ])
    expect(calls(await a.store.usage(query()))).toEqual([
      call('c4'),
      call('c1'),
      call('c2'),
      call('c3'),
    ])
    expect(calls(await a.store.usage(query({ order: 'descending' })))).toEqual([
      call('c3'),
      call('c2'),
      call('c1'),
      call('c4'),
    ])
    expect(calls(await a.store.usage(query({ range: { from: T(2), to: T(2) } })))).toEqual([
      call('c1'),
      call('c2'),
    ])
    const scoped = await a.store.usage(query({ consumer: { owner: 'agent', works: ['exec-1'] } }))
    expect(calls(scoped)).toEqual([call('c1'), call('c2')])
    expect(scoped).toMatchObject({ undated: 1 })
    expect(await a.store.usage(query({ consumer: { owner: 'other', works: ['exec-1'] } }))).toEqual(
      {
        kind: 'page',
        facts: [],
        undated: 0,
        more: false,
      },
    )
  })

  it('takes the rows under any work of the scope and not a sibling that only shares its text', async () => {
    const a = await app()
    await written(a, [
      [TENANT_A, fact('c1', T(1), 'exec-1')],
      [TENANT_A, fact('c2', T(2), 'exec-1/step')],
      [TENANT_A, fact('c3', T(3), 'exec-1-b')],
      [TENANT_A, fact('c4', T(4), 'exec-2')],
      [TENANT_A, fact('c5', T(5), 'exec-3')],
      [TENANT_A, fact('c6', null, 'exec-2/step')],
    ])
    const scoped = await a.store.usage(
      query({ consumer: { owner: 'agent', works: ['exec-1', 'exec-2'] } }),
    )
    expect(calls(scoped)).toEqual([call('c1'), call('c2'), call('c4')])
    expect(scoped).toMatchObject({ undated: 1 })
  })

  it('pages after a position, saying whether more remain', async () => {
    const a = await app()
    await written(a, [
      [TENANT_A, fact('c1', T(1))],
      [TENANT_A, fact('c2', T(1))],
      [TENANT_A, fact('c3', T(2))],
    ])
    const first = await a.store.usage(query({ limit: 2 }))
    expect(first).toMatchObject({ kind: 'page', more: true })
    expect(calls(first)).toEqual([call('c1'), call('c2')])
    const rest = await a.store.usage(query({ limit: 2, after: { start: T(1), call: call('c2') } }))
    expect(rest).toMatchObject({ kind: 'page', more: false })
    expect(calls(rest)).toEqual([call('c3')])
    const back = await a.store.usage(
      query({ order: 'descending', after: { start: T(2), call: call('c3') } }),
    )
    expect(calls(back)).toEqual([call('c2'), call('c1')])
  })

  it('answers another tenant without the rows of this one, and a tenant with no domain with an empty page', async () => {
    const a = await app()
    await written(a, [[TENANT_A, fact('c1', T(1))]])
    expect(await a.store.usage(query({ tenant: TENANT_B }))).toEqual({
      kind: 'page',
      facts: [],
      undated: 0,
      more: false,
    })
    expect(await a.store.usage(query({ tenant: UNREGISTERED }))).toEqual({
      kind: 'page',
      facts: [],
      undated: 0,
      more: false,
    })
  })
})
