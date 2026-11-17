import { expect, it } from 'vitest'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeProviderName,
  decodeRevision,
  profileResolutionValue,
  readProfileResolution,
  type ProfileResolution,
} from '@omne-harness/model-contract'

function ok<T>(value: { ok: T } | { failure: unknown }): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}
const tenant = tenantCodec.parse(
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000000"}',
)
if (!tenant.ok) throw new Error('tenant fixture')
const adopted = { owner: 'test', name: 'profile', revision: '1', digest: 'a'.repeat(64) }
const resolution: ProfileResolution = {
  kind: 'resolved',
  selectable: true,
  reasons: [],
  credential: 'available',
  shadowed: [],
  source: { owner: 'test', record: 'profiles/1', revision: '1', digest: 'source' },
  profile: {
    identity: { scope: { kind: 'tenant', tenant: tenant.value }, route: 'default' },
    adoption: adopted,
    revision: ok(decodeRevision('1')),
    updatedAt: '2026-11-16',
    availability: 'active',
    definition: {
      suppliers: [{ adoption: adopted, provider: ok(decodeProviderName('test')), model: 'test' }],
      fallback: false,
      input: ['text'],
      output: ['text'],
      context: {
        window: { provided: '1000', upstream: [] },
        input: null,
        output: { provided: '100', upstream: [] },
        compactionTriggerPercent: '80',
      },
      limits: [],
      parameters: [{ kind: 'temperature', value: 0.2 }],
      representation: adopted,
      meter: adopted,
      retryPolicy: adopted,
    },
  },
}

it('round trips a frozen profile through JSON and restores legal identity', () => {
  const value = ok(profileResolutionValue(resolution))
  const restored = ok(readProfileResolution(JSON.parse(JSON.stringify(value))))
  expect(restored).toEqual(resolution)
  if (restored.kind !== 'resolved' || restored.profile.identity.scope.kind !== 'tenant')
    throw new Error('scope changed')
  expect(tenantEquals(restored.profile.identity.scope.tenant, tenant.value)).toBe(true)
  expect(Object.isFrozen(restored.profile.definition)).toBe(true)
})

it('rejects invalid parameters, forged scope and unknown profile fields', () => {
  const value = JSON.parse(JSON.stringify(ok(profileResolutionValue(resolution))))
  value.profile.definition.parameters[0].value = 3
  expect(readProfileResolution(value)).toHaveProperty('failure')
  value.profile.definition.parameters = []
  value.profile.identity.scope.tenant = { ...tenant.value }
  expect(readProfileResolution(value)).toHaveProperty('failure')
  const extra = JSON.parse(JSON.stringify(ok(profileResolutionValue(resolution))))
  extra.profile.runtime = {}
  expect(readProfileResolution(extra)).toHaveProperty('failure')
})

it('does not execute accessors while decoding external values', () => {
  let calls = 0
  const value = {
    get kind() {
      calls += 1
      return 'absent'
    },
    reason: 'withdrawn',
  }
  expect(readProfileResolution(value)).toHaveProperty('failure')
  expect(calls).toBe(0)
})
