import { describe, expect, it } from 'vitest'
import { decodePrincipalKey, type Access } from '@omne-harness/request-context-contract'
import {
  createAssemblyFixture,
  testingAccess,
} from '@omne-harness/request-context-contract/testing'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createScriptedRequestContextTrust } from '@omne-harness/request-context-cordis-contract/testing'

const base = createAssemblyFixture()
const access: Access<string> = base.call.access
const owner = { owner: 'o', name: 'n', revision: '1', digest: 'd' }
const key = (() => {
  const decoded = decodePrincipalKey('principal_one')
  if ('failure' in decoded) throw new Error('fixture')
  return decoded.ok
})()
const foreignTenant = (() => {
  const parsed = tenantCodec.parse(
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
  )
  if (!parsed.ok) throw new Error('fixture')
  return parsed.value
})()

const script = {
  keys: [{ access, result: { kind: 'value' as const, value: key } }],
  grants: [
    {
      access,
      target: base.target,
      owner,
      action: 'register' as const,
      decision: { kind: 'allowed' as const },
    },
  ],
}
const listed = { access, target: base.target, owner, action: 'register' as const }

describe('scripted trust: keys match every field of the access (C4)', () => {
  const trust = createScriptedRequestContextTrust<string>(script)
  it('answers the listed access', async () => {
    expect(await trust.principalBinding.key(access)).toEqual({ kind: 'value', value: key })
  })
  it('an empty script answers unavailable', async () => {
    const empty = createScriptedRequestContextTrust<string>({ keys: [], grants: [] })
    expect(await empty.principalBinding.key(access)).toMatchObject({ kind: 'unavailable' })
    expect(await empty.registrationAuthority.check(listed)).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('a different principal is unavailable', async () => {
    expect(await trust.principalBinding.key(testingAccess('q', access.tenant))).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('a different tenant is unavailable', async () => {
    expect(
      await trust.principalBinding.key(testingAccess(access.principal, foreignTenant)),
    ).toMatchObject({ kind: 'unavailable' })
  })
})

describe('scripted trust: grants match every field (C4)', () => {
  const trust = createScriptedRequestContextTrust<string>(script)
  const ask = (patch: object) => trust.registrationAuthority.check({ ...listed, ...patch } as never)
  it('answers the listed grant with its decision', async () => {
    expect(await ask({})).toEqual({ kind: 'allowed' })
  })
  it('access principal differs', async () => {
    expect(await ask({ access: testingAccess('q', access.tenant) })).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('access tenant differs', async () => {
    expect(await ask({ access: testingAccess(access.principal, foreignTenant) })).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('target tenant differs', async () => {
    expect(await ask({ target: { ...base.target, tenant: foreignTenant } })).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('target scope differs', async () => {
    const scope = { ...base.target.scope, ref: 'other-scope' } as typeof base.target.scope
    expect(await ask({ target: { ...base.target, scope } })).toMatchObject({
      kind: 'unavailable',
    })
  })
  it.each(['owner', 'name', 'revision', 'digest'] as const)('owner %s differs', async field => {
    expect(await ask({ owner: { ...owner, [field]: 'changed' } })).toMatchObject({
      kind: 'unavailable',
    })
  })
  it('action differs', async () => {
    expect(await ask({ action: 'replace' })).toMatchObject({ kind: 'unavailable' })
  })
})
