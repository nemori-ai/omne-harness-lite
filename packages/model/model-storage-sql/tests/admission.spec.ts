// M4-3: an admission holds in one commit. The qualification result (the initiator), the frozen
// owner declaration, the call and its place in the tenant share are written by the one commit
// that binds the admission operation. When that commit fails, none of them exists.
import { describe, expect, it } from 'vitest'
import { OWNER, callId, opId, sqlCommands, tenantOf, textOf } from './fixture.ts'
import { PENDING_PAGE_MAX } from '@omne-harness/model-storage-sql'
import { unpackText } from '@omne-harness/sql-contract/worker'

const A = tenantOf('a')
const LIMITS = {
  scanPageCalls: 2,
  resultPageParts: 1,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  unacknowledgedResults: 2,
}

function setup(overrides: Parameters<typeof sqlCommands>[1] = {}) {
  const subject = sqlCommands([A], { limits: LIMITS, ...overrides })
  const rowsOf = (call: string) => ({
    call: subject.sqlite.rows(
      subject.domain,
      'SELECT initiator, owner, admission FROM md_call WHERE tenant = ? AND call = ?',
      [textOf(A), call],
    ),
    operations: subject.sqlite.rows(
      subject.domain,
      'SELECT operation, method FROM md_operation WHERE tenant = ? AND call = ?',
      [textOf(A), call],
    ),
  })
  /** Copies the stored call `from` as another call `to`, as a concurrent admission would. */
  const plant = (from: string, to: string) => {
    for (const sql of [
      'CREATE TEMP TABLE planted AS SELECT * FROM md_call WHERE tenant = ? AND call = ?',
      `UPDATE planted SET call = '${to}'`,
      'INSERT INTO md_call SELECT * FROM planted',
      'DROP TABLE planted',
    ])
      subject.sqlite.seed(subject.domain, sql, sql.includes('?') ? [textOf(A), from] : [])
  }
  return { ...subject, rowsOf, plant }
}

describe('an admission in one commit', () => {
  it('writes the initiator, the owner declaration, the call and the binding in one commit', async () => {
    const { commands, sqlite, core, rowsOf } = setup()
    const admit = core.admitOf(A, callId('one'), opId('admit-one'))
    const commits = sqlite.commits()
    const admitted = await commands.admit(admit)
    expect('ok' in admitted && admitted.ok.recovered).toBe(false)
    expect(sqlite.commits() - commits).toBe(1)
    const { call, operations } = rowsOf('mcall_one')
    expect(call).toHaveLength(1)
    const [initiator, owner, admission] = call[0] ?? []
    expect(JSON.parse(unpackText(initiator as Uint8Array))).toEqual({
      owner: 'identity',
      subject: admit.principal.subject,
      revision: '1',
    })
    expect(JSON.parse(unpackText(owner as Uint8Array))).toEqual(OWNER)
    expect(admission).toBe('mop_admit-one')
    expect(operations).toEqual([['mop_admit-one', 'admit']])
  })

  it('answers unavailable at the commit when a concurrent admission took the share, and keeps none of it', async () => {
    const { commands, sqlite, core, rowsOf, plant } = setup()
    expect('ok' in (await commands.admit(core.admitOf(A, callId('first'), opId('a1'))))).toBe(true)
    // The read of the second admission sees one of two places held; the commit meets two.
    sqlite.hooks.beforeCommit = () => plant('mcall_first', 'mcall_concurrent')
    const admit = core.admitOf(A, callId('second'), opId('a2'))
    expect(await commands.admit(admit)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-capacity',
        diagnostic: 'the tenant share is full at the commit',
      },
    })
    expect(rowsOf('mcall_second')).toEqual({ call: [], operations: [] })
  })

  it('keeps none of the admission when the storage rejects its commit', async () => {
    const { commands, sqlite, core, rowsOf } = setup()
    sqlite.hooks.rejectNext = 'queue_full'
    const admitted = await commands.admit(core.admitOf(A, callId('rejected'), opId('a3')))
    expect('failure' in admitted && admitted.failure.kind).toBe('unavailable')
    expect(rowsOf('mcall_rejected')).toEqual({ call: [], operations: [] })
  })

  it('refuses at construction a scan page larger than one model.pending page', () => {
    const page = (scanPageCalls: number) => () =>
      sqlCommands([A], { limits: { ...LIMITS, scanPageCalls } })
    expect(page(PENDING_PAGE_MAX)).not.toThrow()
    expect(page(PENDING_PAGE_MAX + 1)).toThrow(RangeError)
  })
})
