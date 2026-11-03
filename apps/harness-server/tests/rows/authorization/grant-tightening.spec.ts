// The operator's tightening of the maintenance grant table (R2-D204 item 2, IC-18). The table is
// built into the release; the operator can revoke a record or give it an end time, and cannot add,
// widen or rename anything. The cases run the real row on a Cordis context with the real reference
// authorization; the verifier is the in-process authority and the injected `identityClock` is a test
// clock that the case moves. Each case has a control that must not change: the same request without the
// tightening, or the tightening on another record.
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { decodeAgentInstanceId } from '@omne-harness/agent-contract'
import {
  inProcessPrincipalAuthority,
  type ClockReading,
  type IdentityClock,
  type SystemPrincipal,
} from '@omne-harness/identity'
import {
  identityClockKey,
  principalVerifierKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import {
  AGENT_HOST_COMPONENT,
  MAINTENANCE_GRANTS,
  TENANT_DOMAIN_SCANNER_COMPONENT,
  TOOL_RESIDENCY_COMPONENT,
  releaseMaintenanceGrants,
} from '../../../src/rows/authorization/index.ts'
import { authorizationConfig } from '../../../src/rows/authorization/action-rules.ts'
import {
  maintenanceGrantsSchema,
  tightenMaintenanceGrants,
} from '../../../src/rows/authorization/grant-tightening.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const A = fixtureTenant('a')
const instance = okOf(decodeAgentInstanceId('agi_abcdefghjkmnpqrstvwxyz2345'), 'instance')
const HOST_RECORD = `maintenance-grant/${AGENT_HOST_COMPONENT}`
const SCANNER_RECORD = `maintenance-grant/${TENANT_DOMAIN_SCANNER_COMPONENT}`
const RESIDENCY_RECORD = `maintenance-grant/${TOOL_RESIDENCY_COMPONENT}`
const END = '2027-01-01T00:00:00Z'

function instantOf(text: string) {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text} did not parse`)
  return parsed.value
}

/** A clock the case moves. */
function testClock(initial: string) {
  let reading: ClockReading = { kind: 'read', instant: instantOf(initial) }
  const clock: IdentityClock = { now: () => Promise.resolve(reading) }
  return {
    clock,
    set(text: string) {
      reading = { kind: 'read', instant: instantOf(text) }
    },
    fail() {
      reading = { kind: 'unavailable', diagnostic: 'test clock is down' }
    },
  }
}

/** A clock for the cases that set no end time: the row asks it only for a record with one. */
const STILL = testClock('2026-01-01T00:00:00Z').clock

/** Mounts the real row; `publish` asks the row's Agent access check as the named system component. */
async function mount(config: unknown, clock: IdentityClock = STILL) {
  const ctx = new Context()
  const authority = inProcessPrincipalAuthority()
  const provider = await ctx.plugin({
    name: 'identity-fixture',
    apply(scope: Context) {
      scope.provide(principalVerifierKey, authority.verifier)
      scope.provide(tenantStandingKey, { read: () => Promise.reject(new Error('not asked')) })
      scope.provide(identityClockKey, clock)
    },
  })
  const row = await ctx.plugin(authorization, config)
  const holders = new Map<string, SystemPrincipal>()
  const holder = (component: string): SystemPrincipal => {
    const existing = holders.get(component)
    if (existing !== undefined) return existing
    const issued = okOf(authority.issuer.issueSystem({ component }), component)
    holders.set(component, issued)
    return issued
  }
  const publish = (component: string) =>
    ctx.agentAccessCheck.check({
      access: { principal: holder(component), tenant: A },
      operation: 'publish',
      target: { kind: 'instance', instance },
    } as never)
  return {
    publish,
    dispose: async () => {
      await row.dispose()
      await provider.dispose()
    },
  }
}

describe('the schema of `maintenanceGrants`', () => {
  it('takes a revocation or an end time of a record of the table, and an empty object', () => {
    for (const value of [
      {},
      { [HOST_RECORD]: { revoked: true } },
      { [SCANNER_RECORD]: { expiresAt: END } },
      { [RESIDENCY_RECORD]: { revoked: true, expiresAt: END } },
    ])
      expect(maintenanceGrantsSchema.safeParse(value).success).toBe(true)
  })

  it('refuses a record id that the table does not hold, and names it and the table', () => {
    for (const key of [
      'maintenance-grant/restart-scanner',
      'maintenance-grant/agent-host-2',
      AGENT_HOST_COMPONENT,
      '__proto__',
    ]) {
      const result = maintenanceGrantsSchema.safeParse(
        JSON.parse(`{${JSON.stringify(key)}: { "revoked": true }}`),
      )
      expect(result.success, key).toBe(false)
      expect(JSON.stringify(result.error?.issues)).toContain(key)
      expect(JSON.stringify(result.error?.issues)).toContain(HOST_RECORD)
    }
  })

  it('refuses every member beyond `revoked` and `expiresAt`: purposes, principal, scope, a new record', () => {
    const widenings = [
      { purposes: ['enumerate-tenants'] },
      { component: 'restart-scanner' },
      { principal: 'restart-scanner' },
      { scope: 'tenant' },
      { source: 'operator' },
      { record: 'maintenance-grant/other' },
      { generation: '9' },
      { revoked: true, purposes: ['pending-sessions'] },
    ]
    for (const widening of widenings)
      expect(maintenanceGrantsSchema.safeParse({ [HOST_RECORD]: widening }).success).toBe(false)
  })

  it('refuses a tightening that tightens nothing, an un-revocation, and an end time that is not a UTC instant', () => {
    for (const value of [{}, { revoked: false }, { revoked: false, expiresAt: END }])
      expect(maintenanceGrantsSchema.safeParse({ [HOST_RECORD]: value }).success).toBe(false)
    for (const expiresAt of ['tomorrow', '2027-01-01', '2027-01-01T00:00:00+01:00', '', 1])
      expect(maintenanceGrantsSchema.safeParse({ [HOST_RECORD]: { expiresAt } }).success).toBe(
        false,
      )
  })

  it('is a member of the row configuration, which still refuses unknown members', () => {
    expect(
      authorizationConfig.safeParse({ maintenanceGrants: { [HOST_RECORD]: { revoked: true } } })
        .success,
    ).toBe(true)
    expect(authorizationConfig.safeParse({ grants: {} }).success).toBe(false)
  })
})

describe('the table with the tightening', () => {
  it('is the release table itself for an absent or empty configuration', () => {
    expect(tightenMaintenanceGrants(undefined)).toBe(MAINTENANCE_GRANTS)
    expect(tightenMaintenanceGrants({})).toBe(MAINTENANCE_GRANTS)
  })

  it('revokes one record and changes no other member of any record', () => {
    const table = tightenMaintenanceGrants({ [HOST_RECORD]: { revoked: true } })
    expect(table[AGENT_HOST_COMPONENT]).toEqual({
      ...MAINTENANCE_GRANTS[AGENT_HOST_COMPONENT],
      revoked: true,
    })
    expect(table[TENANT_DOMAIN_SCANNER_COMPONENT]).toBe(
      MAINTENANCE_GRANTS[TENANT_DOMAIN_SCANNER_COMPONENT],
    )
    expect(table[TOOL_RESIDENCY_COMPONENT]).toBe(MAINTENANCE_GRANTS[TOOL_RESIDENCY_COMPONENT])
    expect(Object.isFrozen(table)).toBe(true)
    expect(Object.isFrozen(table[AGENT_HOST_COMPONENT])).toBe(true)
    // The release table is not written through.
    expect(MAINTENANCE_GRANTS[AGENT_HOST_COMPONENT].revoked).toBe(false)
  })

  it('gives a record an end time without changing its purposes', () => {
    const table = tightenMaintenanceGrants({ [SCANNER_RECORD]: { expiresAt: END } })
    expect(table[TENANT_DOMAIN_SCANNER_COMPONENT]).toEqual({
      ...MAINTENANCE_GRANTS[TENANT_DOMAIN_SCANNER_COMPONENT],
      expiresAt: END,
    })
    expect(table[TENANT_DOMAIN_SCANNER_COMPONENT].revoked).toBe(false)
  })

  it('throws for a record id outside the table when called without the schema', () => {
    expect(() =>
      tightenMaintenanceGrants({ 'maintenance-grant/nobody': { revoked: true } }),
    ).toThrow(/unknown maintenance grant "maintenance-grant\/nobody"/u)
  })

  it('reports `revoked` and `expiresAt` through the read port, and the released record for the rest', async () => {
    const authority = inProcessPrincipalAuthority()
    const source = releaseMaintenanceGrants(
      tightenMaintenanceGrants({
        [HOST_RECORD]: { revoked: true },
        [RESIDENCY_RECORD]: { expiresAt: END },
      }),
    )
    const read = async (component: string) => {
      const principal = okOf(authority.issuer.issueSystem({ component }), component)
      return source.read({
        principal,
        operation: { owner: 'agent', name: 'publish' },
        target: {
          kind: 'tenant',
          tenant: A,
          resource: { owner: 'agent', kind: 'instance', key: 'k' },
        },
      })
    }
    expect(await read(AGENT_HOST_COMPONENT)).toMatchObject({
      kind: 'found',
      grant: { record: HOST_RECORD, revoked: true },
    })
    expect(await read(TOOL_RESIDENCY_COMPONENT)).toMatchObject({
      kind: 'found',
      grant: { record: RESIDENCY_RECORD, revoked: false, expiresAt: END },
    })
    expect(await read(TENANT_DOMAIN_SCANNER_COMPONENT)).toEqual({
      kind: 'found',
      grant: MAINTENANCE_GRANTS[TENANT_DOMAIN_SCANNER_COMPONENT],
    })
  })
})

describe('the row with the tightening', () => {
  it('behaves as before with no configuration and with an empty one', async () => {
    for (const config of [{}, { maintenanceGrants: {} }]) {
      const row = await mount(config)
      try {
        expect((await row.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
        expect(await row.publish('someone-else')).toEqual({ kind: 'denied' })
      } finally {
        await row.dispose()
      }
    }
  })

  it('answers denied for the revoked record, and allowed for the control: another record revoked', async () => {
    const revoked = await mount({ maintenanceGrants: { [HOST_RECORD]: { revoked: true } } })
    const control = await mount({ maintenanceGrants: { [SCANNER_RECORD]: { revoked: true } } })
    try {
      expect(await revoked.publish(AGENT_HOST_COMPONENT)).toEqual({ kind: 'denied' })
      expect((await control.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
    } finally {
      await revoked.dispose()
      await control.dispose()
    }
  })

  it('allows before the end time, denies from it on, by the injected clock', async () => {
    const time = testClock('2026-12-31T23:59:59Z')
    const ended = await mount(
      { maintenanceGrants: { [HOST_RECORD]: { expiresAt: END } } },
      time.clock,
    )
    const control = await mount({}, time.clock)
    try {
      expect((await ended.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
      time.set(END)
      expect(await ended.publish(AGENT_HOST_COMPONENT)).toEqual({ kind: 'denied' })
      time.set('2027-06-01T00:00:00Z')
      expect(await ended.publish(AGENT_HOST_COMPONENT)).toEqual({ kind: 'denied' })
      // The control has no end time, so the same clock does not end it.
      expect((await control.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
      // The clock moves back: the next check is allowed again, nothing was kept from before.
      time.set('2026-12-31T00:00:00Z')
      expect((await ended.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
    } finally {
      await ended.dispose()
      await control.dispose()
    }
  })

  it('does not end the host with the end time of another record', async () => {
    const time = testClock('2028-01-01T00:00:00Z')
    const row = await mount(
      { maintenanceGrants: { [SCANNER_RECORD]: { expiresAt: END } } },
      time.clock,
    )
    try {
      expect((await row.publish(AGENT_HOST_COMPONENT)).kind).toBe('allowed')
    } finally {
      await row.dispose()
    }
  })

  it('answers unavailable, not allowed, when the clock cannot answer for a record with an end time', async () => {
    const time = testClock('2026-01-01T00:00:00Z')
    const row = await mount(
      { maintenanceGrants: { [HOST_RECORD]: { expiresAt: END } } },
      time.clock,
    )
    try {
      time.fail()
      expect(await row.publish(AGENT_HOST_COMPONENT)).toMatchObject({ kind: 'unavailable' })
    } finally {
      await row.dispose()
    }
  })

  it('does not start with a record id that the table does not hold, and starts with a known one', async () => {
    const bad = { maintenanceGrants: { 'maintenance-grant/nobody': { revoked: true } } }
    await expect(mount(bad)).rejects.toThrow(
      /unknown maintenance grant "maintenance-grant\/nobody"/u,
    )
    const good = await mount({ maintenanceGrants: { [HOST_RECORD]: { revoked: true } } })
    await good.dispose()
  })

  it('does not start when the configuration tries to change the purposes or the principal of a record', async () => {
    for (const widening of [
      { purposes: ['enumerate-tenants'] },
      { principal: 'restart-scanner' },
      { revoked: true, scope: 'tenant' },
    ])
      await expect(mount({ maintenanceGrants: { [HOST_RECORD]: widening } })).rejects.toThrow()
    const good = await mount({ maintenanceGrants: { [HOST_RECORD]: { revoked: true } } })
    await good.dispose()
  })

  it('injects identityClock, so an end time is never configured without a clock to judge it', () => {
    expect(authorization.inject).toEqual([
      tenantStandingKey,
      principalVerifierKey,
      identityClockKey,
    ])
  })
})
