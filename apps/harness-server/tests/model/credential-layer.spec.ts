import { describe, expect, it } from 'vitest'
import { decodeRevision, type ModelProfile } from '@omne-harness/model-contract'
import type { CredentialFailure, CredentialPort } from '@omne-harness/model-contract/provider'
import { officialProfileAdoption, officialProfiles } from '@omne-harness/model-host-local'
import { credentialLayerSupplier } from '../../src/model/credential-layer.ts'
import { fixtureTenant } from '../entry/support.ts'

const access = {
  principal: Object.freeze({ subject: 'credential-layer-test' }),
  tenant: fixtureTenant('a'),
}
async function inputOf() {
  const definition = officialProfiles({
    retryPolicy: { owner: 'test', name: 'retry', revision: '1', digest: '0'.repeat(64) },
    compactionTriggerPercent: '80',
  }).find(profile => profile.suppliers[0].model === 'moonshotai/kimi-k3')
  if (definition === undefined) throw new Error('Kimi profile missing')
  const revision = decodeRevision(definition.suppliers[0].adoption.revision)
  if (!('ok' in revision)) throw new Error('profile revision invalid')
  const profile: ModelProfile = {
    identity: { scope: { kind: 'factory' }, route: 'moonshotai/kimi-k3' },
    adoption: officialProfileAdoption(definition),
    revision: revision.ok,
    updatedAt: '2026-11-23T00:00:00Z',
    availability: 'active',
    definition,
  }
  return { ...access, profile, supplier: definition.suppliers[0] }
}
const refusedPort = (failure: CredentialFailure): CredentialPort => ({
  layerOf: () => ({ failure }),
  resolve: () => {
    throw new Error('preparation must not read secrets')
  },
})

describe('the release credential layer supplier', () => {
  it.each<CredentialFailure>([
    { kind: 'missing' },
    { kind: 'incomplete', missing: ['apiKey'] },
    { kind: 'revoked' },
    { kind: 'unreadable' },
  ])('rejects a known $kind credential before the Model call instead of waiting', async failure => {
    const supplied = credentialLayerSupplier(() => refusedPort(failure))(await inputOf())
    expect(supplied).toEqual({
      failure: { kind: 'invalid', field: 'credential', reason: `credential-${failure.kind}` },
    })
  })
  it('keeps genuine unavailability and denial distinct', async () => {
    const input = await inputOf()
    expect(credentialLayerSupplier(() => refusedPort({ kind: 'unavailable' }))(input)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-unavailable',
      },
    })
    expect(credentialLayerSupplier(() => refusedPort({ kind: 'denied' }))(input)).toEqual({
      failure: { kind: 'denied', action: 'model-credential' },
    })
    expect(credentialLayerSupplier(() => undefined)(input)).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-absent',
      },
    })
    expect(
      credentialLayerSupplier(() => ({
        ...refusedPort({ kind: 'missing' }),
        layerOf: () => {
          throw new Error('custody offline')
        },
      }))(input),
    ).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-failed',
      },
    })
  })
  it('preserves the real access and profile scope when fixing the returned whole layer', async () => {
    const input = await inputOf()
    const scopes: boolean[] = []
    const port: CredentialPort = {
      layerOf: query => {
        expect(query.access.principal).toBe(access.principal)
        expect(query.access.tenant).toBe(access.tenant)
        expect(query.provider).toBe(input.supplier.provider)
        scopes.push(query.official)
        return { ok: { layer: 'tenant' } }
      },
      resolve: () => {
        throw new Error('preparation must not read secrets')
      },
    }
    const supply = credentialLayerSupplier(() => port)
    expect(supply(input)).toEqual({
      ok: {
        adoption: input.supplier.adoption,
        provider: input.supplier.provider,
        model: input.supplier.model,
        credential: { layer: 'tenant' },
      },
    })
    const tenantProfile: ModelProfile = {
      ...input.profile,
      identity: { ...input.profile.identity, scope: { kind: 'tenant', tenant: access.tenant } },
    }
    expect(supply({ ...input, profile: tenantProfile })).toEqual({
      ok: {
        adoption: input.supplier.adoption,
        provider: input.supplier.provider,
        model: input.supplier.model,
        credential: { layer: 'tenant' },
      },
    })
    expect(scopes).toEqual([true, false])
  })
})
