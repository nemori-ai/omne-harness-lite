import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionLogCommitObservation } from './interpretation-values.ts'
import type { RunId } from './identity.ts'
import type { WorkSnapshot } from './values.ts'
import { digestOf } from './operations.ts'

export function digestSessionLog(observation: SessionLogCommitObservation): string {
  const { operation: _operation, tenant, ...rest } = observation
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    throw new TypeError('the tenant of the observation was not minted by legal-identity')
  return digestOf({ kind: 'log', input: { ...rest, tenant: text.value } })
}

export function executionReadThrough(
  snapshot: WorkSnapshot,
  run: RunId,
  execution: string,
): string | null {
  const current =
    snapshot.run.kind === 'active' && snapshot.run.run === run ? snapshot.run.execution : undefined
  const reference =
    current ?? snapshot.executions?.find(item => item.run === run)?.execution ?? undefined
  return reference !== undefined && reference.execution === execution ? reference.readThrough : null
}
