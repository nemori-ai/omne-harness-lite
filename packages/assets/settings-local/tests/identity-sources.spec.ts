import { afterEach, expect, it } from 'vitest'
import { standingPrincipalRef } from '@omne-harness/identity'
import { organizationCodec } from '@omne-harness/legal-identity'
import { createIdentityQualifiedSettingsSources } from '../src/preparation.ts'
import { openSourceServiceWorld, source } from './source-service-world.ts'
import { openIdentityWorld } from './identity-world.ts'
import { sourceRequest } from './source-retention-world.ts'
const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})
it('qualifies the actual organization member and recovers the original hold after removal', async () => {
  const identity = await openIdentityWorld()
  close.push(() => identity.close())
  const organization = organizationCodec.encode(identity.principal.tenant.organization)
  if (!organization.ok) throw new Error('Invalid organization')
  const selectedSource = { ...source, target: { ...source.target, scopeRef: organization.value } }
  const w = await openSourceServiceWorld(
    {
      async seal(request) {
        return { kind: 'terminal', request, outcome: 'aborted' }
      },
    },
    undefined,
    selectedSource,
  )
  close.push(() => w.close())
  const service = createIdentityQualifiedSettingsSources({
    backend: {
      ...w.options,
      access: {
        authorize: (principal, request) =>
          w.options.access.authorize(standingPrincipalRef(principal), request),
      },
    },
    identity: { verifier: identity.authority.verifier, standing: identity.identity.standing },
  })
  close.push(() => service.control.close())
  const request = {
    ...sourceRequest(),
    source: selectedSource,
    destination: {
      ...sourceRequest().destination,
      identity: {
        domain: identity.world.domain,
        principalRef: standingPrincipalRef(identity.principal),
        operation: { target: identity.change.target, operationId: 'consumer-operation' },
      },
    },
  }
  expect(await service.service.reserve(identity.principal, request)).toMatchObject({
    kind: 'held',
    snapshot: { presence: 'absent' },
  })
  expect(await service.service.reserve(identity.principal, { ...request, source })).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(
    await service.service.reserve(identity.principal, {
      ...request,
      destination: {
        ...request.destination,
        identity: {
          ...request.destination.identity,
          domain: {
            ...request.destination.identity.domain,
            scope: { kind: 'tenant', tenant: 'foreign' },
          },
        },
      },
    }),
  ).toEqual({ kind: 'rejected', reason: 'forbidden' })
  expect(await identity.remove()).toEqual({ kind: 'succeeded' })
  expect(await service.service.reserve(identity.principal, request)).toEqual({
    kind: 'rejected',
    reason: 'forbidden',
  })
  expect(await service.control.recover({ after: null, limit: 100 })).toMatchObject({
    kind: 'recovered',
    items: [{ result: { kind: 'settled', outcome: 'aborted' } }],
  })
  expect(await w.set()).toMatchObject({ kind: 'committed' })
})
