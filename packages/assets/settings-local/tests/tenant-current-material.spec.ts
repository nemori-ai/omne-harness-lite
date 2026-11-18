import { expect, it } from 'vitest'
import { tenant, tenantCodec } from '@omne-harness/legal-identity'
import { randomIdentifiers } from '@omne-harness/identity-sql'
import { standaloneCurrentMaterial } from '../src/organization-current-material.ts'
import { sourceSnapshot } from './source-retention-world.ts'
import { digest } from '../src/encoding.ts'

const tenantRef = (() => {
  const encoded = tenantCodec.encode(
    tenant(randomIdentifiers().organization(), randomIdentifiers().account()),
  )
  if (!encoded.ok) throw new Error('Expected canonical tenant')
  return encoded.value
})()
const source = {
  domain: { scope: { kind: 'tenant' as const, tenant: tenantRef }, transactionDomain: 'tenant/a' },
  target: {
    kind: 'independent' as const,
    providerId: 'example',
    definitionId: 'preferences',
    scopeRef: tenantRef,
  },
}
function input() {
  const projection = sourceSnapshot().projection
  return {
    source,
    actorTenantRef: tenantRef,
    projection: {
      ...projection,
      target: source.target,
      sources: projection.sources.map(s => ({
        ...s,
        scope: { kind: 'tenant' as const, subjectRef: tenantRef },
      })),
      grants: [{ sourceId: projection.sources[0]!.sourceId, actions: ['set' as const] }],
    },
    value: { revision: 3, presence: 'present' as const },
  }
}
const configuration = { destination: 'settings.tenant', sourceRoute: 'settings.tenant' }

it('reads a tenant independent target of the actor tenant without an organization standing', () => {
  expect(standaloneCurrentMaterial(input(), 'tenant', configuration)).toMatchObject({
    basis: {
      target: source.target,
      valueRevision: 3,
      declaration: { ownerRef: 'settings', subjectRef: digest(source) },
      selection: { kind: 'not-required' },
      policies: [{ inputs: [{ presence: 'present', valueRevision: '3' }] }],
    },
    standing: { kind: 'identity', scopeRef: tenantRef, required: [] },
    sources: { route: configuration.sourceRoute, sources: [] },
  })
})

it('refuses another tenant, a system domain and a source outside the tenant', () => {
  const observed = input()
  const other = tenantCodec.encode(
    tenant(randomIdentifiers().organization(), randomIdentifiers().account()),
  )
  if (!other.ok) throw new Error('Expected canonical tenant')
  expect(
    standaloneCurrentMaterial(
      { ...observed, actorTenantRef: other.value },
      'tenant',
      configuration,
    ),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    standaloneCurrentMaterial(
      {
        ...observed,
        source: {
          ...source,
          domain: { scope: { kind: 'system' as const }, transactionDomain: 'system.settings' },
        },
      },
      'tenant',
      configuration,
    ),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(
    standaloneCurrentMaterial(
      {
        ...observed,
        projection: {
          ...observed.projection,
          sources: observed.projection.sources.map(s => ({
            ...s,
            scope: { kind: 'organization' as const, subjectRef: 'org' },
          })),
        },
      },
      'tenant',
      configuration,
    ),
  ).toEqual({ kind: 'rejected', reason: 'unsupported' })
})

it('does not read a tenant target under the organization rule', () => {
  expect(standaloneCurrentMaterial(input(), 'organization', configuration)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
})
