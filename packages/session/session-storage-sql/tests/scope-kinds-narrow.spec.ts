import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import {
  CONTEXT_SCOPE_KINDS,
  contextScopesOf,
  type HistoryEntry,
  type SessionCommand,
} from '@omne-harness/session-contract'
import { operationId, sessionId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, type App } from './fixtures/app.ts'
import { SCHEMA_STATEMENTS } from '../src/worker/schema.ts'
import { kindOf } from './fixtures/entries.ts'

const base = { tenant: TENANT_A, session: sessionId('session-1') }

const control = (a: App, kind: 'archive' | 'unarchive', name: string) =>
  a.port.commit({
    access: a.access(TENANT_A),
    command: {
      kind: 'control',
      input: { ...base, operation: operationId(name), intent: { kind } },
    } as SessionCommand as never,
    guards: [],
  })

async function cycled() {
  const a = await app()
  expect(kindOf(await a.create(TENANT_A))).toBeUndefined()
  for (let at = 0; at < 40; at++)
    expect(kindOf(await a.accept(TENANT_A, 'session-1', `filler-${at}`))).toBeUndefined()
  expect(kindOf(await control(a, 'archive', 'archive-1'))).toBeUndefined()
  expect(kindOf(await control(a, 'unarchive', 'unarchive-1'))).toBeUndefined()
  return a
}

async function readKinds(a: App, kinds: readonly string[]) {
  const page = await a.port.history.begin({
    ...a.access(TENANT_A),
    kinds,
    from: null,
    direction: 'forward',
    pageBytes: 1 << 20,
  })
  if (!('ok' in page)) throw new Error(`history read failed: ${JSON.stringify(page)}`)
  return page.ok
}

function pagePlan(a: App, from: number): string {
  const statement = a.provider.readSql.slice(from).find(sql => /\bkind IN\b/.test(sql))
  if (statement === undefined) throw new Error('no page statement')
  const params = Array.from(statement.matchAll(/\?/g), () => 'x')
  const db = new DatabaseSync(':memory:')
  for (const text of SCHEMA_STATEMENTS) db.exec(text)
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${statement}`).all(...params) as { detail: string }[]
  db.close()
  return rows.map(row => row.detail).join('\n')
}

describe('the current context scope', () => {
  it('reads the last binding with an indexed final chunk and preserves ended state', async () => {
    const a = await cycled()
    const access = a.access(TENANT_A)
    const work = await a.port.readWork(access)
    if (!('ok' in work)) throw new Error('missing work')
    const from = a.provider.readSql.length
    expect(await a.port.readCurrentScope(access)).toEqual({ ok: work.ok.contextScopes?.at(-1) })
    const sql = a.provider.readSql.slice(from)
    expect(sql).toHaveLength(3)
    expect(sql.filter(query => /sl_state_item/.test(query))).toEqual([
      expect.stringMatching(/path = \? ORDER BY seq DESC LIMIT 1/),
    ])
    expect(sql.some(query => /sl_entry|SELECT snapshot/.test(query))).toBe(false)
    expect(kindOf(await control(a, 'archive', 'archive-2'))).toBeUndefined()
    expect(await a.port.readCurrentScope(access)).toMatchObject({
      ok: { generation: '2', ended: expect.any(Object) },
    })
    a.provider.seed('dom_0', 'UPDATE sl_state SET covered = 0')
    expect(await a.port.readCurrentScope(access)).toHaveProperty('failure.kind', 'unavailable')
  })
})

describe('the scope read of one kind', () => {
  it('asks only the history handler, never the state row, and its page is an index read of that kind', async () => {
    const a = await cycled()
    const calls = a.provider.calls.length
    const sql = a.provider.readSql.length
    const entries: HistoryEntry[] = []
    for (const kind of CONTEXT_SCOPE_KINDS) {
      const before = a.provider.readSql.length
      const page = await readKinds(a, [kind])
      expect(page.exhausted).toBe(true)
      entries.push(...page.entries)
      expect(pagePlan(a, before)).toContain('USING INDEX sl_kind_idx')
    }
    const handlers = a.provider.calls
      .slice(calls)
      .flatMap(call => (call.kind === 'read' ? [call.handler] : []))
    expect(new Set(handlers)).toEqual(new Set(['session.history']))
    expect(a.provider.readSql.slice(sql).filter(text => /sl_state/.test(text))).toEqual([])
    expect(entries.map(entry => entry.kind)).toEqual(['session.archived', 'session.unarchived'])
    const work = await a.port.readWork(a.access(TENANT_A))
    if (!('ok' in work)) throw new Error('readWork failed')
    const folded = contextScopesOf(base, entries)
    expect(folded).toEqual({
      ok: (work.ok.contextScopes ?? []).map(({ generation, scope, ended }) => ({
        generation,
        scope,
        ended,
      })),
    })
  })

  it('a read of the two kinds together is not served from the kind index', async () => {
    const a = await cycled()
    const sql = a.provider.readSql.length
    await readKinds(a, CONTEXT_SCOPE_KINDS)
    expect(pagePlan(a, sql)).not.toContain('sl_kind_idx')
  })
})
