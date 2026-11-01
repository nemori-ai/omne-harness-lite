// M4-3: an admission holds in one commit. The qualification result (the initiator), the frozen
// owner declaration, the call and its share of the tenant capacity are written by the one commit
// that binds the admission operation. When that commit fails, none of them exists.
import { describe, expect, it } from 'vitest'
import { OWNER, callId, opId, sqlCommands, tenantOf, textOf } from './fixture.ts'
import { COMMAND_RESERVE_BYTES } from '@omne-harness/model-storage-sql'

const A = tenantOf('a')
const LIMITS = {
  scanPageCalls: 2,
  resultPageParts: 1,
  resultPageTargetBytes: 1024,
  readIdleMs: 1000,
  capacity: { bytes: '250000', blocks: '1000', attachmentBytes: '1000000' },
}

function setup(overrides: Parameters<typeof sqlCommands>[1] = {}) {
  const subject = sqlCommands([A], { limits: LIMITS, ...overrides })
  const rowsOf = (call: string) => ({
    call: subject.sqlite.rows(
      subject.domain,
      `SELECT initiator, owner, cap_bytes, cap_blocks, cap_attachment, admission
         FROM md_call WHERE tenant = ? AND call = ?`,
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
  it('writes the initiator, the owner declaration, the call with its capacity and the binding in one commit', async () => {
    const { commands, sqlite, core, rowsOf } = setup()
    const admit = core.admitOf(A, callId('one'), opId('admit-one'))
    const commits = sqlite.commits()
    const admitted = await commands.admit(admit)
    expect('ok' in admitted && admitted.ok.recovered).toBe(false)
    expect(sqlite.commits() - commits).toBe(1)
    const { call, operations } = rowsOf('mcall_one')
    expect(call).toHaveLength(1)
    const [initiator, owner, bytes, blocks, attachment, admission] = call[0] ?? []
    expect(JSON.parse(String(initiator))).toEqual({
      owner: 'identity',
      subject: admit.principal.subject,
      revision: '1',
    })
    expect(JSON.parse(String(owner))).toEqual(OWNER)
    expect([bytes, blocks, attachment]).toEqual([100000n, 100n, 100000n])
    expect(admission).toBe('mop_admit-one')
    expect(operations).toEqual([['mop_admit-one', 'admit']])
  })

  it('refuses the call at the commit when a concurrent admission took the share, and keeps none of it', async () => {
    const { commands, sqlite, core, rowsOf, plant } = setup()
    expect('ok' in (await commands.admit(core.admitOf(A, callId('first'), opId('a1'))))).toBe(true)
    // The read of the second admission sees 100000 of 250000 held; the commit meets 200000.
    sqlite.hooks.beforeCommit = () => plant('mcall_first', 'mcall_concurrent')
    const admit = core.admitOf(A, callId('second'), opId('a2'))
    expect(await commands.admit(admit)).toEqual({
      failure: { kind: 'capacity', required: admit.capacity },
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

  it('refuses a call larger than maxCallBytes where it is admitted, before any commit (N1)', async () => {
    const small = 1000
    const { commands, sqlite, core, rowsOf } = setup({
      maxCallBytes: small,
      maxCommandBytes: small + COMMAND_RESERVE_BYTES,
    })
    const admit = core.admitOf(A, callId('large'), opId('a4'))
    expect(BigInt(admit.capacity.bytes)).toBeGreaterThan(BigInt(small))
    const commits = sqlite.commits()
    expect(await commands.admit(admit)).toEqual({
      failure: { kind: 'capacity', required: admit.capacity },
    })
    expect(sqlite.commits()).toBe(commits)
    expect(rowsOf('mcall_large')).toEqual({ call: [], operations: [] })
  })
})
