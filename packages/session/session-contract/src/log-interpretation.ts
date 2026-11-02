// The two pure helpers of the same-log event channel commit (docs/same-log-pure.md「事件通道的解释
// 提交」): the recall digest of one observation and the execution progress that a snapshot holds.
// The checks of the observation are `projectSessionLog` and `reduce`; every provider of
// `commitLog` calls those and these two helpers, and none writes its own copy.
import { tenantCodec } from '@omne-harness/legal-identity'
import type { SessionLogCommitObservation } from './interpretation-values.ts'
import type { RunId } from './identity.ts'
import type { WorkSnapshot } from './values.ts'
import { digestOf } from './operations.ts'

/**
 * The stable digest of one observation: the same operation with the same digest recalls, with
 * another digest it is a conflict. It binds every field of the observation except the operation
 * identity, which the record is keyed by. The `log` label keeps it apart from the digest of every
 * command and of the entries channel. Throws a TypeError for a tenant that legal-identity did not mint.
 */
export function digestSessionLog(observation: SessionLogCommitObservation): string {
  const { operation: _operation, tenant, ...rest } = observation
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    throw new TypeError('the tenant of the observation was not minted by legal-identity')
  return digestOf({ kind: 'log', input: { ...rest, tenant: text.value } })
}

/**
 * The saved event progress of one execution, read from the snapshot alone: the sequence that
 * the interpretation reached. `null` when the snapshot holds no such execution of that Run.
 */
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
