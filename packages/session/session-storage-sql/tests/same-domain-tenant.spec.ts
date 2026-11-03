// Two tenants in ONE transaction domain. The test providers of the other specs put each tenant in
// its own domain, so a statement that lost its `tenant = ?` predicate still read nothing of the
// other tenant there. Here the rows of tenant A are in the same database that tenant B reads: only
// the predicate keeps them apart. Each case has a control read as tenant A, so a read that is empty
// for another reason cannot pass for isolation.
import { describe, expect, it } from 'vitest'
import { encodeValue } from '../src/codec.ts'
import { judgeLog } from '../src/worker/log.ts'
import { findPreadmission } from '../src/worker/read-preadmission.ts'
import { textOf, TENANT_A, TENANT_B } from './fixtures/app.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

describe('the preadmission point lookups of one transaction domain', () => {
  const insert = () => {
    const { port } = migratedPort()
    port.execute(
      `INSERT INTO er_preadmission (tenant, handoff, entry, session, execution, intent, intent_digest) VALUES (?, 'h-1', 'k-1', NULL, NULL, '{}', 'd')`,
      [textOf(TENANT_A)],
    )
    return port
  }

  it('finds the record of its own tenant by H and by Ki', () => {
    const port = insert()
    expect(findPreadmission(port, textOf(TENANT_A), { handoff: 'h-1' })).toBeDefined()
    expect(findPreadmission(port, textOf(TENANT_A), { entry: 'k-1' })).toBeDefined()
  })

  it('does not find the record of tenant A as tenant B, by H or by Ki', () => {
    const port = insert()
    expect(findPreadmission(port, textOf(TENANT_B), { handoff: 'h-1' })).toBeUndefined()
    expect(findPreadmission(port, textOf(TENANT_B), { entry: 'k-1' })).toBeUndefined()
  })
})

describe('the commit log of one transaction domain', () => {
  const observation = (tenant: typeof TENANT_A) => ({
    observation: encodeValue({ tenant, session: 's', operation: 'op-1' }),
  })
  const insert = () => {
    const { port } = migratedPort()
    port.execute(
      'INSERT INTO sl_journal (tenant, session, tail, commit_seq, epoch) VALUES (?, ?, ?, ?, ?)',
      [textOf(TENANT_A), 's', 0n, 0n, 'epoch:0'],
    )
    return port
  }

  it('reads the journal of its own tenant: the judgment goes past the journal', () => {
    // The journal is there, so the judgment stops at the next row it needs (`sl_state`), not at it.
    expect(judgeLog(observation(TENANT_A), insert())).toMatchObject({
      kind: 'failed',
      diagnostic: 'sl_state does not cover the tail',
    })
  })

  it('does not read the journal of tenant A as tenant B: denied, like a session that is not there', () => {
    expect(judgeLog(observation(TENANT_B), insert())).toEqual({
      kind: 'stopped',
      failure: { kind: 'denied', action: 'commitLog' },
    })
  })
})
