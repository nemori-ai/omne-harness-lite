import { describe, expect, it } from 'vitest'
import type { TenantId } from '@omne-harness/legal-identity'
import type { StaticRegistration } from '@omne-harness/runtime-context-contract'
import { createTestAuthorityPorts } from '@omne-harness/runtime-context-contract/testing'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import type { SessionCommand, SessionIntakeLimits } from '@omne-harness/session-contract'
import {
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  memoryAccess,
  memoryOtherAccess,
  operationId,
  ordinaryInput,
  refused,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { createStaticScopeHolder, staticScopeTenant } from '@omne-harness/static-scope-holder'
import { TENANT_SCOPE_KIND } from '@omne-harness/static-scope-holder/cordis'
import { createIntakeBudgetReader, sessionIntakeBudgetBlock } from '../src/cordis/intake-budget.ts'
import { initializationGuards } from '../../session-contract/tests/initialization-fixture.ts'

const A = memoryAccess<unknown>('budget-a')
const B = memoryOtherAccess<unknown>('budget-b', 'session-b')
const limit = (maxPendingInputs: number): SessionIntakeLimits => ({
  maxPendingInputs,
  maxInputBytes: 4096,
})
const UNAVAILABLE = { kind: 'unavailable', owner: 'session-intake' }

function mechanism() {
  const ports = createTestAuthorityPorts<unknown>()
  return createRuntimeContext<unknown>({
    trust: {
      authority: ports.authority,
      bindings: {
        async lookup(scope) {
          const tenant = staticScopeTenant(TENANT_SCOPE_KIND, scope)
          return tenant === undefined ? { kind: 'unbound' } : { kind: 'bound', tenant }
        },
      },
    },
    config: {},
  })
}

// The setting of each tenant, as its owner would read it. Absent: the owner cannot read it now.
function world() {
  const settings = new Map<TenantId, unknown>([[A.tenant, 1]])
  const owner = sessionIntakeBudgetBlock(async tenant => {
    const value = settings.get(tenant)
    return value === undefined ? null : (value as number)
  })
  const content: { current: StaticRegistration } = { current: { blocks: [owner], needs: [] } }
  const rc = mechanism()
  const scope = createStaticScopeHolder<unknown>({
    kind: TENANT_SCOPE_KIND,
    runtime: rc,
    registration: () => content.current,
  })
  const acting: { principal: unknown } = { principal: 'session' }
  const there = { scope: true }
  const budget = createIntakeBudgetReader<unknown>({
    scope: () => (there.scope ? scope : undefined),
    principal: async () => acting.principal,
    maxInputBytes: 4096,
  })
  return { settings, owner, content, rc, budget, acting, there }
}

async function session(w: ReturnType<typeof world>) {
  const initialization = createMemoryInitializationSource()
  const port = createMemorySessionTransactions<unknown>({
    initialization,
    history: createMemorySessionHistorySource(),
    accessCheck: createPolicySessionAccessCheck(() => ({
      kind: 'allowed',
      evidence: evidence('access'),
    })),
    intakeLimits: limit(64),
    budget: w.budget,
  })
  const base = { tenant: A.tenant, session: A.session }
  const command = {
    kind: 'create',
    input: { ...base, operation: operationId('create'), creation: creation({ initial: null }) },
  } satisfies SessionCommand
  const guards = initializationGuards(command, null)
  initialization.controls.register(command, guards[0]!)
  const prepared = succeeded(await initialization.prepare(command), 'prepare')
  succeeded(await port.commit({ access: A, command, guards: prepared }), 'create')
  return (name: string) =>
    port.commit({
      access: A,
      guards: [],
      command: {
        kind: 'accept',
        input: { ...base, operation: operationId(name), value: ordinaryInput(name) },
      },
    })
}

describe('the intake budget is read through the tenant-level scope (C13)', () => {
  it('reads what the owner of the setting has for the tenant now', async () => {
    const w = world()
    expect(await w.budget.read(A.tenant)).toEqual(limit(1))
    w.settings.set(A.tenant, 5)
    expect(await w.budget.read(A.tenant)).toEqual(limit(5))
    w.settings.set(B.tenant, 9)
    expect(await w.budget.read(B.tenant)).toEqual(limit(9))
    expect(await w.budget.read(A.tenant)).toEqual(limit(5))
  })

  it('the next input is judged on the setting of now', async () => {
    const w = world()
    const accept = await session(w)
    succeeded(await accept('one'), 'one')
    expect(refused(await accept('two'), 'two')).toMatchObject({ kind: 'limited', limit: 1 })
    w.settings.set(A.tenant, 2)
    succeeded(await accept('two'), 'two again')
    expect(refused(await accept('three'), 'three')).toMatchObject({ kind: 'limited', limit: 2 })
  })

  it.each([
    ['the owner cannot read the setting', (w: ReturnType<typeof world>) => w.settings.clear()],
    [
      'the owner gives a value that is not a budget',
      (w: ReturnType<typeof world>) => w.settings.set(A.tenant, 0.5),
    ],
    [
      'the contribution of the owner is withdrawn',
      (w: ReturnType<typeof world>) => {
        w.content.current = { blocks: [], needs: [] }
      },
    ],
    [
      'Session cannot act for the tenant',
      (w: ReturnType<typeof world>) => {
        w.acting.principal = null
      },
    ],
    [
      'the holder of the tenant-level scope is not there',
      (w: ReturnType<typeof world>) => {
        w.there.scope = false
      },
    ],
  ])('answers unavailable when %s, and reads again when that is over', async (_label, breakIt) => {
    const w = world()
    const accept = await session(w)
    succeeded(await accept('one'), 'one')
    w.settings.set(A.tenant, 3)
    breakIt(w)
    expect(await w.budget.read(A.tenant)).toBeNull()
    expect(refused(await accept('two'), 'two')).toMatchObject(UNAVAILABLE)
    w.settings.set(A.tenant, 3)
    w.content.current = { blocks: [w.owner], needs: [] }
    w.acting.principal = 'session'
    w.there.scope = true
    succeeded(await accept('two'), 'two again')
  })

  it('answers null, not an exception, when the mechanism is closed', async () => {
    const w = world()
    expect(await w.budget.read(A.tenant)).toEqual(limit(1))
    await w.rc.close()
    expect(await w.budget.read(A.tenant)).toBeNull()
  })
})
