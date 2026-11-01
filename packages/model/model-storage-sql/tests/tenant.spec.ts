// Tenant isolation through the ModelCommands (M4-4): a caller of tenant B that names a call of
// tenant A gets the same answer as for a call that does not exist. Both tenants share one
// transaction domain here, so a statement that loses its tenant condition meets the rows of the
// other tenant and the answers differ.
import { describe, expect, it } from 'vitest'
import { textOf } from './fixture.ts'
import { callId, opId, sqlCommands, tenantOf, type Principal } from './fixture.ts'
import type { ModelCommands } from '@omne-harness/model-contract/provider'

const A = tenantOf('a')
const B = tenantOf('b')
const CALL = callId('shared')
const ADMISSION = opId('a-admit')

/** Every answer that B gets for `CALL` through the read methods and one write method. */
async function answersOfB(
  commands: ModelCommands<Principal>,
  principal: Principal,
): Promise<Record<string, unknown>> {
  const access = { principal, tenant: B, call: CALL }
  return {
    recall: await commands.recall({ ...access, admission: ADMISSION }),
    query: await commands.query({ ...access, operation: ADMISSION }),
    loadRecovery: await commands.loadRecovery(access),
    dispatches: await commands.dispatches(access),
    scanPending: await commands.scanPending({ principal, tenant: B, after: null, limit: 2 }),
    // A write of B under the operation that A bound: B must not read the binding of A.
    control: await commands.control({ ...access, operation: ADMISSION }),
  }
}

function setup() {
  const subject = sqlCommands([A, B])
  const principalOf = (tenant: typeof A) => subject.core.admitOf(tenant, CALL, ADMISSION).principal
  return { ...subject, principalOf }
}

describe('another tenant through the commands', () => {
  it('answers a call of tenant A to tenant B as it answers a call that does not exist', async () => {
    const absent = setup()
    const expected = await answersOfB(absent.commands, absent.principalOf(B))

    const present = setup()
    const admitted = await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    expect('ok' in admitted).toBe(true)
    const actual = await answersOfB(present.commands, present.principalOf(B))

    expect(actual).toEqual(expected)
    expect(expected['recall']).toEqual({ ok: { kind: 'not-accepted', operation: ADMISSION } })
    expect(expected['loadRecovery']).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'not-found' },
    })
    expect(expected['scanPending']).toEqual({ ok: { calls: [], next: null } })
  })

  it('leaves the rows of tenant A as they were after the calls of tenant B', async () => {
    const present = setup()
    await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    const rowsOfA = () =>
      present.sqlite.rows(
        present.domain,
        'SELECT row_version, state FROM md_call WHERE tenant = ?',
        [textOf(A)],
      )
    const before = rowsOfA()
    await answersOfB(present.commands, present.principalOf(B))
    expect(rowsOfA()).toEqual(before)
    expect(
      present.sqlite.rows(present.domain, 'SELECT count(*) FROM md_call WHERE tenant = ?', [
        textOf(B),
      ]),
    ).toEqual([[0n]])
  })

  it('still answers tenant A its own call in the shared domain', async () => {
    const present = setup()
    await present.commands.admit(present.core.admitOf(A, CALL, ADMISSION))
    const recalled = await present.commands.recall({
      principal: present.principalOf(A),
      tenant: A,
      call: CALL,
      admission: ADMISSION,
    })
    expect('ok' in recalled && recalled.ok.kind).toBe('found')
    expect(
      await present.commands.scanPending({
        principal: present.principalOf(A),
        tenant: A,
        after: null,
        limit: 2,
      }),
    ).toEqual({ ok: { calls: [CALL], next: null } })
  })
})
