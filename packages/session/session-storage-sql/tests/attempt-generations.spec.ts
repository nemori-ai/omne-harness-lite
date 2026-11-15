import { describe, expect, it } from 'vitest'
import type {
  CommitRequestV2,
  CommitResultV2,
  FailureCategory,
  SqlIdentity,
} from '@omne-harness/sql-contract'
import { operationId } from '@omne-harness/session-contract/testing'
import { app, TENANT_A, textOf, type App } from './fixtures/app.ts'

const ROLLED_BACK = 9
const SQLITE_CONSTRAINT = 19

const identityOf = (operation: string, attempt: number): SqlIdentity => ({
  scope: { kind: 'tenant', tenant: textOf(TENANT_A) },
  transactionDomain: 'dom_0',
  operation: operationId(operation),
  protocolVersion: '2',
  operationKey: JSON.stringify(['session-1', operationId(operation), attempt]),
})

async function started(): Promise<App> {
  const a = await app()
  expect(await a.create(TENANT_A)).toHaveProperty('ok')
  return a
}

async function refuseAccept(a: App, name: string, times: number): Promise<void> {
  for (let refused = 0; refused < times; refused += 1) {
    a.provider.failWrite(/INSERT/, 1, SQLITE_CONSTRAINT)
    expect(await a.accept(TENANT_A, 'session-1', name)).toHaveProperty('failure')
  }
  a.provider.failWrite(null)
}

function answerNextCommit(a: App, result: (request: CommitRequestV2) => CommitResultV2): void {
  const { storage } = a.provider
  const commit = storage.commit.bind(storage)
  storage.commit = request => {
    storage.commit = commit
    return Promise.resolve(result(request))
  }
}

describe('the attempt generations of one operation have no bound', () => {
  it(`a write whose operation was rolled back ${ROLLED_BACK} times still commits`, async () => {
    const a = await started()
    await refuseAccept(a, 'again', ROLLED_BACK)
    for (let attempt = 1; attempt <= ROLLED_BACK; attempt += 1)
      expect((await a.provider.storage.query(identityOf('accept-again', attempt))).kind).toBe(
        'rolled_back',
      )

    const mark = a.provider.calls.length
    expect(await a.accept(TENANT_A, 'session-1', 'again')).toHaveProperty('ok')
    const after = a.provider.calls.slice(mark)
    expect(after.filter(call => call.kind === 'query')).toEqual([])
    expect(
      after.filter(call => call.kind === 'commit').map(call => call.identity.operationKey),
    ).toEqual([identityOf('accept-again', ROLLED_BACK + 1).operationKey])
    expect((await a.provider.storage.query(identityOf('accept-again', ROLLED_BACK + 1))).kind).toBe(
      'committed',
    )
  })

  it(`R7 asks past ${ROLLED_BACK} rolled back generations and finds the attempt still in flight`, async () => {
    const a = await started()
    await refuseAccept(a, 'pending', ROLLED_BACK)
    const { storage } = a.provider
    const query = storage.query.bind(storage)
    const inFlight = identityOf('accept-pending', ROLLED_BACK + 1).operationKey
    storage.query = identity =>
      identity.operationKey === inFlight
        ? Promise.resolve({ kind: 'unknown', identity, diagnostic: 'queued' })
        : query(identity)

    const resolved = await a.port.queryOperation({
      ...a.access(TENANT_A),
      operation: operationId('accept-pending'),
    })
    expect(resolved).toEqual({ ok: { kind: 'unknown' } })
  })
})

describe('a storage refusal keeps its nature (sql-contract 提交拒绝原因的定性)', () => {
  const rejected =
    (reason: 'queue_full' | 'command_limit') =>
    (request: CommitRequestV2): CommitResultV2 => ({
      kind: 'rejected_before_accept',
      identity: request.identity,
      reason,
      diagnostic: null,
    })

  it('a full queue is temporary: unavailable, with the reason in the diagnostic', async () => {
    const a = await started()
    answerNextCommit(a, rejected('queue_full'))
    const answer = await a.accept(TENANT_A, 'session-1', 'full')
    expect(answer).toHaveProperty('failure.kind', 'unavailable')
    expect(answer).toHaveProperty('failure.diagnostic', expect.stringContaining('queue_full'))
  })

  it('a command over the limit is definite: invalid on the field storage, with the reason name', async () => {
    const a = await started()
    answerNextCommit(a, rejected('command_limit'))
    expect(await a.accept(TENANT_A, 'session-1', 'large')).toEqual({
      failure: { kind: 'invalid', field: 'storage', reason: 'command_limit' },
    })
  })

  const failedAs =
    (category: FailureCategory, diagnostic: string) =>
    (request: CommitRequestV2): CommitResultV2 =>
      ({
        kind: 'rolled_back',
        identity: request.identity,
        responses: [{ participant: 'session', reply: { kind: 'failed', category, diagnostic } }],
      }) as unknown as CommitResultV2

  it('a failure that the participant reports is temporary: unavailable', async () => {
    const a = await started()
    answerNextCommit(a, failedAs('participant_reported', 'not yet'))
    const answer = await a.accept(TENANT_A, 'session-1', 'reported')
    expect(answer).toHaveProperty('failure.kind', 'unavailable')
    expect(answer).toHaveProperty('failure.diagnostic', expect.stringContaining('not yet'))
  })

  it.each([
    'port_violation',
    'fact_violation',
    'participant_threw',
    'invalid_reply',
    'response_limit',
    'sql_error',
  ] as const)(
    'a failure the provider decides as %s is definite: invalid on the field storage',
    async category => {
      const a = await started()
      answerNextCommit(a, failedAs(category, 'decided by the provider'))
      expect(await a.accept(TENANT_A, 'session-1', category)).toEqual({
        failure: { kind: 'invalid', field: 'storage', reason: category },
      })
    },
  )

  it('a data error inside the transaction rolls back as sql_error and is definite', async () => {
    const a = await started()
    a.provider.failWrite(/INSERT/, 1, SQLITE_CONSTRAINT)
    expect(await a.accept(TENANT_A, 'session-1', 'constraint')).toEqual({
      failure: { kind: 'invalid', field: 'storage', reason: 'sql_error' },
    })
  })

  it('an environment error inside the transaction is unknown, and the same operation then commits', async () => {
    const a = await started()
    a.provider.failWrite(/INSERT/)
    expect(await a.accept(TENANT_A, 'session-1', 'io')).toEqual({
      failure: { kind: 'commit-unknown', operation: operationId('accept-io') },
    })
    expect(await a.accept(TENANT_A, 'session-1', 'io')).toHaveProperty('ok')
  })
})
