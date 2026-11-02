// The maintenance grant table (DP-4 §4.1, DP4-C13): a release constant that the `authorization`
// row imports directly and hands to `referenceSystemActionAuthorization`. Not a service, not
// configuration, not an entry object. The read port is a pure lookup by the component text of a
// principal that the verifier already trusted; the text locates the record, it is not a credential.
// Records are deployment-level: one record covers every tenant partition of this deployment.
import type { MaintenanceGrant, MaintenanceGrantSource } from '@omne-harness/authorization'
import type { SystemPurpose } from './cells.ts'

/** The revision and generation of the table. Bump when a record changes. */
export const MAINTENANCE_GRANT_REVISION = '1'

/** The component name of the agent host maintenance principal (DP-1 table 3-3). */
export const AGENT_HOST_COMPONENT = 'agent-host'
/** The component name of the tool residency principal (AA:273, DP-1 table 3-4). */
export const TOOL_RESIDENCY_COMPONENT = 'toolResidencyPrincipal'

/** The components that hold a record. A component outside this union has no record. */
export type GrantHolder = typeof AGENT_HOST_COMPONENT | typeof TOOL_RESIDENCY_COMPONENT

/** One record with the purposes typed against the policy; `MaintenanceGrant` widens them to text. */
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
  [TOOL_RESIDENCY_COMPONENT]: record(TOOL_RESIDENCY_COMPONENT, ['resident-references']),
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

/**
 * The read port over the table. It answers `found` for a component with a record and `none`
 * otherwise. It never answers `unavailable`: the table is in memory and complete. The reference
 * authorization calls it only after the verifier trusted the principal and the matrix matched.
 */
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
