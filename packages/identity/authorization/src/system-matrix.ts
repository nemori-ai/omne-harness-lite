// The system purpose matrix (SPEC AU-12): the only system actions that can be allowed, each with
// the owner, kind and branch of the target it is bound to, and the way its arguments are bound.
// A grant record names rows by `purpose`; a purpose is never read as a wildcard.
import { operationEquals, type AdmissionOperation } from './operation.ts'

/**
 * One row. `target` is the branch of the target: `system` for a deployment-wide resource, `tenant`
 * for a resource in the partition of one tenant. `arguments` is `none` when the request must carry
 * `noArguments()`, and `request` when the request carries the digest of the fixed representation
 * that the action will run with; authorization records that digest and does not compare it.
 */
export type SystemActionRow = Readonly<{
  purpose: string
  operation: AdmissionOperation
  target: 'system' | 'tenant'
  resource: Readonly<{ owner: string; kind: string }>
  arguments: 'none' | 'request'
}>

function row(
  purpose: string,
  operation: AdmissionOperation,
  target: SystemActionRow['target'],
  resource: SystemActionRow['resource'],
  args: SystemActionRow['arguments'],
): SystemActionRow {
  return Object.freeze({
    purpose,
    operation: Object.freeze({ ...operation }),
    target,
    resource: Object.freeze({ ...resource }),
    arguments: args,
  })
}

/**
 * The ten rows. Another system action needs a new row, with its existing duty and bound obligation.
 * The three agent instance rows bind the agent host maintenance principal to its duty to publish an
 * acquired instance and to quiesce and withdraw it on retirement (XC-AGINST r2 §3.3 step 4, §3.4).
 */
export const SYSTEM_ACTION_MATRIX: readonly SystemActionRow[] = Object.freeze([
  row(
    'resident-references',
    { owner: 'session', name: 'references' },
    'system',
    { owner: 'session', kind: 'resident-references' },
    'none',
  ),
  row(
    'released-scopes',
    { owner: 'session', name: 'releasedScopes' },
    'system',
    { owner: 'session', kind: 'released-scopes' },
    'none',
  ),
  row(
    'enumerate-tenants',
    { owner: 'tenant-domains', name: 'enumerate' },
    'system',
    { owner: 'tenant-domains', kind: 'registered-tenants' },
    'none',
  ),
  row(
    'pending-sessions',
    { owner: 'session', name: 'pending' },
    'tenant',
    { owner: 'session', kind: 'tenant' },
    'none',
  ),
  row(
    'scope-release-receive',
    { owner: 'session', name: 'receive' },
    'tenant',
    { owner: 'session', kind: 'session' },
    'request',
  ),
  row(
    'scope-release-load',
    { owner: 'session', name: 'loadScopeRelease' },
    'tenant',
    { owner: 'session', kind: 'session' },
    'none',
  ),
  row(
    'scope-release-query',
    { owner: 'session', name: 'queryScopeReleaseOperation' },
    'tenant',
    { owner: 'session', kind: 'session' },
    'request',
  ),
  row(
    'agent-instance-publish',
    { owner: 'agent', name: 'publish' },
    'tenant',
    { owner: 'agent', kind: 'instance' },
    'none',
  ),
  row(
    'agent-instance-quiesce',
    { owner: 'agent', name: 'quiesce' },
    'tenant',
    { owner: 'agent', kind: 'instance' },
    'none',
  ),
  row(
    'agent-instance-withdraw',
    { owner: 'agent', name: 'withdraw' },
    'tenant',
    { owner: 'agent', kind: 'instance' },
    'none',
  ),
])

/** The row of an operation, or null when the operation is outside the matrix. */
export function systemActionRowOf(operation: AdmissionOperation): SystemActionRow | null {
  return SYSTEM_ACTION_MATRIX.find(entry => operationEquals(entry.operation, operation)) ?? null
}
