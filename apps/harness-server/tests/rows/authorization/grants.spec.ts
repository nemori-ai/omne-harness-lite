// The maintenance grant table (DP-4 §4.1): a release constant, looked up by the component text of
// a principal that the verifier already trusted, holding a record for the agent host. Run against
// the real reference system action authorization so the grant reaches the matrix step.
import { describe, expect, it } from 'vitest'
import {
  noArguments,
  referenceSystemActionAuthorization,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import { inProcessPrincipalAuthority, type SystemPrincipal } from '@omne-harness/identity'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import {
  AGENT_HOST_COMPONENT,
  AGENT_POLICY,
  MAINTENANCE_GRANTS,
  MAINTENANCE_GRANT_REVISION,
  SESSION_POLICY,
  holderProjection,
  releaseMaintenanceGrants,
} from '../../../src/rows/authorization/index.ts'

const AGENT_INSTANCE_PURPOSES = [
  'agent-instance-publish',
  'agent-instance-quiesce',
  'agent-instance-withdraw',
]

function someTenant() {
  const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
  const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
  if (!organization.ok || !account.ok) throw new Error('fixture tenant did not parse')
  return tenant(organization.value, account.value)
}

function issuedSystem(component: string) {
  const authority = inProcessPrincipalAuthority()
  const principal = authority.issuer.issueSystem({ component })
  if ('failure' in principal) throw new Error('fixture principal did not issue')
  return { authority, principal: principal.ok }
}

function agentInstanceRequest(
  principal: SystemPrincipal,
  name: 'publish' | 'quiesce' | 'withdraw',
): SystemActionRequest {
  return {
    principal,
    scope: 'system',
    operation: { owner: 'agent', name },
    target: {
      kind: 'tenant',
      tenant: someTenant(),
      resource: { owner: 'agent', kind: 'instance', key: 'agi_1' },
    },
    arguments: noArguments(),
  }
}

describe('the release grant table', () => {
  it('is a frozen constant with a record for the agent host and the tool residency principal', () => {
    expect(Object.isFrozen(MAINTENANCE_GRANTS)).toBe(true)
    expect(AGENT_HOST_COMPONENT).toBe('agent-host')
    expect(Object.keys(MAINTENANCE_GRANTS).sort()).toEqual(['agent-host', 'toolResidencyPrincipal'])
  })

  it('gives the agent host the three agent instance purposes and nothing else', () => {
    const record = MAINTENANCE_GRANTS[AGENT_HOST_COMPONENT]
    expect([...record.purposes].sort()).toEqual(AGENT_INSTANCE_PURPOSES)
    expect(Object.isFrozen(record)).toBe(true)
    expect(Object.isFrozen(record.purposes)).toBe(true)
  })

  it('gives the tool residency principal resident-references only', () => {
    expect(MAINTENANCE_GRANTS.toolResidencyPrincipal.purposes).toEqual(['resident-references'])
  })

  it('writes every record as an open deployment-level release record without an end time', () => {
    for (const [component, record] of Object.entries(MAINTENANCE_GRANTS)) {
      expect(record.source).toBe('harness-server/release')
      expect(record.record).toBe(`maintenance-grant/${component}`)
      expect(record.revision).toBe(MAINTENANCE_GRANT_REVISION)
      expect(record.generation).toBe(MAINTENANCE_GRANT_REVISION)
      expect(record.revoked).toBe(false)
      expect(record).not.toHaveProperty('expiresAt')
    }
  })
})

describe('the read port over the table', () => {
  it('answers found for a component with a record, none for the others, never unavailable', async () => {
    const source = releaseMaintenanceGrants()
    const { principal: host } = issuedSystem('agent-host')
    const { principal: scanner } = issuedSystem('restart-scanner')
    const target = agentInstanceRequest(host, 'publish').target
    const operation = { owner: 'agent', name: 'publish' }
    await expect(source.read({ principal: host, operation, target })).resolves.toEqual({
      kind: 'found',
      grant: MAINTENANCE_GRANTS['agent-host'],
    })
    await expect(source.read({ principal: scanner, operation, target })).resolves.toEqual({
      kind: 'none',
    })
  })

  it('does not read the component text as a wildcard or a prefix', async () => {
    const source = releaseMaintenanceGrants()
    for (const component of ['*', 'agent-host-2', 'agent', 'constructor', '__proto__']) {
      const { principal } = issuedSystem(component)
      const reading = await source.read({
        principal,
        operation: { owner: 'agent', name: 'publish' },
        target: agentInstanceRequest(principal, 'publish').target,
      })
      expect(reading).toEqual({ kind: 'none' })
    }
  })
})

describe('with the reference system action authorization', () => {
  it.each(['publish', 'quiesce', 'withdraw'] as const)(
    'allows the issued agent host to %s and denies another issued system principal',
    async name => {
      const { authority, principal: host } = issuedSystem('agent-host')
      const scanner = authority.issuer.issueSystem({ component: 'restart-scanner' })
      if ('failure' in scanner) throw new Error('fixture principal did not issue')
      const authorization = referenceSystemActionAuthorization({
        verifier: authority.verifier,
        grants: releaseMaintenanceGrants(),
        clock: null,
      })
      await expect(authorization.check(agentInstanceRequest(host, name))).resolves.toMatchObject({
        kind: 'allowed',
        basis: { grant: { record: 'maintenance-grant/agent-host' } },
      })
      await expect(
        authorization.check(agentInstanceRequest(scanner.ok, name)),
      ).resolves.toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    },
  )

  it('denies a hand-built principal with the host component text before the table is read', async () => {
    const { authority } = issuedSystem('agent-host')
    let reads = 0
    const counted = releaseMaintenanceGrants()
    const authorization = referenceSystemActionAuthorization({
      verifier: authority.verifier,
      grants: {
        read: input => {
          reads += 1
          return counted.read(input)
        },
      },
      clock: null,
    })
    const forged: SystemPrincipal = { kind: 'system', component: 'agent-host' }
    await expect(
      authorization.check(agentInstanceRequest(forged, 'publish')),
    ).resolves.toMatchObject({ kind: 'denied', reason: 'untrusted-principal' })
    expect(reads).toBe(0)
  })

  it('is unavailable, not denied, when the table is not installed', async () => {
    const { authority, principal: host } = issuedSystem('agent-host')
    const authorization = referenceSystemActionAuthorization({
      verifier: authority.verifier,
      grants: null,
      clock: null,
    })
    await expect(authorization.check(agentInstanceRequest(host, 'publish'))).resolves.toEqual({
      kind: 'unavailable',
      diagnostic: 'no maintenance grant source is installed',
    })
  })
})

describe('the holder projection', () => {
  it('shows the agent host passing exactly the three agent instance cells', () => {
    const projection = holderProjection({
      session: SESSION_POLICY,
      agent: AGENT_POLICY,
      grants: MAINTENANCE_GRANTS,
    })
    expect(projection['agent-host']).toEqual([
      { table: 'agent', operation: 'publish', purpose: 'agent-instance-publish' },
      { table: 'agent', operation: 'withdraw', purpose: 'agent-instance-withdraw' },
      { table: 'agent', operation: 'quiesce', purpose: 'agent-instance-quiesce' },
    ])
    expect(projection.toolResidencyPrincipal).toEqual([
      { table: 'session', operation: 'references', purpose: 'resident-references' },
    ])
  })
})
