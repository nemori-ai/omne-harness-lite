import { operationEquals, type AdmissionOperation } from './operation.ts'

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

export function systemActionRowOf(operation: AdmissionOperation): SystemActionRow | null {
  return SYSTEM_ACTION_MATRIX.find(entry => operationEquals(entry.operation, operation)) ?? null
}
