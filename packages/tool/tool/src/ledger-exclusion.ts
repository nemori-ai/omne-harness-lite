import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import { isLaterRevision } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import { exclusionKey, type LedgerWrite } from './ledger-store.ts'

const EXCLUDED_TEXT = ' was excluded by a negative answer; resubmit with the same identity'

export function excludedSince(
  snapshot: Snapshot,
  operation: ToolOperationId,
  firstRead: Snapshot['revision'],
): boolean {
  if (snapshot.operations.has(operation)) return false
  const exclusion = snapshot.exclusions.get(operation)
  return exclusion !== undefined && isLaterRevision(exclusion.revision, firstRead)
}

export function excluded(operation: ToolOperationId): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unavailable',
    dependency: 'ledger-store',
    diagnostic: `operation ${operation}${EXCLUDED_TEXT}`,
  })
}

export function isExcludedFailure(failure: ToolFailure): boolean {
  return (
    failure.kind === 'unavailable' &&
    failure.dependency === 'ledger-store' &&
    failure.diagnostic.startsWith('operation ') &&
    failure.diagnostic.endsWith(EXCLUDED_TEXT)
  )
}

export function withExclusionsRemoved(
  writes: readonly LedgerWrite[],
  operations: ReadonlySet<ToolOperationId>,
): readonly LedgerWrite[] {
  return [
    ...writes,
    ...[...operations].map(operation => ({
      kind: 'delete' as const,
      key: exclusionKey(operation),
    })),
  ]
}
