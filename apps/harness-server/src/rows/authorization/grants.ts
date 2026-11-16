import type { MaintenanceGrant, MaintenanceGrantSource } from '@omne-harness/authorization'
import type { SystemPurpose } from './cells.ts'

export const MAINTENANCE_GRANT_REVISION = '6'

export const AGENT_HOST_COMPONENT = 'agent-host'
export const TOOL_RESIDENCY_COMPONENT = 'toolResidencyPrincipal'
export const TENANT_DOMAIN_SCANNER_COMPONENT = 'tenant-domain-scanner'
export const SESSION_MAINTAINER_COMPONENT = 'sessionPrincipals.maintainer'

export type GrantHolder =
  | typeof AGENT_HOST_COMPONENT
  | typeof TOOL_RESIDENCY_COMPONENT
  | typeof TENANT_DOMAIN_SCANNER_COMPONENT
  | typeof SESSION_MAINTAINER_COMPONENT

export type ReleaseGrant = MaintenanceGrant & Readonly<{ purposes: readonly SystemPurpose[] }>

function record(component: GrantHolder, purposes: readonly SystemPurpose[]): ReleaseGrant {
  return Object.freeze({
    source: 'harness-server/release',
    record: `maintenance-grant/${component}`,
    revision: MAINTENANCE_GRANT_REVISION,
    purposes: Object.freeze([...purposes]),
    revoked: false,
    generation: MAINTENANCE_GRANT_REVISION,
  })
}

export const MAINTENANCE_GRANTS: Readonly<Record<GrantHolder, ReleaseGrant>> = Object.freeze({
  [TENANT_DOMAIN_SCANNER_COMPONENT]: record(TENANT_DOMAIN_SCANNER_COMPONENT, ['enumerate-tenants']),
  [TOOL_RESIDENCY_COMPONENT]: record(TOOL_RESIDENCY_COMPONENT, ['resident-references']),
  [SESSION_MAINTAINER_COMPONENT]: record(SESSION_MAINTAINER_COMPONENT, ['pending-sessions']),
  [AGENT_HOST_COMPONENT]: record(AGENT_HOST_COMPONENT, [
    'agent-instance-publish',
    'agent-instance-quiesce',
    'agent-instance-withdraw',
  ]),
})

function isGrantHolder(
  table: Readonly<Record<GrantHolder, ReleaseGrant>>,
  component: string,
): component is GrantHolder {
  return Object.hasOwn(table, component)
}

export function releaseMaintenanceGrants(
  table: Readonly<Record<GrantHolder, ReleaseGrant>> = MAINTENANCE_GRANTS,
): MaintenanceGrantSource {
  const source: MaintenanceGrantSource = {
    read: input => {
      const { component } = input.principal
      return Promise.resolve(
        isGrantHolder(table, component)
          ? Object.freeze({ kind: 'found', grant: table[component] })
          : Object.freeze({ kind: 'none' }),
      )
    },
  }
  return Object.freeze(source)
}
