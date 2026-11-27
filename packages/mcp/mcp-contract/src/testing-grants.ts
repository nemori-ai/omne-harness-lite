import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { EndpointHolding } from './brands.ts'
import type {
  AuthorizationRecords,
  GrantFacts,
  GrantKey,
  GrantSecrets,
  PendingAuthorization,
  SecretSlot,
} from './grant.ts'
import { conformanceCase, tenantText, type ConformanceCase } from './testing-case.ts'

const keyText = (key: GrantKey): string => JSON.stringify([tenantText(key.tenant), key.holding])

export type MemoryAuthorizationRecords = AuthorizationRecords &
  Readonly<{
    /** From now on every call answers unavailable, until `restore`. */
    blind(): void
    restore(): void
  }>

export function createMemoryAuthorizationRecords(): MemoryAuthorizationRecords {
  const pending = new Map<string, PendingAuthorization>()
  const grants = new Map<string, GrantFacts>()
  const registrations = new Map<string, Parameters<AuthorizationRecords['register']>[2]>()
  let blind = false
  const down = () => fail('unavailable' as const)
  return {
    async begin(next) {
      if (blind) return down()
      for (const [state, standing] of pending)
        if (keyText(standing.key) === keyText(next.key)) pending.delete(state)
      pending.set(next.state, next)
      return succeed(true)
    },
    async take(state) {
      if (blind) return down()
      const found = pending.get(state)
      pending.delete(state)
      return succeed(found ?? 'absent')
    },
    async void(key) {
      if (blind) return down()
      for (const [state, standing] of pending)
        if (keyText(standing.key) === keyText(key)) pending.delete(state)
      return succeed(true)
    },
    async read(key) {
      if (blind) return down()
      return succeed(grants.get(keyText(key)) ?? 'absent')
    },
    async write(key, facts, expected) {
      if (blind) return down()
      const now = grants.get(keyText(key))
      if ((now?.revision ?? 'absent') !== expected) return fail('conflict')
      grants.set(keyText(key), facts)
      return succeed('written')
    },
    async remove(key) {
      if (blind) return down()
      grants.delete(keyText(key))
      return succeed(true)
    },
    async registration(tenant, issuer) {
      if (blind) return down()
      return succeed(registrations.get(JSON.stringify([tenantText(tenant), issuer])) ?? 'absent')
    },
    async register(tenant, issuer, registration) {
      if (blind) return down()
      registrations.set(JSON.stringify([tenantText(tenant), issuer]), registration)
      return succeed(true)
    },
    blind: () => {
      blind = true
    },
    restore: () => {
      blind = false
    },
  }
}

const slotText = (slot: SecretSlot): string =>
  slot.kind === 'client'
    ? JSON.stringify(['client', tenantText(slot.tenant), slot.issuer])
    : JSON.stringify([slot.kind, keyText(slot.key)])

export type MemoryGrantSecrets = GrantSecrets &
  Readonly<{
    /** The value a slot holds now, for assertions. */
    peek(slot: SecretSlot): string | undefined
    /** The next write of this kind answers unavailable and writes nothing. */
    failNext(kind: SecretSlot['kind']): void
    cut(): void
  }>

export function createMemoryGrantSecrets(): MemoryGrantSecrets {
  const values = new Map<string, string>()
  const failing = new Set<SecretSlot['kind']>()
  let down = false
  return {
    async read(slot) {
      if (down) return fail('unavailable')
      return succeed(values.get(slotText(slot)) ?? 'absent')
    },
    async write(slot, value) {
      if (down || failing.delete(slot.kind)) return fail('unavailable')
      values.set(slotText(slot), value)
      return succeed(true)
    },
    async remove(slot) {
      if (down) return fail('unavailable')
      values.delete(slotText(slot))
      return succeed(true)
    },
    peek: slot => values.get(slotText(slot)),
    failNext: kind => {
      failing.add(kind)
    },
    cut: () => {
      down = true
    },
  }
}

export type AuthorizationRecordsFixture = Readonly<{
  records: AuthorizationRecords
  tenant: TenantId
  otherTenant: TenantId
  unavailable?: () => Promise<void>
}>

const grantKeyOf = (tenant: TenantId, holding = 'holding-1'): GrantKey => ({
  tenant,
  holding: holding as EndpointHolding,
})

export function samplePending(key: GrantKey, state: string): PendingAuthorization {
  return {
    key,
    state,
    verifier: `verifier-${state}`,
    issuer: 'https://auth.example',
    issRequired: true,
    tokenEndpoint: 'https://auth.example/token',
    resource: 'https://mcp.example/mcp',
    scopes: ['read'],
    redirectUri: 'http://127.0.0.1:7801/callback',
    registration: { way: 'dynamic', clientId: 'client-1', authMethod: 'none' },
    initiator: 'alice',
    expiresAt: 1_900_000_000_000,
  }
}

export function sampleGrant(revision = 1): GrantFacts {
  return {
    issuer: 'https://auth.example',
    resource: 'https://mcp.example/mcp',
    tokenEndpoint: 'https://auth.example/token',
    scopes: ['read'],
    expiresAt: 1_900_000_000_000,
    registration: { way: 'dynamic', clientId: 'client-1', authMethod: 'none' },
    state: 'valid',
    minted: 'exchange',
    revision,
  }
}

export function mcpAuthorizationRecordsConformance(): readonly ConformanceCase<AuthorizationRecordsFixture>[] {
  type F = AuthorizationRecordsFixture
  return [
    conformanceCase<F>(
      'authorization-records',
      'a pending authorization is taken once, then it is absent',
      async ({ records, tenant }) => {
        const pending = samplePending(grantKeyOf(tenant), 's1')
        assert.deepEqual(await records.begin(pending), succeed(true))
        assert.deepEqual(await records.take('s1'), succeed(pending))
        assert.deepEqual(await records.take('s1'), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'authorization-records',
      'a new pending authorization of the same key voids the one that stood; another key keeps its own',
      async ({ records, tenant, otherTenant }) => {
        await records.begin(samplePending(grantKeyOf(tenant), 's1'))
        await records.begin(samplePending(grantKeyOf(otherTenant), 's2'))
        await records.begin(samplePending(grantKeyOf(tenant), 's3'))
        assert.deepEqual(await records.take('s1'), succeed('absent'))
        assert.deepEqual(
          await records.take('s2'),
          succeed(samplePending(grantKeyOf(otherTenant), 's2')),
        )
        await records.void(grantKeyOf(tenant))
        assert.deepEqual(await records.take('s3'), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'authorization-records',
      'grant facts are written against the revision they expect and read back whole',
      async ({ records, tenant }) => {
        const key = grantKeyOf(tenant)
        assert.deepEqual(await records.read(key), succeed('absent'))
        assert.deepEqual(await records.write(key, sampleGrant(1), 1), fail('conflict'))
        assert.deepEqual(await records.write(key, sampleGrant(1), 'absent'), succeed('written'))
        assert.deepEqual(await records.write(key, sampleGrant(2), 'absent'), fail('conflict'))
        assert.deepEqual(await records.write(key, sampleGrant(2), 1), succeed('written'))
        assert.deepEqual(await records.read(key), succeed(sampleGrant(2)))
        assert.deepEqual(await records.remove(key), succeed(true))
        assert.deepEqual(await records.read(key), succeed('absent'))
      },
    ),
    conformanceCase<F>(
      'authorization-records',
      'grants and registrations of one tenant are not seen from another',
      async ({ records, tenant, otherTenant }) => {
        await records.write(grantKeyOf(tenant), sampleGrant(1), 'absent')
        const registration = { way: 'dynamic', clientId: 'c-1', authMethod: 'none' } as const
        await records.register(tenant, 'https://auth.example', registration)
        assert.deepEqual(await records.read(grantKeyOf(otherTenant)), succeed('absent'))
        assert.deepEqual(
          await records.registration(otherTenant, 'https://auth.example'),
          succeed('absent'),
        )
        assert.deepEqual(
          await records.registration(tenant, 'https://auth.example'),
          succeed(registration),
        )
        assert.deepEqual(
          await records.registration(tenant, 'https://other.example'),
          succeed('absent'),
        )
      },
    ),
    conformanceCase<F>(
      'authorization-records',
      'a storage that cannot answer says unavailable, never absent',
      async ({ records, tenant, unavailable }) => {
        if (unavailable === undefined) return
        await unavailable()
        assert.deepEqual(await records.read(grantKeyOf(tenant)), fail('unavailable'))
        assert.deepEqual(await records.take('s9'), fail('unavailable'))
      },
    ),
  ]
}
