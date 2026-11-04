// The read that AD-03 makes for the Context scopes of a session (SCOPE-NARROW, R2-D229): a history
// read of one kind of `CONTEXT_SCOPE_KINDS` (SE27, SE28). What is checked: it asks only the history
// handler, runs no SQL on the state row, and its page statement is served from the kind index
// `sl_kind_idx`, so the rows it visits are the entries of that kind, not the history of the
// session. A read of two kinds is not served from the kind index, which is why the reader asks each
// kind alone. The plan is that of the node:sqlite test double, the same engine as the provider.
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

/** A session with a long history and one archive cycle. */
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

/**
 * The plan of the page statement (the one that filters on the kinds) of the reads since `from`, on
 * a database with the Session log tables: the fixture's own port runs only row reads.
 */
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
    // The two entries are all the read returns, and they fold to the snapshot's scopes.
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
