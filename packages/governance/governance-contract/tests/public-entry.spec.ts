import { expect, it } from 'vitest'
import {
  GovernanceAdoptionCommandSchema,
  GovernanceContributionCommandSchema,
  GovernanceOperationQuerySchema,
  GovernanceScopeSchema,
  GovernanceTenantRefSchema,
} from '@omne-harness/governance-contract'
import { governanceContributionsKey } from '@omne-harness/governance-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'

const tenantRef = JSON.stringify({
  organization: 'org_00000000000000000000000001',
  account: 'acc_00000000000000000000000002',
})
const scope = {
  tenantRef,
  deploymentId: 'deployment-1',
  logicalServiceId: 'harness',
  visibility: { kind: 'tenant', tenantRef },
}

it('uses legal identity canonical text at the transport boundary', () => {
  expect(tenantCodec.parse(tenantRef).ok).toBe(true)
  expect(GovernanceTenantRefSchema.safeParse(tenantRef).success).toBe(true)
  expect(GovernanceTenantRefSchema.safeParse('tenant-1').success).toBe(false)
  expect(
    GovernanceTenantRefSchema.safeParse(JSON.stringify(JSON.parse(tenantRef), null, 2)).success,
  ).toBe(false)
  expect(GovernanceScopeSchema.safeParse(scope).success).toBe(true)
})

it('keeps a trusted principal out of the operation lookup request', () => {
  const query = { scope, owner: 'contribute', operationId: 'operation-1' }
  expect(GovernanceOperationQuerySchema.safeParse(query).success).toBe(true)
  expect(
    GovernanceOperationQuerySchema.safeParse({ ...query, principalRef: 'another-principal' })
      .success,
  ).toBe(false)
  expect(
    GovernanceOperationQuerySchema.safeParse({ ...query, generation: 'new-generation' }).success,
  ).toBe(false)
})

it('requires complete collection and both revisions for adoption', () => {
  const command = {
    scope,
    operationId: 'adopt-1',
    expectedAdoptionRevision: 0,
    expectedDeclarationRevision: 1,
    collection: { scope, declarationRevision: 1, digest: 'a'.repeat(64) },
    complete: [],
  }
  expect(GovernanceAdoptionCommandSchema.safeParse(command).success).toBe(true)
  expect(
    GovernanceAdoptionCommandSchema.safeParse({ ...command, collection: undefined }).success,
  ).toBe(false)
  expect(
    GovernanceAdoptionCommandSchema.safeParse({ ...command, expectedDeclarationRevision: -1 })
      .success,
  ).toBe(false)
  expect(
    GovernanceAdoptionCommandSchema.safeParse({
      ...command,
      expectedAdoptionRevision: Number.MAX_SAFE_INTEGER,
    }).success,
  ).toBe(false)
})

it('rejects runtime material in serializable declarations', () => {
  const command = {
    scope,
    contributorId: 'calendar',
    generation: 'generation-1',
    operationId: 'register-1',
    declaration: {
      reference: {
        ownerId: 'calendar',
        definitionId: 'calendar',
        version: '1',
        digest: 'a'.repeat(64),
      },
      origin: { kind: 'independent', providerId: 'calendar', definitionRef: 'calendar/1' },
      settings: [],
      permissions: [],
      enforcementBindings: [],
    },
  }
  expect(GovernanceContributionCommandSchema.safeParse(command).success).toBe(true)
  expect(
    GovernanceContributionCommandSchema.safeParse({ ...command, participant: () => true }).success,
  ).toBe(false)
  expect(
    GovernanceContributionCommandSchema.safeParse({ ...command, generation: '' }).success,
  ).toBe(false)
})

it('exports only the declared service key from the Cordis contract', () => {
  expect(governanceContributionsKey).toBe('governanceContributions')
})
