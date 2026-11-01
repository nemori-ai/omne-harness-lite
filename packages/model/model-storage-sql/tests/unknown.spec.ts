// "Saved, but the reply was lost" through the ModelCommands (M4-5). The test provider commits the
// write and then answers `unknown`. A retry with the same operation recognizes the saved write and
// gives back its original result, without a second commit and without a second row.
import { describe, expect, it } from 'vitest'
import { callId, instanceId, opId, proof, sqlCommands, tenantOf, textOf } from './fixture.ts'

const A = tenantOf('a')
const CALL = callId('lost')
const ADMISSION = opId('admit')

function setup() {
  const subject = sqlCommands([A])
  const admit = subject.core.admitOf(A, CALL, ADMISSION)
  const count = (table: string) =>
    subject.sqlite.rows(subject.domain, `SELECT count(*) FROM ${table} WHERE tenant = ?`, [
      textOf(A),
    ])
  return { ...subject, admit, count }
}

describe('a saved write whose reply is lost', () => {
  it('recognizes the admission on a retry with the same operation and writes it once', async () => {
    const { commands, sqlite, admit, count } = setup()
    sqlite.hooks.loseNextReply = true
    expect(await commands.admit(admit)).toEqual({
      failure: { kind: 'commit-unknown', operation: ADMISSION },
    })
    const commits = sqlite.commits()
    const retried = await commands.admit(admit)
    expect('ok' in retried && retried.ok).toMatchObject({
      call: CALL,
      revision: '1',
      recovered: true,
    })
    expect(sqlite.commits()).toBe(commits)
    expect(count('md_call')).toEqual([[1n]])
    expect(count('md_operation')).toEqual([[1n]])
  })

  it('gives back the original claim on a retry and keeps one generation', async () => {
    const { commands, sqlite, admit, count, domain } = setup()
    await commands.admit(admit)
    const claim = {
      principal: admit.principal,
      tenant: A,
      call: CALL,
      instance: instanceId(),
      operation: opId('claim'),
      continuity: proof(CALL),
    }
    sqlite.hooks.loseNextReply = true
    expect(await commands.claim(claim)).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('claim') },
    })
    const commits = sqlite.commits()
    expect(await commands.claim(claim)).toEqual({
      ok: { tenant: A, call: CALL, instance: instanceId(), generation: '1' },
    })
    expect(sqlite.commits()).toBe(commits)
    expect(count('md_operation')).toEqual([[2n]])
    expect(
      sqlite.rows(domain, 'SELECT row_version FROM md_call WHERE tenant = ?', [textOf(A)]),
    ).toEqual([[2n]])
  })

  it('gives back the original control state on a retry and writes it once', async () => {
    const { commands, sqlite, admit, count, domain } = setup()
    await commands.admit(admit)
    const control = { principal: admit.principal, tenant: A, call: CALL, operation: opId('stop') }
    sqlite.hooks.loseNextReply = true
    expect(await commands.control(control)).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('stop') },
    })
    const commits = sqlite.commits()
    expect(await commands.control(control)).toEqual({
      ok: {
        kind: 'requested',
        operation: opId('stop'),
        propagation: 'pending',
        upstream: 'unknown',
      },
    })
    expect(sqlite.commits()).toBe(commits)
    expect(count('md_operation')).toEqual([[2n]])
    expect(
      sqlite.rows(domain, 'SELECT row_version FROM md_call WHERE tenant = ?', [textOf(A)]),
    ).toEqual([[2n]])
  })
})
