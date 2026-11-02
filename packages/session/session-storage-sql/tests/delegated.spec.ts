// The delegated entry of the SQL storage (session-contract SPEC「当前操作的访问裁定」, R1-D14 O1): the
// delegated-view suite of session-contract on the real participant and read handlers, and the
// tenant cases that the suite cannot see because its other tenant has no session of the same name.
import { describe, expect, it } from 'vitest'
import { readAccessRequest, mutationAccessRequest } from '@omne-harness/session-contract'
import type { SessionCommand, SessionTransactionPort } from '@omne-harness/session-contract'
import {
  adoptedInitializationFixture,
  creation,
  evidence,
  initializationFixtureFacts,
  initializationFixtureGuard,
  operationId,
  ordinaryInput,
  runConformanceCase,
  sessionDelegatedTransactionsConformance,
  sessionId,
  type SessionDelegatedTransactionsFixture,
} from '@omne-harness/session-contract/testing'
import type { TenantId } from '@omne-harness/legal-identity'
import type { DurableEvidence } from '@omne-harness/session-contract'
import { decodeValue } from '../src/codec.ts'
import { app, textOf, TENANT_A, TENANT_B, type App } from './fixtures/app.ts'
import { kindOf, SESSION_ENTRIES } from './fixtures/entries.ts'

/** The evidence stored with an operation record, read from the domain of the tenant (null: none). */
function storedEvidence(
  a: App,
  tenant: TenantId,
  session: string,
  operation: string,
): DurableEvidence | null {
  const domain = a.directory.entries.find(item => item.tenant === textOf(tenant))?.domain
  if (domain === undefined) return null
  const found = a.provider.select(
    domain.transactionDomain,
    'SELECT evidence FROM sl_operation_evidence WHERE tenant = ? AND session = ? AND operation = ? LIMIT 1',
    [textOf(tenant), session, operation],
  )
  const cell = found.rows[0]?.[0]
  return typeof cell === 'string'
    ? (decodeValue(JSON.parse(cell) as never) as DurableEvidence)
    : null
}

async function fixture(): Promise<SessionDelegatedTransactionsFixture<string>> {
  const a = await app()
  return {
    transactions: a.pair.transactions,
    delegated: a.pair.delegated,
    access: a.access(TENANT_A),
    otherAccess: a.access(TENANT_B),
    creation: creation(),
    operation: name => operationId(name),
    initializationGuards: command =>
      Promise.resolve([
        initializationFixtureGuard(
          initializationFixtureFacts(command, null, adoptedInitializationFixture(command)),
        ),
      ]),
    checks: () => a.accessCheck.controls.asked().length,
    decisionOf: (tenant, session, operation) => storedEvidence(a, tenant, session, operation),
  }
}

describe('session-contract delegated-view conformance on the SQL storage', () => {
  const cases = sessionDelegatedTransactionsConformance<string>()

  for (const test of cases)
    it(`${test.clause}: ${test.name}`, async () => {
      const verdict = await runConformanceCase(test, await fixture())
      expect(verdict).toEqual({ kind: 'passed' })
    })
})

describe('a view bound to session-1 of tenant A, while tenant B has its own session-1', () => {
  async function twoTenants() {
    const a = await app()
    for (const tenant of [TENANT_A, TENANT_B]) {
      expect(kindOf(await a.create(tenant))).toBeUndefined()
      expect(kindOf(await a.accept(tenant, 'session-1', 'one'))).toBeUndefined()
    }
    return a
  }

  const readBinding = (a: App) =>
    a.pair.delegated.bind({
      request: readAccessRequest(a.access(TENANT_A), 'readWork'),
      evidence: evidence('access/face/readWork'),
    })

  it('serves the bound session without asking the access check', async () => {
    const a = await twoTenants()
    const view = readBinding(a)
    const asked = a.accessCheck.controls.asked().length
    const read = await view.readWork(a.access(TENANT_A))
    expect(kindOf(read)).toBeUndefined()
    expect(a.accessCheck.controls.asked().length).toBe(asked)
  })

  // `commit` goes through the fixture's own port, and `pending` names no session: both are below.
  for (const entry of SESSION_ENTRIES.filter(item => !['commit', 'pending'].includes(item.name)))
    it(`${entry.name}: tenant B's session-1 is denied, unasked, and nothing reaches the storage`, async () => {
      const a = await twoTenants()
      const view: SessionTransactionPort<string> = readBinding(a)
      const asked = a.accessCheck.controls.asked().length
      const calls = a.provider.calls.length
      expect(kindOf(await entry.call({ ...a, port: view }, TENANT_B, 'session-1'))).toBe('denied')
      expect(a.accessCheck.controls.asked().length).toBe(asked)
      expect(a.provider.calls.length).toBe(calls)
    })

  it('pending: denied, it is not a call of one session', async () => {
    const a = await twoTenants()
    const view = readBinding(a)
    const answer = await view.pending({
      principal: 'tester',
      tenant: TENANT_A,
      after: null,
      limit: 10,
    })
    expect(kindOf(answer)).toBe('denied')
  })

  it('commit: the checked command sent under tenant B is denied and B is unchanged', async () => {
    const a = await twoTenants()
    const command = (tenant: typeof TENANT_A): Extract<SessionCommand, { kind: 'accept' }> => ({
      kind: 'accept',
      input: {
        tenant,
        session: sessionId('session-1'),
        operation: operationId('accept-two'),
        value: ordinaryInput('two'),
      },
    })
    const view = a.pair.delegated.bind({
      request: mutationAccessRequest(a.access(TENANT_A), command(TENANT_A)),
      evidence: evidence('access/face/accept'),
    })
    const before = await a.port.readWork(a.access(TENANT_B))
    const asked = a.accessCheck.controls.asked().length
    const calls = a.provider.calls.length
    const answer = await view.commit({
      access: a.access(TENANT_B),
      command: command(TENANT_B),
      guards: [],
    })
    expect(kindOf(answer)).toBe('denied')
    expect(a.accessCheck.controls.asked().length).toBe(asked)
    expect(a.provider.calls.length).toBe(calls)
    expect(await a.port.readWork(a.access(TENANT_B))).toEqual(before)
  })

  it('commitEntries: denied, not the unavailable answer of the public port', async () => {
    const a = await twoTenants()
    const view = readBinding(a)
    const answer = await view.commitEntries({
      observation: { tenant: TENANT_A, session: sessionId('session-1') },
      start: {},
    } as never)
    expect(kindOf(answer)).toBe('denied')
  })
})
