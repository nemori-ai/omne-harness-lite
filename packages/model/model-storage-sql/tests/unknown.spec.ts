// "Saved, but the reply was lost" through the ModelCommands (M4-5). The test provider commits the
// write and then answers `unknown`. A retry with the same operation recognizes the saved write and
// gives back its original result, without a second commit and without a second row. Also: commits
// that stay undecided, the per-tenant bound on them, and a commit outside its run's operation.
import { describe, expect, it } from 'vitest'
import { COMMAND_RESERVE_BYTES, createSqlModelStorage } from '@omne-harness/model-storage-sql'
import {
  DIGEST,
  MAX_CALL_BYTES,
  callId,
  instanceId,
  lookup,
  opId,
  proof,
  sqlCommands,
  tenantOf,
  textOf,
} from './fixture.ts'

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

  it('answers the lost operation as committed to a query, with the revision it wrote', async () => {
    const { commands, sqlite, admit } = setup()
    await commands.admit(admit)
    const control = { principal: admit.principal, tenant: A, call: CALL, operation: opId('stop') }
    sqlite.hooks.loseNextReply = true
    expect(await commands.control(control)).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('stop') },
    })
    const query = { principal: admit.principal, tenant: A, call: CALL, operation: opId('stop') }
    expect(await commands.query(query)).toEqual({
      ok: { kind: 'committed', value: { revision: '2' } },
    })
    expect(await commands.query({ ...query, operation: opId('never') })).toEqual({
      ok: { kind: 'not-committed' },
    })
  })
})

describe('operations whose outcome stays unknown', () => {
  it('lists a call with an undecided admission among the pending calls, paging the union in call order', async () => {
    const { commands, sqlite, core } = setup()
    const admitOf = (name: string) => core.admitOf(A, callId(name), opId(`admit-${name}`))
    expect('ok' in (await commands.admit(admitOf('a')))).toBe(true)
    sqlite.hooks.holdNext = true
    expect(await commands.admit(admitOf('b'))).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('admit-b') },
    })
    expect('ok' in (await commands.admit(admitOf('c')))).toBe(true)
    const access = { principal: admitOf('a').principal, tenant: A }
    expect(await commands.scanPending({ ...access, after: null, limit: 2 })).toEqual({
      ok: { calls: [callId('a'), callId('b')], next: callId('b') },
    })
    expect(await commands.scanPending({ ...access, after: callId('b'), limit: 2 })).toEqual({
      ok: { calls: [callId('c')], next: null },
    })
    expect(await commands.scanPending({ ...access, after: 'not-a-cursor', limit: 2 })).toEqual({
      failure: { kind: 'invalid', field: 'after', reason: 'scan-cursor' },
    })
  })

  it('bounds the unknown operations per tenant, so another tenant still writes', async () => {
    const B = tenantOf('b')
    const { commands, sqlite, core } = sqlCommands([A, B], { unresolvedLimit: 1 })
    sqlite.hooks.holdNext = true
    expect(await commands.admit(core.admitOf(A, callId('held'), opId('a1')))).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('a1') },
    })
    const refused = await commands.admit(core.admitOf(A, callId('next'), opId('a2')))
    expect('failure' in refused && refused.failure.kind).toBe('unavailable')
    expect('ok' in (await commands.admit(core.admitOf(B, callId('other'), opId('b1'))))).toBe(true)
  })

  it('answers commit-unknown when the writer is not current, and writes on the retry once the storage says the commit never ran', async () => {
    const { commands, sqlite, admit, count } = setup()
    sqlite.hooks.rejectNext = 'writer_not_current'
    expect(await commands.admit(admit)).toEqual({
      failure: { kind: 'commit-unknown', operation: ADMISSION },
    })
    expect(count('md_call')).toEqual([[0n]])
    const retried = await commands.admit(admit)
    expect('ok' in retried && retried.ok.recovered).toBe(false)
    expect(count('md_call')).toEqual([[1n]])
  })
})

describe('a commit outside the operation of its run', () => {
  async function commitIn(scope: Readonly<{ operation?: string }>) {
    const subject = setup()
    await subject.commands.admit(subject.admit)
    const store = createSqlModelStorage({
      storage: subject.sqlite.storage,
      domains: lookup([textOf(A)], subject.domain),
      combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
      limits: {
        tenantCapacity: subject.core.options.limits.capacity,
        maxCallBytes: MAX_CALL_BYTES,
        maxCommandBytes: MAX_CALL_BYTES + COMMAND_RESERVE_BYTES,
      },
    })
    const tenant = textOf(A)
    const commits = subject.sqlite.commits()
    const result = await store.run(
      () => {
        const original = store.documents(tenant).calls.get(CALL)
        store.commit(tenant, {
          operation: opId('write'),
          expected: original,
          call: original,
          binding: {
            call: CALL,
            method: 'control',
            fingerprint: 'f',
            revision: original?.state.revision ?? ('1' as never),
            receipt: { kind: 'control' },
          },
        })
        return { ok: null }
      },
      {
        tenant,
        call: CALL,
        ...(scope.operation === undefined ? {} : { operation: opId(scope.operation) }),
      },
    )
    return { result, commits: subject.sqlite.commits() - commits }
  }

  it('is refused in a run whose scope names no operation, and nothing is sent', async () => {
    const { result, commits } = await commitIn({})
    expect('failure' in result && result.failure.kind).toBe('unavailable')
    expect(commits).toBe(0)
  })

  it('is refused in a run whose scope names another operation, and nothing is sent', async () => {
    const { result, commits } = await commitIn({ operation: 'other' })
    expect('failure' in result && result.failure.kind).toBe('unavailable')
    expect(commits).toBe(0)
  })
})
