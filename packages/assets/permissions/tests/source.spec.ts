import { describe, expect, it } from 'vitest'
import {
  PermissionBasisRequestSchema,
  PermissionCurrentBasisSchema,
  evaluatePermission,
} from '@omne-harness/permissions'
import { evaluation, reference, scope } from './fixtures.ts'

const request = {
  scope,
  operation: { owner: 'agent', operationId: 'action-1' },
  implementationRef: 'shell-release-1',
  argumentsDigest: 'a'.repeat(64),
  capabilityId: 'command',
  enforcementKey: 'command.execute',
  definition: reference,
}

describe('qualified permission source protocol', () => {
  it.each(['tenantId', 'targetId', 'organizationId', 'sessionId'] as const)(
    'rejects empty, oversized or control-character %s references',
    field => {
      for (const value of [
        '',
        'a'.repeat(4097),
        'tenant\nother',
        'tenant\u0000other',
        'tenant\u007fother',
      ]) {
        expect(
          PermissionBasisRequestSchema.safeParse({
            ...request,
            scope: { ...scope, [field]: value },
          }).success,
        ).toBe(false)
      }
    },
  )

  it('preserves the original action and reads revisions from the provider result', () => {
    const current = { kind: 'current', request, evaluation: evaluation() }
    expect(PermissionCurrentBasisSchema.parse(JSON.parse(JSON.stringify(current)))).toEqual(current)
  })

  it.each([
    { adoptionRevision: 'self-issued' },
    { targetRevision: 'self-issued' },
    { sources: evaluation().sources },
    { requiredConstraintIds: [] },
    { principal: 'admin' },
  ])('rejects caller-supplied authority facts: %j', extra => {
    expect(PermissionBasisRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false)
  })

  it.each([
    { scope: { ...scope, tenantId: 'tenant-b' } },
    { scope: { ...scope, sessionId: 'session-b' } },
    { scope: { ...scope, targetId: 'target-b' } },
    { scope: { ...scope, deploymentId: 'deployment-b' } },
    { scope: { ...scope, logicalServiceId: 'service-b' } },
    { definition: { ...reference, revision: 'another-release' } },
    { capabilityId: 'another-capability' },
    { enforcementKey: 'another-enforcement' },
  ])('rejects an evaluation for a different action binding: %j', other => {
    expect(
      PermissionCurrentBasisSchema.safeParse({
        kind: 'current',
        request,
        evaluation: { ...evaluation(), ...other },
      }).success,
    ).toBe(false)
  })

  it('preserves known prohibitions when another necessary source is unavailable', () => {
    const input = evaluation()
    const current = PermissionCurrentBasisSchema.parse({
      kind: 'current',
      request,
      evaluation: {
        ...input,
        sources: {
          ...input.sources,
          organization: { kind: 'unavailable', sourceRef: 'organization-settings' },
        },
        constraints: [{ ...input.constraints[0], effect: { kind: 'prohibition' } }],
      },
    })
    expect(evaluatePermission(current.evaluation)).toMatchObject({
      kind: 'denied',
      reason: 'active-prohibition',
    })
  })
})
