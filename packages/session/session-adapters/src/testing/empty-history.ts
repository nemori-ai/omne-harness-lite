import type {
  SessionHistoryIndex,
  SessionHistoryReads,
  WorkSnapshot,
  SessionInputScope,
  DurableEvidence,
} from '@omne-harness/session-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { digestOf } from './session-values.ts'

/** The loader has no Agent records: only an actually empty admission directory can be supplied. */
export function emptyHistory(
  snapshot: WorkSnapshot,
  scope: SessionInputScope,
): Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }> {
  const tenant = tenantCodec.encode(snapshot.tenant)
  if (!tenant.ok) throw new TypeError('invalid tenant')
  const namespace = JSON.stringify([tenant.value, snapshot.session])
  const evidence = (record: string): DurableEvidence => ({
    owner: 'session-memory-journal',
    record: `${namespace}/${record}`,
    revision: '0',
    digest: digestOf([namespace, record]),
  })
  const root = {
    tenant: snapshot.tenant,
    session: snapshot.session,
    position: '0',
    source: evidence('unpublished-history'),
  }
  const inputs = scope.inputs.map(input => ({
    input,
    directory: `${namespace}/${input}`,
    version: '0',
    count: '0',
    members: [],
    source: evidence(input),
  }))
  return {
    index: { root, inputs, executions: [], attempts: [], batches: [], taken: [] },
    reads: { root, scope, admissions: [], prefixes: [], attempts: [], taken: [] },
  }
}
