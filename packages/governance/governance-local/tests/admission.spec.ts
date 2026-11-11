import { expect, it, vi } from 'vitest'
import {
  DEFAULT_TEAM_MODEL,
  inProcessPrincipalAuthority,
  standingPrincipalRef,
  type Qualification,
  type TenantStandingSource,
} from '@omne-harness/identity'
import { access, organizationCodec, tenantCodec } from '@omne-harness/legal-identity'
import { GovernanceAdmission } from '../src/admission.ts'
import type { AdmissionGrant, AdmissionRequest } from '../src/admission-schema.ts'
import { scope } from './operation-world.ts'
import { declaration } from './definition-fixture.ts'
import { openStandingWorld } from './standing-world.ts'

function setup(required: Qualification[] = []) {
  const authority = inProcessPrincipalAuthority()
  const actor = authority.issuer.issueSystem({ component: 'governance-assembly' })
  const tenant = tenantCodec.parse(scope.tenantRef)
  if (!tenant.ok || !('ok' in actor)) throw new Error('fixture identity')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant: tenant.value,
    work: { owner: 'governance', work: 'registration' },
  })
  if (!('ok' in issued)) throw new Error('fixture principal')
  const request = {
    action: 'contribute' as const,
    scope: structuredClone(scope),
    declaration: declaration(),
  }
  const grant: AdmissionGrant = {
    principalRef: standingPrincipalRef(issued.ok),
    scope: structuredClone(scope),
    action: 'contribute',
    owners: [
      {
        ownerId: request.declaration.reference.ownerId,
        enforcementBindings: structuredClone(request.declaration.enforcementBindings),
      },
    ],
    required,
  }
  const standing: TenantStandingSource = {
    read: async () => ({
      kind: 'member',
      role: { model: DEFAULT_TEAM_MODEL, role: 'member' },
      qualifications: [],
      evidence: { record: 'fixture', revision: '1' },
    }),
  }
  const grants: AdmissionGrant[] = [grant]
  const options = {
    tenantRef: scope.tenantRef,
    verifier: authority.verifier,
    standing,
    grants,
  }
  return {
    options,
    request,
    grant,
    authority,
    actor: actor.ok,
    access: access(issued.ok, tenant.value),
  }
}

it('requires an issued subject even when a copy has the allowed stable reference', async () => {
  const w = setup()
  const admission = new GovernanceAdmission(w.options)
  expect(await admission.check(w.access, w.request)).toMatchObject({ kind: 'admitted' })
  expect(
    await admission.check(access({ ...w.access.principal }, w.access.tenant), w.request),
  ).toEqual({ kind: 'denied' })
  expect(await admission.check(access(w.actor, w.access.tenant), w.request)).toEqual({
    kind: 'denied',
  })
})

it.each([
  'capabilityId',
  'enforcementKey',
  'implementationRef',
  'action',
  'interpretationRef',
] as const)('refuses an ungranted enforcement %s even under the same publisher', async field => {
  const w = setup()
  const admission = new GovernanceAdmission(w.options)
  w.request.declaration.enforcementBindings[0]![field] = 'ungranted'
  expect(await admission.check(w.access, w.request)).toEqual({ kind: 'denied' })
})

it('does not form an owner by enforcement Cartesian product', async () => {
  const w = setup()
  if (w.grant.action !== 'contribute') throw new Error('fixture grant')
  const other = structuredClone(w.grant.owners[0]!)
  other.ownerId = 'other'
  other.enforcementBindings[0]!.implementationRef = 'other-implementation'
  w.grant.owners.push(other)
  const admission = new GovernanceAdmission(w.options)
  w.request.declaration.enforcementBindings = structuredClone(other.enforcementBindings)
  expect(await admission.check(w.access, w.request)).toEqual({ kind: 'denied' })
  w.request.declaration.reference.ownerId = 'other'
  expect(await admission.check(w.access, w.request)).toMatchObject({ kind: 'admitted' })
})

it('permits a new version within the fixed owner and enforcement delegation', async () => {
  const w = setup()
  const admission = new GovernanceAdmission(w.options)
  w.request.declaration.reference.version = '2'
  expect(await admission.check(w.access, w.request)).toMatchObject({ kind: 'admitted' })
  w.request.declaration.reference.ownerId = 'unknown'
  expect(await admission.check(w.access, w.request)).toEqual({ kind: 'denied' })
})

it.each(['withdraw', 'adopt', 'catalog-management', 'catalog-runtime', 'operation-read'] as const)(
  'requires an explicit %s grant',
  async action => {
    const w = setup()
    const request: AdmissionRequest = { scope: w.request.scope, action }
    expect(await new GovernanceAdmission(w.options).check(w.access, request)).toEqual({
      kind: 'denied',
    })
    w.options.grants = [
      { principalRef: w.grant.principalRef, scope: w.grant.scope, action, required: [] },
    ]
    expect(await new GovernanceAdmission(w.options).check(w.access, request)).toMatchObject({
      kind: 'admitted',
    })
  },
)

it('refuses mismatched tenant, deployment, logical service and publisher', async () => {
  const w = setup()
  const admission = new GovernanceAdmission(w.options)
  for (const field of ['deploymentId', 'logicalServiceId'] as const) {
    const request = structuredClone(w.request)
    request.scope[field] = 'another'
    expect(await admission.check(w.access, request)).toEqual({ kind: 'denied' })
  }
  const parsed = tenantCodec.parse(
    scope.tenantRef.replace('00000000000000000000000002', '00000000000000000000000003'),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  expect(await admission.check(access(w.access.principal, parsed.value), w.request)).toEqual({
    kind: 'denied',
  })
  const tenant = tenantCodec.encode(parsed.value)
  if (!tenant.ok) throw new Error('fixture tenant text')
  const request = structuredClone(w.request)
  request.scope.tenantRef = tenant.value
  expect(await admission.check(w.access, request)).toEqual({ kind: 'denied' })
  w.options.grants = []
  expect(await new GovernanceAdmission(w.options).check(w.access, w.request)).toEqual({
    kind: 'denied',
  })
})

it('rejects a genuinely issued foreign tenant principal despite a matching grant reference', async () => {
  const w = setup()
  const foreignTenant = tenantCodec.parse(
    scope.tenantRef.replace('00000000000000000000000002', '00000000000000000000000003'),
  )
  if (!foreignTenant.ok) throw new Error('fixture tenant')
  const foreign = w.authority.issuer.issueActingForTenant({
    actor: w.actor,
    tenant: foreignTenant.value,
    work: w.access.principal.work,
  })
  if (!('ok' in foreign)) throw new Error('fixture principal')
  w.grant.principalRef = standingPrincipalRef(foreign.ok)
  const admission = new GovernanceAdmission(w.options)
  expect(await admission.check(access(foreign.ok, w.access.tenant), w.request)).toEqual({
    kind: 'denied',
  })
})

it('rejects another issued work principal in the same tenant', async () => {
  const w = setup()
  const other = w.authority.issuer.issueActingForTenant({
    actor: w.actor,
    tenant: w.access.tenant,
    work: { ...w.access.principal.work, work: 'another-registration' },
  })
  if (!('ok' in other)) throw new Error('fixture principal')
  expect(
    await new GovernanceAdmission(w.options).check(access(other.ok, w.access.tenant), w.request),
  ).toEqual({ kind: 'denied' })
})

it('checks tenant and organization visibility in addition to a matching grant', async () => {
  const w = setup()
  const org = organizationCodec.encode(w.access.tenant.organization)
  if (!org.ok) throw new Error('fixture organization')
  for (const visibility of [
    {
      kind: 'tenant' as const,
      tenantRef: scope.tenantRef.replace(
        '00000000000000000000000002',
        '00000000000000000000000003',
      ),
    },
    {
      kind: 'organization' as const,
      organizationRef: org.value.replace(
        '00000000000000000000000001',
        '00000000000000000000000003',
      ),
    },
  ]) {
    const request: AdmissionRequest = { ...w.request, scope: { ...w.request.scope, visibility } }
    const grant = { ...w.grant, scope: request.scope }
    expect(
      await new GovernanceAdmission({ ...w.options, grants: [grant] }).check(w.access, request),
    ).toEqual({ kind: 'denied' })
  }
  for (const visibility of [
    { kind: 'organization' as const, organizationRef: org.value },
    { kind: 'public' as const, publisherRef: 'publisher' },
  ]) {
    const request: AdmissionRequest = { ...w.request, scope: { ...w.request.scope, visibility } }
    const admission = new GovernanceAdmission({
      ...w.options,
      grants: [{ ...w.grant, scope: request.scope }],
    })
    expect(await admission.check(w.access, request)).toMatchObject({ kind: 'admitted' })
    request.scope.visibility = { kind: 'public', publisherRef: 'other' }
    expect(await admission.check(w.access, request)).toEqual({ kind: 'denied' })
  }
})

it('refuses missing qualifications and keeps dependency failures unavailable', async () => {
  const w = setup(['organization-settings-manage'])
  expect(await new GovernanceAdmission(w.options).check(w.access, w.request)).toEqual({
    kind: 'denied',
  })
  const offline = async () => {
    throw new Error('offline')
  }
  w.options.verifier = { verify: offline }
  expect(await new GovernanceAdmission(w.options).check(w.access, w.request)).toEqual({
    kind: 'unavailable',
    owner: 'identity-verifier',
  })
  const other = setup()
  other.options.standing = { read: offline }
  expect(await new GovernanceAdmission(other.options).check(other.access, other.request)).toEqual({
    kind: 'unavailable',
    owner: 'identity-standing',
  })
})

it('keeps construction and call inputs fixed across an asynchronous identity check', async () => {
  const w = setup()
  const pending = Promise.withResolvers<void>()
  const verify = w.options.verifier.verify
  w.options.verifier = {
    verify: async value => {
      await pending.promise
      return verify(value)
    },
  }
  const admission = new GovernanceAdmission(w.options)
  w.options.grants.length = 0
  const result = admission.check(w.access, w.request)
  w.request.declaration.reference.ownerId = 'changed'
  w.request.scope.logicalServiceId = 'changed'
  pending.resolve()
  const observed = await result
  expect(observed).toMatchObject({ kind: 'admitted', request: { scope } })
  if (observed.kind !== 'admitted') throw new Error('expected admission')
  expect(observed.principal).toBe(w.access.principal)
  expect(observed.request.action).toBe('contribute')
  expect(await admission.check(w.access, w.request)).toEqual({ kind: 'denied' })
})

it('rejects duplicate grants and duplicate owners instead of merging authority', () => {
  const w = setup()
  w.options.grants.push(structuredClone(w.grant))
  expect(() => new GovernanceAdmission(w.options)).toThrow('one exact')
  w.options.grants.pop()
  if (w.grant.action !== 'contribute') throw new Error('fixture grant')
  w.grant.owners.push(structuredClone(w.grant.owners[0]!))
  expect(() => new GovernanceAdmission(w.options)).toThrow('unique owners')
})

it('cannot upgrade an initially denied request by rewriting it while Identity waits', async () => {
  const w = setup()
  const pending = Promise.withResolvers<void>()
  const verify = w.options.verifier.verify
  w.options.verifier = {
    verify: async value => {
      await pending.promise
      return verify(value)
    },
  }
  const admission = new GovernanceAdmission(w.options)
  const originalOwner = w.request.declaration.reference.ownerId
  w.request.declaration.reference.ownerId = 'ungranted'
  const result = admission.check(w.access, w.request)
  w.request.declaration.reference.ownerId = originalOwner
  pending.resolve()
  expect(await result).toEqual({ kind: 'denied' })
})

it('isolates nested construction policy and returned qualification arrays', async () => {
  const w = setup(['organization-settings-manage'])
  const read = w.options.standing.read
  w.options.standing = {
    async read(input) {
      const result = await read(input)
      return result.kind === 'member'
        ? { ...result, qualifications: ['organization-settings-manage'] }
        : result
    },
  }
  const admission = new GovernanceAdmission(w.options)
  w.grant.required.length = 0
  if (w.grant.action !== 'contribute') throw new Error('fixture grant')
  w.grant.owners[0]!.ownerId = 'ungranted'
  w.grant.owners[0]!.enforcementBindings[0]!.implementationRef = 'ungranted'
  const result = await admission.check(w.access, w.request)
  expect(result).toMatchObject({ kind: 'admitted', required: ['organization-settings-manage'] })
  if (result.kind !== 'admitted') throw new Error('expected admission')
  Object.assign(result.required, { length: 0 })
  expect(await admission.check(w.access, w.request)).toMatchObject({
    kind: 'admitted',
    required: ['organization-settings-manage'],
  })
})

it('bounds malformed and excessive input before consulting Identity', async () => {
  const w = setup()
  const verifier = vi.fn(w.options.verifier.verify)
  w.options.verifier = { verify: verifier }
  const admission = new GovernanceAdmission(w.options)
  w.request.scope.deploymentId = ''
  expect(await admission.check(w.access, w.request)).toMatchObject({ kind: 'invalid-input' })
  w.request.scope.deploymentId = 'a'.repeat(1024 * 1024)
  expect(await admission.check(w.access, w.request)).toEqual({
    kind: 'limited',
    resource: 'admission-bytes',
  })
  expect(verifier).not.toHaveBeenCalled()
})

it('does not normalize declaration text before the later publication comparison', async () => {
  const w = setup()
  w.request.declaration.permissions[0]!.supportedScopes[0]!.description = ' changed text '
  expect(await new GovernanceAdmission(w.options).check(w.access, w.request)).toMatchObject({
    kind: 'invalid-input',
  })
})

it('uses actual Identity SQL membership and observes completed revocation', async () => {
  const w = await openStandingWorld()
  try {
    const request: AdmissionRequest = { action: 'operation-read', scope: w.scope }
    const admission = new GovernanceAdmission({
      tenantRef: w.scope.tenantRef,
      verifier: w.verifier,
      standing: w.identity.standing,
      grants: [
        { principalRef: w.principalRef, scope: w.scope, action: 'operation-read', required: [] },
      ],
    })
    const context = access(w.principal, w.principal.tenant)
    expect(await admission.check(context, request)).toMatchObject({ kind: 'admitted' })
    expect(await w.remove()).toMatchObject({ kind: 'succeeded' })
    expect(await admission.check(context, request)).toEqual({ kind: 'denied' })
  } finally {
    await w.close()
  }
})
