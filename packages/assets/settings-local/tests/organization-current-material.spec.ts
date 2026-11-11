import { expect, it } from 'vitest'
import { organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { organizationCurrentMaterial } from '../src/organization-current-material.ts'
import { sourceSnapshot } from './source-retention-world.ts'
import { source } from './source-service-world.ts'
import { digest } from '../src/encoding.ts'
function input() {
  const organization = organizationCodec.parse(source.target.scopeRef)
  if (!organization.ok) throw new Error('Expected canonical organization')
  const actor = tenantCodec.encode(tenant(organization.value, randomIdentifiers().account()))
  if (!actor.ok) throw new Error('Expected canonical actor tenant')
  const projection = sourceSnapshot().projection
  return {
    source,
    actorTenantRef: actor.value,
    projection: {
      ...projection,
      target: source.target,
      sources: projection.sources.map(s => ({
        ...s,
        scope: { kind: 'organization' as const, subjectRef: source.target.scopeRef },
      })),
      grants: [{ sourceId: 'organization', actions: ['set' as const, 'clear' as const] }],
    },
    value: { revision: 0, presence: 'absent' as const },
  }
}
const configuration = { destination: 'settings.organization', sourceRoute: 'settings.source' }
it('uses native owner and actual values without inventing runtime adoption, preserving the actor tenant', () => {
  const observed = input()
  const material = organizationCurrentMaterial(observed, configuration)
  expect(material).toMatchObject({
    basis: {
      target: source.target,
      ownerRevision: 1,
      valueRevision: 0,
      declaration: { ownerRef: 'settings', subjectRef: digest(source), revision: '1' },
      selection: { kind: 'not-required' },
      policies: [
        {
          interpretationRef: 'settings.decide-change/1',
          inputs: [{ presence: 'absent', valueRevision: '0' }],
        },
      ],
    },
    standing: {
      kind: 'identity',
      scopeRef: observed.actorTenantRef,
      required: ['organization-settings-manage'],
    },
    sources: { route: configuration.sourceRoute, sources: [] },
    grants: observed.projection.grants,
  })
})
it('rejects foreign actor organizations and external source layouts instead of erasing dependencies', () => {
  const observed = input()
  const foreign = tenantCodec.encode(
    tenant(randomIdentifiers().organization(), randomIdentifiers().account()),
  )
  if (!foreign.ok) throw new Error('Expected foreign actor tenant')
  expect(
    organizationCurrentMaterial({ ...observed, actorTenantRef: foreign.value }, configuration),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    organizationCurrentMaterial(
      {
        ...observed,
        projection: {
          ...observed.projection,
          sources: observed.projection.sources.map(s => ({
            ...s,
            scope: { kind: 'tenant', subjectRef: observed.actorTenantRef },
          })),
        },
      },
      configuration,
    ),
  ).toEqual({ kind: 'rejected', reason: 'unsupported' })
})
