// Cross-tenant behavior of the `session-provider` contract double: a session of another tenant and
// a session that nobody registered answer the same `denied`, byte for byte, on every method.
import {
  creation,
  operationId,
  ordinaryInput,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { afterEach, describe, expect, it } from 'vitest'
import { TENANT_A, TENANT_B, loadProviderTree, type ProviderTree } from './support.ts'

let tree: ProviderTree | undefined
afterEach(async () => {
  await tree?.dispose()
  tree = undefined
})

type Call = (
  t: ProviderTree,
  who: Readonly<{ principal: unknown; tenant: typeof TENANT_A }>,
  session: string,
) => Promise<unknown>

const SESSION = 'sess-a'

/** The six session-bound methods. Each takes the principal and the tenant of the access, and the session. */
const METHODS: Readonly<Record<string, Call>> = {
  'work.accept': (t, who, session) =>
    t.intake.work.accept({
      ...who,
      session: sessionId(session),
      operation: operationId('accept-x'),
      value: ordinaryInput('input-x', 'hello'),
    } as never),
  'work.queryOperation': (t, who, session) =>
    t.intake.work.queryOperation({
      ...who,
      session: sessionId(session),
      operation: operationId('create-a'),
    } as never),
  'work.cancelRun': (t, who, session) =>
    t.intake.work.cancelRun({
      ...who,
      session: sessionId(session),
      operation: operationId('cancel-x'),
      run: 'run-1',
      urgency: 'graceful',
    } as never),
  'work.stopCall': (t, who, session) =>
    t.intake.work.stopCall({
      ...who,
      session: sessionId(session),
      operation: operationId('stop-x'),
      producer: { kind: 'model', call: 'call-1' },
    } as never),
  'history.begin': (t, who, session) =>
    t.reader.history.begin({
      ...who,
      session: sessionId(session),
      kinds: ['message.user'],
      from: null,
      direction: 'forward',
      pageBytes: 4096,
    } as never),
  'history.next': (t, who, session) =>
    t.reader.history.next({ ...who, session: sessionId(session), cursor: 'any-cursor' } as never),
}

async function withSessionOfA(): Promise<ProviderTree> {
  tree = await loadProviderTree()
  const created = await tree.intake.management.create({
    principal: tree.principalFor(TENANT_A),
    tenant: TENANT_A,
    session: sessionId(SESSION),
    operation: operationId('create-a'),
    creation: creation(),
  })
  expect('ok' in created).toBe(true)
  return tree
}

describe('session-provider: the session of another tenant', () => {
  for (const [method, call] of Object.entries(METHODS)) {
    it(`${method} answers one denied for another tenant's session, an unknown session and a foreign principal`, async () => {
      const t = await withSessionOfA()
      const asA = { principal: t.principalFor(TENANT_A), tenant: TENANT_A }
      const asB = { principal: t.principalFor(TENANT_B), tenant: TENANT_B }
      const asBOnA = { principal: t.principalFor(TENANT_B), tenant: TENANT_A }

      // Tenant B names the session id of tenant A, in its own tenant.
      const otherTenant = JSON.stringify(await call(t, asB, SESSION))
      // Tenant A names a session id that nobody registered.
      const unknown = JSON.stringify(await call(t, asA, 'sess-unknown'))
      // Tenant B's principal names tenant A: the access check refuses before the double looks.
      const foreignPrincipal = JSON.stringify(await call(t, asBOnA, SESSION))

      expect(JSON.parse(otherTenant)).toEqual({ failure: { kind: 'denied', action: method } })
      expect(otherTenant).toBe(unknown)
      expect(otherTenant).toBe(foreignPrincipal)
    })
  }

  it('management.create answers denied to a principal that acts for another tenant', async () => {
    const t = await withSessionOfA()
    const result = await t.intake.management.create({
      principal: t.principalFor(TENANT_B),
      tenant: TENANT_A,
      session: sessionId('sess-b'),
      operation: operationId('create-b'),
      creation: creation(),
    })
    expect(result).toEqual({ failure: { kind: 'denied', action: 'management.create' } })
  })

  it('does not disclose or touch the session of tenant A when tenant B creates the same session id', async () => {
    const t = await withSessionOfA()
    const created = await t.intake.management.create({
      principal: t.principalFor(TENANT_B),
      tenant: TENANT_B,
      session: sessionId(SESSION),
      operation: operationId('create-a'),
      creation: creation({ purpose: 'tenant B session' }),
    })
    expect('ok' in created).toBe(true)
    const history = await t.reader.history.begin({
      principal: t.principalFor(TENANT_A),
      tenant: TENANT_A,
      session: sessionId(SESSION),
      kinds: ['message.user'],
      from: null,
      direction: 'forward',
      pageBytes: 4096,
    })
    expect('ok' in history && history.ok.entries).toEqual([])
  })
})
