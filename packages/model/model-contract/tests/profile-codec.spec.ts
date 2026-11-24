import { expect, it } from 'vitest'
import { tenantCodec, tenantEquals } from '@omne-harness/legal-identity'
import {
  decodeProviderName,
  decodeRevision,
  profileCovers,
  profileResolutionValue,
  readProfileResolution,
  supportedReasoningEfforts,
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

it('retains exactly the selectable effort keys and their native values', () => {
  const value = JSON.parse(JSON.stringify(ok(profileResolutionValue(resolution))))
  value.profile.definition.reasoningEfforts = { high: 'max', low: 'low', medium: 'high' }
  const decoded = ok(readProfileResolution(value))
  if (decoded.kind !== 'resolved') throw new Error('not resolved')
  expect(supportedReasoningEfforts(decoded.profile.definition)).toEqual(['low', 'medium', 'high'])
  expect(ok(profileResolutionValue(decoded))).toEqual(value)
  expect(supportedReasoningEfforts({})).toEqual([])
  for (const invalid of [{ max: 'max' }, { xhigh: 'none' }, ['low']]) {
    value.profile.definition.reasoningEfforts = invalid
    expect(readProfileResolution(value)).toHaveProperty('failure')
  }
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

const withFileTypes = (fileTypes: unknown): unknown => {
  const value = JSON.parse(JSON.stringify(ok(profileResolutionValue(resolution))))
  value.profile.definition.fileTypes = fileTypes
  return value
}

it('round trips the file types a profile takes natively, and leaves the member out when none are declared', () => {
  const restored = ok(readProfileResolution(withFileTypes(['application/pdf', 'application/json'])))
  if (restored.kind !== 'resolved') throw new Error('not resolved')
  expect(restored.profile.definition.fileTypes).toEqual(['application/pdf', 'application/json'])
  expect(ok(profileResolutionValue(restored))).toEqual(
    withFileTypes(['application/pdf', 'application/json']),
  )
  const plain = ok(readProfileResolution(ok(profileResolutionValue(resolution))))
  expect(plain.kind === 'resolved' && Object.hasOwn(plain.profile.definition, 'fileTypes')).toBe(
    false,
  )
})

it.each([
  ['a media type of a modality', ['image/png']],
  ['a media type that is not canonical', ['Application/PDF']],
  ['a media type with parameters', ['application/pdf; v=1']],
  ['something that is no media type', ['pdf']],
  ['a list that is no list', 'application/pdf'],
])('rejects file types with %s', (_, fileTypes) => {
  expect(readProfileResolution(withFileTypes(fileTypes))).toHaveProperty('failure')
})

const definition = { input: ['text', 'image'], fileTypes: ['application/pdf'] } as const

it.each([
  [{ modalities: ['text'] }, true],
  [{ modalities: ['text', 'image'] }, true],
  [{ modalities: ['text', 'voice'] }, false],
  [{ modalities: ['text', 'video'] }, false],
  [{ modalities: ['text'], fileTypes: [] }, true],
  [{ modalities: ['text'], fileTypes: ['application/pdf'] }, true],
  [{ modalities: ['text'], fileTypes: ['application/pdf', 'application/zip'] }, false],
  [{ modalities: ['voice'], fileTypes: ['application/pdf'] }, false],
] as const)('a profile of text, image and PDF covers %j: %s', (required, covered) => {
  expect(profileCovers(definition, required)).toBe(covered)
})

it('a profile that declares no file types covers no file type', () => {
  const required = { modalities: ['text'], fileTypes: ['application/pdf'] } as const
  expect(profileCovers({ input: ['text'] }, required)).toBe(false)
})
