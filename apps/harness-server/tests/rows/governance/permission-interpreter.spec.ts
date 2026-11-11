import { describe, expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { interpretPermission } from '../../../src/rows/governance/permission-interpreter.ts'
import { resolvePermissionInterpretation } from '../../../src/rows/governance/permission-interpretation.ts'
import { permissionFixture } from './permission-fixture.ts'

describe('transaction permission interpretation', () => {
  it('preserves real composite tenant and target references through permission evaluation', () => {
    const tenant = tenantCodec.parse(
      '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}',
    )
    if (!tenant.ok) throw new Error('invalid tenant fixture')
    const encoded = tenantCodec.encode(tenant.value)
    if (!encoded.ok) throw new Error('tenant encoding failed')
    const input = permissionFixture()
    const scope = {
      ...input.action.request.scope,
      tenantId: encoded.value,
      targetId: JSON.stringify({
        scopeRef: encoded.value,
        policyId: 'independent',
        targetRef: 'commands/permissions/shell',
      }),
    }
    input.action.request.scope = scope
    input.current.request.scope = structuredClone(scope)
    input.current.evaluation.scope = structuredClone(scope)
    input.pick('trusted')
    expect(interpretPermission(input)).toMatchObject({
      kind: 'allow',
      evaluation: { scope },
    })
    input.action.request.scope = { ...scope, tenantId: `${encoded.value} ` }
    expect(interpretPermission(input)).toEqual({ kind: 'unavailable', reason: 'binding' })
  })

  it.each([
    ['blocked', 'deny'],
    ['review', 'need-decision'],
    ['trusted', 'allow'],
  ])('interprets the release-owned value %s as %s', (value, kind) => {
    const input = permissionFixture()
    input.pick(value)
    const result = interpretPermission(input)
    expect(result.kind).toBe(kind)
    expect(result).toMatchObject({ action: input.action })
    if (value !== 'blocked')
      expect(result).toMatchObject({ evaluation: { kind: 'effective', value } })
  })

  it('can resolve support before any governance adoption exists', () => {
    const { released, action } = permissionFixture()
    expect(resolvePermissionInterpretation(released, action.binding).kind).toBe('supported')
  })

  it.each([
    'implementationRef',
    'action',
    'interpretationRef',
    'enforcementKey',
    'capabilityId',
  ] as const)('rejects a same-name replacement with a different %s', field => {
    const input = permissionFixture()
    input.action.binding[field] = 'replacement'
    expect(interpretPermission(input).kind).toBe('unavailable')
  })

  it('does not treat a claimed interpretation version as installed code', () => {
    const input = permissionFixture()
    input.released.binding.interpretationRef = 'not-installed/2'
    input.action.binding.interpretationRef = 'not-installed/2'
    expect(interpretPermission(input)).toEqual({ kind: 'unavailable', reason: 'interpretation' })
  })

  it.each(['operation', 'arguments', 'tenant', 'target'] as const)(
    'does not reuse a current reading for a different %s',
    field => {
      const input = permissionFixture()
      if (field === 'operation') input.action.request.operation.operationId = 'action-2'
      if (field === 'arguments') input.action.request.argumentsDigest = 'b'.repeat(64)
      if (field === 'tenant') input.action.request.scope.tenantId = 'tenant-b'
      if (field === 'target') input.action.request.scope.targetId = 'target-b'
      expect(interpretPermission(input)).toEqual({ kind: 'unavailable', reason: 'binding' })
    },
  )

  it('rejects a changed definition body even under the same reference', () => {
    const input = permissionFixture()
    if (input.current.evaluation.declaration.kind !== 'available') throw new Error('fixture')
    input.current.evaluation.declaration.definition.defaultRule.pick = 'trusted'
    expect(interpretPermission(input)).toEqual({ kind: 'unavailable', reason: 'binding' })
  })

  it.each(['missing', 'duplicate', 'unknown', 'prohibited-allow'] as const)(
    'rejects a %s value interpretation',
    mutation => {
      const input = permissionFixture()
      if (mutation === 'missing') input.released.effects.pop()
      if (mutation === 'duplicate')
        input.released.effects.push({ value: 'review', effect: 'allow' })
      if (mutation === 'unknown') input.released.effects.push({ value: 'extra', effect: 'allow' })
      if (mutation === 'prohibited-allow')
        input.released.effects = input.released.effects.map(entry =>
          entry.value === 'blocked' ? { ...entry, effect: 'allow' } : entry,
        )
      expect(interpretPermission(input)).toEqual({ kind: 'unavailable', reason: 'material' })
    },
  )

  it('fails closed on missing required constraints and unavailable sources', () => {
    const input = permissionFixture()
    input.current.evaluation.requiredConstraintIds = ['agent-bound']
    expect(interpretPermission(input).kind).toBe('unavailable')
    input.current.evaluation.requiredConstraintIds = []
    input.current.evaluation.sources.organization = {
      kind: 'unavailable',
      sourceRef: 'organization',
    }
    expect(interpretPermission(input).kind).toBe('unavailable')
  })

  it('retains known prohibition despite another unavailable source', () => {
    const input = permissionFixture()
    input.pick('blocked')
    input.current.evaluation.sources.organization = {
      kind: 'unavailable',
      sourceRef: 'organization',
    }
    expect(interpretPermission(input)).toMatchObject({
      kind: 'deny',
      evaluation: { reason: 'active-prohibition' },
    })
  })

  it('does not mutate a captured request or retain state across tenants', () => {
    const first = permissionFixture()
    const second = permissionFixture()
    second.action.request.scope.tenantId = 'tenant-b'
    second.current.request.scope.tenantId = 'tenant-b'
    second.current.evaluation.scope.tenantId = 'tenant-b'
    first.pick('blocked')
    const before = structuredClone({
      released: second.released,
      action: second.action,
      current: second.current,
    })
    expect(interpretPermission(first).kind).toBe('deny')
    expect(interpretPermission(second).kind).toBe('need-decision')
    expect({ released: second.released, action: second.action, current: second.current }).toEqual(
      before,
    )
  })
})
