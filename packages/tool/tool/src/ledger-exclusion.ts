// The exclusion discipline of an operation-keyed command (P01, SPEC 14): a negative answer about
// an operation excludes every in-flight commit of it. A command remembers the domain revision of
// its first read; a newer exclusion fence of its operation stops it with a retryable answer. The
// ledger gives that answer and the driver recognises it here, so the two cannot drift apart.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ToolFailure, ToolOperationId } from '@omne-harness/tool-contract'
import { isLaterRevision } from './evidence.ts'
import type { Snapshot } from './ledger-decider.ts'
import { exclusionKey, type LedgerWrite } from './ledger-store.ts'

/** What follows the operation in the diagnostic of an excluded command. */
const EXCLUDED_TEXT = ' was excluded by a negative answer; resubmit with the same identity'

/**
 * Whether a negative answer about `operation` was given after a command of that operation first
 * read the domain: the snapshot holds an exclusion fence of the operation that is newer than the
 * command's first read. A fence the command saw on its first read is not newer, so a fresh
 * submission after the negative proceeds. A committed operation is never excluded: recall wins.
 */
export function excludedSince<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  operation: ToolOperationId,
  firstRead: Snapshot<B>['revision'],
): boolean {
  if (snapshot.operations.has(operation)) return false
  const exclusion = snapshot.exclusions.get(operation)
  return exclusion !== undefined && isLaterRevision(exclusion.revision, firstRead)
}

/** The retryable answer of a command that a negative answer excluded (P01). */
export function excluded(operation: ToolOperationId): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unavailable',
    dependency: 'ledger-store',
    diagnostic: `operation ${operation}${EXCLUDED_TEXT}`,
  })
}

/**
 * Whether a failure is the answer of an excluded command. The same identity may be submitted
 * again: the exclusion fence is older than the first read of the new submission.
 */
export function isExcludedFailure(failure: ToolFailure): boolean {
  return (
    failure.kind === 'unavailable' &&
    failure.dependency === 'ledger-store' &&
    failure.diagnostic.startsWith('operation ') &&
    failure.diagnostic.endsWith(EXCLUDED_TEXT)
  )
}

/** The writes of an operation's commit also remove the exclusion fence of that operation. */
export function withExclusionRemoved<B extends ContentBlock>(
  writes: readonly LedgerWrite<B>[],
  operation: ToolOperationId | null,
): readonly LedgerWrite<B>[] {
  return operation === null ? writes : [...writes, { kind: 'delete', key: exclusionKey(operation) }]
}
