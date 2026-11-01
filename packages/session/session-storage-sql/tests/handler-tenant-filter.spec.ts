// Defence in depth: every read handler filters on the tenant itself, not only through the domain
// the port picked. Rows of tenant B are planted in the domain of tenant A (a corrupt or mixed
// store, which the port must not turn into a read across tenants).
import { describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, TENANT_B, textOf, type App } from './fixtures/app.ts'
import { kindOf } from './fixtures/entries.ts'

async function planted(): Promise<App> {
  const a = await app()
  const b = textOf(TENANT_B)
  const domain = 'dom_0'
  a.provider.seed(
    domain,
    'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, 1, 1, ?)',
    [b, 'ghost', 'epoch:0'],
  )
  a.provider.seed(
    domain,
    "INSERT INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, '{}', 1)",
    [b, 'ghost'],
  )
  a.provider.seed(
    domain,
    "INSERT INTO sl_input (tenant, session, input, value) VALUES (?, ?, 'in-1', '{}')",
    [b, 'ghost'],
  )
  a.provider.seed(
    domain,
    "INSERT INTO sl_entry (tenant, session, position, revision, kind, entry, bytes) VALUES (?, ?, 1, 1, 'x', '{}', 2)",
    [b, 'ghost'],
  )
  a.provider.seed(
    domain,
    "INSERT INTO sl_operation (tenant, session, operation, input_digest, form, revision, receipt, result) VALUES (?, ?, 'sop_x', 'd', 'batch', 1, '{}', '{}')",
    [b, 'ghost'],
  )
  a.provider.seed(
    domain,
    "INSERT INTO sl_pending_idx (tenant, reason, session) VALUES (?, 'inputs', ?)",
    [b, 'ghost'],
  )
  return a
}
describe('rows of another tenant inside the domain of tenant A', () => {
  it('readWork, readInput, readModelSelection and history answer denied, as for a session that never was', async () => {
    const a = await planted()
    const access = a.access(TENANT_A, 'ghost')
    expect(kindOf(await a.port.readWork(access))).toBe('denied')
    expect(kindOf(await a.port.readInput({ ...access, input: 'in-1' as never }))).toBe('denied')
    expect(kindOf(await a.port.readModelSelection(access))).toBe('denied')
    expect(
      kindOf(
        await a.port.history.begin({
          ...access,
          kinds: [],
          from: null,
          direction: 'forward',
          pageBytes: 1000,
        }),
      ),
    ).toBe('denied')
  })

  it('the receipt lookup does not find the operation of the other tenant', async () => {
    const a = await planted()
    expect(
      kindOf(
        await a.port.queryOperation({
          ...a.access(TENANT_A, 'ghost'),
          operation: operationId('x'),
        }),
      ),
    ).toBe('denied')
  })

  it('pending does not list the session of the other tenant', async () => {
    const a = await planted()
    const listed = await a.port.pending({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
    })
    expect(listed).toEqual({ ok: { sessions: [], next: null } })
  })
})
