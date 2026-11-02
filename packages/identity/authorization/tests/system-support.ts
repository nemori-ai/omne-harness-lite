// Fixtures of the system action tests. The matrix below is an independent literal copy of the
// rows of SPEC AU-12, so a change to the implementation table shows up as a failing comparison.
import {
  noArguments,
  effectiveArgumentsOf,
  referenceSystemActionAuthorization,
  type MaintenanceGrant,
  type SystemActionAuthorization,
  type SystemActionDependencies,
  type SystemActionRequest,
  type SystemActionTarget,
} from '@omne-harness/authorization'
import { manualSystemClock, scriptedMaintenanceGrants } from '@omne-harness/authorization/testing'
import type { PrincipalVerifier, SystemPrincipal } from '@omne-harness/identity'
import { adminTenant, issued } from './support.ts'

export type MatrixRow = Readonly<{
  purpose: string
  owner: string
  name: string
  branch: 'system' | 'tenant'
  resourceOwner: string
  resourceKind: string
  key: string
  fixedArguments: boolean
}>

export const ROWS: readonly MatrixRow[] = [
  {
    purpose: 'resident-references',
    owner: 'session',
    name: 'references',
    branch: 'system',
    resourceOwner: 'session',
    resourceKind: 'resident-references',
    key: 'resident_1',
    fixedArguments: true,
  },
  {
    purpose: 'released-scopes',
    owner: 'session',
    name: 'releasedScopes',
    branch: 'system',
    resourceOwner: 'session',
    resourceKind: 'released-scopes',
    key: 'deployment',
    fixedArguments: true,
  },
  {
    purpose: 'enumerate-tenants',
    owner: 'tenant-domains',
    name: 'enumerate',
    branch: 'system',
    resourceOwner: 'tenant-domains',
    resourceKind: 'registered-tenants',
    key: 'deployment',
    fixedArguments: true,
  },
  {
    purpose: 'pending-sessions',
    owner: 'session',
    name: 'pending',
    branch: 'tenant',
    resourceOwner: 'session',
    resourceKind: 'tenant',
    key: 'tenant-text',
    fixedArguments: true,
  },
  {
    purpose: 'scope-release-receive',
    owner: 'session',
    name: 'receive',
    branch: 'tenant',
    resourceOwner: 'session',
    resourceKind: 'session',
    key: 'ses_1',
    fixedArguments: false,
  },
  {
    purpose: 'scope-release-load',
    owner: 'session',
    name: 'loadScopeRelease',
    branch: 'tenant',
    resourceOwner: 'session',
    resourceKind: 'session',
    key: 'ses_1',
    fixedArguments: true,
  },
  {
    purpose: 'scope-release-query',
    owner: 'session',
    name: 'queryScopeReleaseOperation',
    branch: 'tenant',
    resourceOwner: 'session',
    resourceKind: 'session',
    key: 'ses_1',
    fixedArguments: false,
  },
  {
    purpose: 'agent-instance-publish',
    owner: 'agent',
    name: 'publish',
    branch: 'tenant',
    resourceOwner: 'agent',
    resourceKind: 'instance',
    key: 'agi_1',
    fixedArguments: true,
  },
  {
    purpose: 'agent-instance-quiesce',
    owner: 'agent',
    name: 'quiesce',
    branch: 'tenant',
    resourceOwner: 'agent',
    resourceKind: 'instance',
    key: 'agi_1',
    fixedArguments: true,
  },
  {
    purpose: 'agent-instance-withdraw',
    owner: 'agent',
    name: 'withdraw',
    branch: 'tenant',
    resourceOwner: 'agent',
    resourceKind: 'instance',
    key: 'agi_1',
    fixedArguments: true,
  },
]

export const row = (name: string): MatrixRow => {
  const found = ROWS.find(candidate => candidate.name === name)
  if (found === undefined) throw new Error(`fixture row ${name}`)
  return found
}

export function targetOf(value: MatrixRow): SystemActionTarget {
  const resource = { owner: value.resourceOwner, kind: value.resourceKind, key: value.key }
  return value.branch === 'system'
    ? { kind: 'system', resource }
    : { kind: 'tenant', tenant: adminTenant(), resource }
}

export function requestFor(
  principal: SystemPrincipal,
  value: MatrixRow,
  overrides: Partial<SystemActionRequest> = {},
): SystemActionRequest {
  return {
    principal,
    scope: 'system',
    operation: { owner: value.owner, name: value.name },
    target: targetOf(value),
    arguments: value.fixedArguments ? noArguments() : effectiveArgumentsOf({ fact: 'one' }),
    ...overrides,
  }
}

export function grantOf(
  purposes: readonly string[],
  overrides: Partial<MaintenanceGrant> = {},
): MaintenanceGrant {
  return {
    source: 'deployment-maintenance',
    record: 'grant_1',
    revision: '7',
    purposes,
    revoked: false,
    generation: 'gen_1',
    ...overrides,
  }
}

export function installed(overrides: Partial<SystemActionDependencies> = {}) {
  const principals = issued()
  const scanner = principals.authority.issuer.issueSystem({ component: 'restart-scanner' })
  if ('failure' in scanner) throw new Error('fixture scanner did not issue')
  const grants = scriptedMaintenanceGrants()
  const clock = manualSystemClock()
  const authorization: SystemActionAuthorization = referenceSystemActionAuthorization({
    verifier: principals.authority.verifier,
    grants: grants.source,
    clock: clock.clock,
    ...overrides,
  })
  return { principals, scanner: scanner.ok, grants, clock, authorization }
}

export const verifierAnswering = (
  answer: (value: unknown) => ReturnType<PrincipalVerifier['verify']>,
): PrincipalVerifier => ({ verify: answer })
