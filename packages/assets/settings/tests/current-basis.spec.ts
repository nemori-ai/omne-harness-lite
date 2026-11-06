import { expect, it } from 'vitest'
import { SettingsCurrentBasisSchema, type SettingsCurrentBasis } from '../src/index.ts'

const source = {
  sourceId: 'organization',
  ownerRef: 'settings-owner',
  scope: { kind: 'organization' as const, subjectRef: 'organization-1' },
  authorityRevision: 'authority-7',
}
const authority = {
  ownerRef: 'governance',
  subjectRef: 'scope-and-declaration',
  revision: 'epoch-3',
}
const basis: SettingsCurrentBasis = {
  protocol: 'settings-current-basis/1',
  target: { policyId: 'standalone', targetRef: 'settings-1', scopeRef: 'tenant-1' },
  definitionRef: {
    providerId: 'provider',
    definitionId: 'settings',
    version: '1',
    digest: 'a'.repeat(64),
  },
  ownerRevision: 7,
  enabled: false,
  valueRevision: 2,
  sources: [source],
  declaration: authority,
  selection: { kind: 'not-required', authority },
  policies: [
    {
      policyRef: 'settings-write',
      interpretationRef: 'owner-policy/1',
      revision: 'policy-2',
      inputs: [
        {
          source,
          valueOriginRef: 'system.settings:organization-1',
          valueRevision: 'value-0',
          presence: 'absent',
        },
      ],
      constraints: [authority],
    },
  ],
}

it('preserves independent owner, authority, value and policy witnesses across serialization', () => {
  const parsed = SettingsCurrentBasisSchema.parse(JSON.parse(JSON.stringify(basis)))
  expect(parsed).toEqual(basis)
  expect(parsed.enabled).toBe(false)
  expect(parsed.sources[0]?.authorityRevision).toBe('authority-7')
  expect(parsed.valueRevision).toBe(2)
  expect(parsed.policies[0]?.inputs[0]).toMatchObject({
    presence: 'absent',
    valueRevision: 'value-0',
  })
  expect(
    SettingsCurrentBasisSchema.parse({
      ...basis,
      selection: { kind: 'current', authority },
    }).selection.kind,
  ).toBe('current')
})

it('requires a named declaration, selection authority and nonempty unique policy set', () => {
  for (const invalid of [
    { ...basis, declaration: undefined },
    { ...basis, selection: null },
    { ...basis, selection: { kind: 'not-required' } },
    { ...basis, policies: [] },
    { ...basis, policies: [basis.policies[0], basis.policies[0]] },
    { ...basis, authorized: true },
    { ...basis, protocol: 'settings-current-basis/2' },
    { ...basis, ownerRevision: Number.MAX_SAFE_INTEGER + 1 },
    { ...basis, valueRevision: -1 },
  ])
    expect(SettingsCurrentBasisSchema.safeParse(invalid).success).toBe(false)
})

it('does not encode source unavailability as absence or omit its value version', () => {
  const policy = basis.policies[0]!
  const input = policy.inputs[0]!
  for (const invalid of [
    { ...input, presence: 'unavailable' },
    { ...input, valueRevision: undefined },
    { ...input, source: { ...source, authorityRevision: undefined } },
  ]) {
    expect(
      SettingsCurrentBasisSchema.safeParse({
        ...basis,
        policies: [{ ...policy, inputs: [invalid] }],
      }).success,
    ).toBe(false)
  }
})

it('bounds each policy input and constraint collection', () => {
  const policy = basis.policies[0]!
  for (const size of [32, 33]) {
    for (const changed of [
      { ...policy, inputs: Array.from({ length: size }, () => policy.inputs[0]) },
      { ...policy, constraints: Array.from({ length: size }, () => authority) },
    ]) {
      expect(SettingsCurrentBasisSchema.safeParse({ ...basis, policies: [changed] }).success).toBe(
        size === 32,
      )
    }
  }
})
