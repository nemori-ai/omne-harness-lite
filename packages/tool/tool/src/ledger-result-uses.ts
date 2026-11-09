import type { ToolInstant } from '@omne-harness/tool-contract/provider'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure } from '@omne-harness/tool-contract'
import { invalid } from './boundary.ts'
import { settleBodyEntries } from './ledger-body-entries.ts'
import type { Snapshot } from './ledger-decider.ts'
import type { LedgerWrite, ResultRecord } from './ledger-store.ts'

/**
 * The body part of model `Settle`: the referenced body is linked and scheduled, the other bodies
 * of the call are orphaned at `orphanDue` (null when the call never had a writer, as at an
 * admission-time settlement).
 */
export function settleResultBodies(
  snapshot: Snapshot,
  result: ResultRecord,
  orphanDue: ToolInstant | null,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const original = result.value.original
  const linked =
    original.kind === 'offloaded'
      ? { bodyId: original.bodyId, result: result.result, expiresAt: original.retention.expiresAt }
      : null
  if (linked === null && orphanDue === null) return succeed([])
  if (orphanDue === null)
    return invalid('original.source', 'body-settlement-requires-a-settlement-instant')
  return settleBodyEntries(snapshot, linked, orphanDue)
}
