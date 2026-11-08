import { describe, expect, it } from 'vitest'
import {
  referenceSystemActionAuthorization,
  type SystemActionRequest,
  type SystemActionAuthorization,
  noArguments,
  SYSTEM_ACTION_MATRIX,
} from '@omne-harness/authorization'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { principalIssuer, verifierOf } from '../../../src/entry/principals.ts'
import { issueToolMaterialMaintainer } from '../../../src/entry/tool-material-maintainer.ts'
import {
  releaseMaintenanceGrants,
  MAINTENANCE_GRANTS,
  TOOL_MATERIAL_MAINTAINER_COMPONENT,
} from '../../../src/rows/authorization/grants.ts'
import { createToolAccessGuard } from '../../../src/rows/authorization/tool-access.ts'
import { createToolMaterialMaintenanceAccess } from '../../../src/rows/authorization/tool-material-access.ts'
import { fixtureEnv, fixtureTenant, okOf } from '../../entry/support.ts'

async function fixture() {
  const entry = fixtureEnv([principalIssuerKey])
  await entry.install(principalIssuer)
  const principal = issueToolMaterialMaintainer(entry.env)
  const requests: SystemActionRequest[] = []
  let revoked = false
  const grants = releaseMaintenanceGrants()
  const authorization = referenceSystemActionAuthorization({
    verifier: verifierOf(entry.env),
    grants: {
      read: input =>
        revoked
          ? Promise.resolve({
              kind: 'found',
              grant: { ...MAINTENANCE_GRANTS[TOOL_MATERIAL_MAINTAINER_COMPONENT], revoked: true },
            })
          : grants.read(input),
    },
    clock: null,
  })
  let current: SystemActionAuthorization | undefined = {
    check: input => {
      requests.push(input)
      return authorization.check(input)
    },
  }
  const access = createToolMaterialMaintenanceAccess(() => current)
  const input = {
    principal,
    tenant: fixtureTenant('a'),
    call: okOf(decodeToolCallId('call_1'), 'call'),
    action: 'maintain-materials' as const,
  }
  return {
    entry,
    principal,
    requests,
    access,
    input,
    authorization,
    revoke: () => {
      revoked = true
    },
    setCurrent: (value: SystemActionAuthorization | undefined) => {
      current = value
    },
  }
}

describe('tool material maintenance access', () => {
  it('uses the issued system identity and binds each request to its tenant and exact call', async () => {
    const { access, input, requests } = await fixture()
    expect(await access.qualify(input)).toEqual({ kind: 'allowed' })
    expect(await access.qualifyScan(input)).toEqual({ kind: 'allowed' })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toMatchObject({
      principal: input.principal,
      operation: { owner: 'tool', name: 'maintain-materials' },
      target: {
        kind: 'tenant',
        tenant: input.tenant,
        resource: { owner: 'tool', kind: 'call', key: 'call_1' },
      },
    })
    expect(requests[1]).toMatchObject({
      operation: { owner: 'tool', name: 'scan-materials' },
      target: { kind: 'tenant', tenant: input.tenant, resource: { owner: 'tool', kind: 'tenant' } },
    })
  })

  it('grants the entry principal only the two maintenance purposes and rejects copied credentials', async () => {
    const { principal, input, authorization } = await fixture()
    for (const row of SYSTEM_ACTION_MATRIX) {
      const request: SystemActionRequest = {
        principal,
        scope: 'system',
        operation: row.operation,
        arguments: noArguments(),
        target:
          row.target === 'system'
            ? { kind: 'system', resource: { ...row.resource, key: 'deployment' } }
            : {
                kind: 'tenant',
                tenant: input.tenant,
                resource: { ...row.resource, key: 'call_1' },
              },
      }
      expect((await authorization.check(request)).kind, row.purpose).toBe(
        ['tool-material-scan', 'tool-material-maintain'].includes(row.purpose)
          ? 'allowed'
          : 'denied',
      )
      expect((await authorization.check({ ...request, principal: { ...principal } })).kind).toBe(
        'denied',
      )
    }
  })

  it('rejects ordinary work, forged tenants and invalid calls before requesting authorization', async () => {
    const { access, input, requests } = await fixture()
    const authority = inProcessPrincipalAuthority()
    const actor = okOf(authority.issuer.issueSystem({ component: 'session' }), 'actor')
    const work = okOf(
      authority.issuer.issueActingForTenant({
        actor,
        tenant: input.tenant,
        work: { owner: 'session', work: 's1' },
      }),
      'work',
    )
    expect((await access.qualify({ ...input, principal: work })).kind).toBe('denied')
    expect((await access.qualifyScan({ ...input, principal: work })).kind).toBe('denied')
    expect((await access.qualify({ ...input, tenant: { ...input.tenant } })).kind).toBe('denied')
    expect((await access.qualifyScan({ ...input, tenant: { ...input.tenant } })).kind).toBe(
      'denied',
    )
    expect((await access.qualify({ ...input, call: 'not a call' as typeof input.call })).kind).toBe(
      'denied',
    )
    expect(requests).toEqual([])
  })

  it('cannot use the maintenance guard to read results or change an invocation', async () => {
    const { access, input, requests } = await fixture()
    for (const action of ['admit', 'read-content', 'read-result', 'write', 'control'] as const)
      expect((await access.qualify({ ...input, action })).kind).toBe('denied')
    expect(requests).toEqual([])
    const ordinary = createToolAccessGuard(() => undefined)
    expect((await ordinary.qualify(input)).kind).toBe('unavailable')
  })

  it('does not cache grants or require a current member standing to maintain historical material', async () => {
    const { access, input, revoke } = await fixture()
    expect((await access.qualify(input)).kind).toBe('allowed')
    revoke()
    expect((await access.qualify(input)).kind).toBe('denied')
    expect((await access.qualifyScan(input)).kind).toBe('denied')
  })

  it('reads the current dependency and does not disclose exceptions', async () => {
    const { access, input, setCurrent } = await fixture()
    setCurrent(undefined)
    expect((await access.qualify(input)).kind).toBe('unavailable')
    setCurrent({
      check: async () => {
        throw new Error('secret fixture token')
      },
    })
    const failed = await access.qualifyScan(input)
    expect(failed.kind).toBe('unavailable')
    expect(JSON.stringify(failed)).not.toContain('secret fixture token')
    setCurrent({ check: async () => ({ kind: 'unavailable', diagnostic: 'secret fixture token' }) })
    expect(await access.qualify(input)).toEqual({
      kind: 'unavailable',
      diagnostic: 'material maintenance authorization is unavailable',
    })
  })

  it('fails issuance when the trusted issuer is absent', () => {
    const entry = fixtureEnv([principalIssuerKey])
    expect(() => issueToolMaterialMaintainer(entry.env)).toThrow(/principalIssuer/u)
  })
})
