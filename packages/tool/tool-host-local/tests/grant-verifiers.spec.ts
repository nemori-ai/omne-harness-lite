// The grant verifier of the local Tool host (row 4 of the guard table, D1 conclusion 1): the
// assembly passes one scope value, and the verifier accepts exactly that scope. The ledger side
// (an owner that no verifier declares) is in `ledger-guards.spec.ts`, over the real ledger.
import { describe, expect, it } from 'vitest'
import type { DurableEvidence, ResourceScope } from '@omne-harness/tool-contract'
import { createLocalGrantVerifiers, type LocalGrantScope } from '@omne-harness/tool-host-local'
import { callId, principalA, tenantA } from './coordinator-values.ts'

const declared: LocalGrantScope = {
  owner: 'tool-host-local.tenant',
  key: 'default',
  grant: {
    owner: 'tool-host-local.tenant',
    record: 'grant',
    revision: '1',
    digest: 'sha256:grant',
  },
}

async function verify(scope: ResourceScope, declaredScope: LocalGrantScope = declared) {
  const verifier = createLocalGrantVerifiers(declaredScope).get(declaredScope.owner)
  if (verifier === undefined) throw new Error('the verifier of the declared owner is missing')
  return verifier.verifyGrant({
    principal: principalA,
    tenant: tenantA,
    call: callId('call-1'),
    scope,
  })
}

describe('TL-11 A6 grant verifier', () => {
  it('TL-11 the map holds exactly the verifier of the declared owner', () => {
    const verifiers = createLocalGrantVerifiers(declared)
    expect([...verifiers.keys()]).toEqual([declared.owner])
  })

  it('TL-11 the declared scope is granted', async () => {
    expect(await verify({ ...declared })).toEqual({ kind: 'granted' })
  })

  it('TL-11 a copy of the declared evidence is granted whatever its key order', async () => {
    const grant: DurableEvidence = {
      digest: declared.grant.digest,
      revision: declared.grant.revision,
      record: declared.grant.record,
      owner: declared.grant.owner,
    }
    expect(await verify({ ...declared, grant })).toEqual({ kind: 'granted' })
  })

  it('TL-11 another key is refused', async () => {
    expect(await verify({ ...declared, key: 'another-key' })).toMatchObject({ kind: 'refused' })
  })

  it('TL-11 another owner is refused', async () => {
    expect(await verify({ ...declared, owner: 'another-owner' })).toMatchObject({
      kind: 'refused',
    })
  })

  it.each([
    ['owner', { owner: 'other' }],
    ['record', { record: 'other' }],
    ['revision', { revision: '2' }],
    ['digest', { digest: 'sha256:other' }],
  ] as const)('TL-11 a grant whose %s differs is refused', async (_field, change) => {
    expect(await verify({ ...declared, grant: { ...declared.grant, ...change } })).toMatchObject({
      kind: 'refused',
    })
  })

  it.each([
    ['scope.owner', { ...declared, owner: '' }],
    ['scope.key', { ...declared, key: '' }],
    ['scope.grant', { ...declared, grant: { ...declared.grant, digest: '' } }],
    ['scope', undefined],
  ] as const)('TL-11 a declared scope without a filled %s is a TypeError', (field, scope) => {
    expect(() => createLocalGrantVerifiers(scope as never)).toThrow(
      new TypeError(`${field}: ${scope === undefined ? 'missing' : 'not a filled value'}`),
    )
  })
})
