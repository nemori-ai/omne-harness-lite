// The table double of the Tool access guard and its provider suite (RD-TOOLHEAD). The double must
// pass all five cases. Three of them carry tenant isolation: no rule is denied, a forged tenant is
// denied, and the same request for another tenant is denied.
import { describe, expect, it } from 'vitest'
import { decodeToolCallId, type ToolCallId } from '@omne-harness/tool-contract'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import {
  createTableToolAccess,
  toolAccessGuardConformance,
  type ToolAccessGuardFixture,
} from '@omne-harness/tool/testing'

const tenantA = () =>
  testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000')
const tenantB = () =>
  testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000')

function callId(text: string): ToolCallId {
  const decoded = decodeToolCallId(text)
  if ('failure' in decoded) throw new Error(`call id: ${text}`)
  return decoded.ok
}

type Principal = Readonly<{ id: string }>
const alice: Principal = { id: 'alice' }

function table() {
  return createTableToolAccess<Principal>({
    principalKey: principal => principal.id,
    allow: [
      { principal: 'alice', tenant: tenantA(), action: 'read-result' },
      { principal: 'alice', tenant: tenantA(), action: 'start', call: callId('call-1') },
      { principal: 'alice', tenant: tenantA(), action: 'invalidate', call: null },
    ],
  })
}

function fixture(): ToolAccessGuardFixture<Principal> {
  const access = table()
  const allowed = {
    principal: alice,
    tenant: tenantA(),
    call: callId('call-1'),
    action: 'read-result',
  } as const
  return {
    guard: access.guard,
    allowed,
    unlisted: { ...allowed, principal: { id: 'mallory' } },
    otherTenant: { ...allowed, tenant: tenantB() },
    // The same texts as the allowed tenant, but a copy that legal-identity did not mint.
    forgedTenant: { ...allowed, tenant: structuredClone(tenantA()) },
    breakDependency: () => access.fail('authorization down'),
  }
}

describe('toolAccessGuardConformance on the table double', () => {
  const cases = toolAccessGuardConformance<Principal>()
  it('has five cases', () => {
    expect(cases).toHaveLength(5)
  })
  for (const scenario of cases)
    it(scenario.name, async () => {
      await scenario.run(fixture())
    })
})

describe('createTableToolAccess', () => {
  const call = callId('call-1')

  it('names the reason of a denial', async () => {
    const { guard } = table()
    expect(
      await guard.qualify({ principal: alice, tenant: tenantA(), call, action: 'read-content' }),
    ).toEqual({
      kind: 'denied',
      reason: 'no-rule',
    })
    const forged = structuredClone(tenantA())
    expect(
      await guard.qualify({ principal: alice, tenant: forged, call, action: 'read-result' }),
    ).toEqual({
      kind: 'denied',
      reason: 'forged-tenant',
    })
  })

  it('does not combine two base permissions into read-raw-content', async () => {
    const { guard } = createTableToolAccess<Principal>({
      principalKey: principal => principal.id,
      allow: [
        { principal: 'alice', tenant: tenantA(), action: 'read-content' },
        { principal: 'alice', tenant: tenantA(), action: 'read-raw' },
      ],
    })
    const verdict = await guard.qualify({
      principal: alice,
      tenant: tenantA(),
      call,
      action: 'read-raw-content',
    })
    expect(verdict.kind).toBe('denied')
  })

  it('matches a call-bound rule only for that call, and a null-call rule only without a call', async () => {
    const { start } = table()
    const ask = (
      tenant: ReturnType<typeof tenantA>,
      at: ToolCallId | null,
      action: 'start' | 'invalidate',
    ) => start.qualify({ principal: alice, tenant, call: at, action }).then(verdict => verdict.kind)
    expect(await ask(tenantA(), call, 'start')).toBe('allowed')
    expect(await ask(tenantA(), callId('call-2'), 'start')).toBe('denied')
    expect(await ask(tenantA(), null, 'invalidate')).toBe('allowed')
    expect(await ask(tenantA(), call, 'invalidate')).toBe('denied')
    expect(await ask(tenantB(), null, 'invalidate')).toBe('denied')
  })

  it('shares the failure state between the guard and the start view, until restore', async () => {
    const access = table()
    access.fail('down')
    expect(
      await access.start.qualify({
        principal: alice,
        tenant: tenantA(),
        call: null,
        action: 'invalidate',
      }),
    ).toEqual({
      kind: 'unavailable',
      diagnostic: 'down',
    })
    access.restore()
    const verdict = await access.guard.qualify({
      principal: alice,
      tenant: tenantA(),
      call,
      action: 'read-result',
    })
    expect(verdict.kind).toBe('allowed')
  })

  it('answers unavailable when the principal key throws, and refuses a rule with a forged tenant', async () => {
    const { guard } = createTableToolAccess<Principal>({
      principalKey: () => {
        throw new Error('no key')
      },
      allow: [],
    })
    const verdict = await guard.qualify({
      principal: alice,
      tenant: tenantA(),
      call,
      action: 'admit',
    })
    expect(verdict.kind).toBe('unavailable')
    expect(() =>
      createTableToolAccess<Principal>({
        principalKey: principal => principal.id,
        allow: [{ principal: 'alice', tenant: structuredClone(tenantA()), action: 'admit' }],
      }),
    ).toThrow(TypeError)
    expect(table().durability).toBe('none')
  })
})
