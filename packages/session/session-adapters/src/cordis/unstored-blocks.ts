import type { SessionId } from '@omne-harness/session-contract'
import type { JournalCommitResult } from '../journal-commit.ts'
import type { JournalPublicationReport } from './agent-journal.ts'

type Unstored = Exclude<JournalCommitResult, { kind: 'committed' }>
type Stored = Readonly<{ execution: string; storageOperation: string; bytes: number }>

export const unstoredText = (outcome: Exclude<Unstored, { kind: 'refused' }>): string =>
  outcome.kind === 'rolled-back' ? 'rolled back' : outcome.diagnostic

export function reportUnstored(
  report: ((report: JournalPublicationReport) => void) | undefined,
  book: Readonly<{ tenantText: string; session: SessionId }>,
  { execution, storageOperation, bytes }: Stored,
  outcome: Unstored,
): void {
  try {
    report?.({
      tenant: book.tenantText,
      session: book.session,
      execution,
      operation: null,
      storageOperation,
      method: 'blobs',
      recordBytes: bytes,
      bytes,
      batchBytes: 0,
      blobBytes: bytes,
      facts: 0,
      outcome:
        outcome.kind === 'rolled-back'
          ? 'rolled-back'
          : outcome.kind === 'unknown'
            ? 'commit-unknown'
            : 'unavailable',
      diagnostic: outcome.kind === 'rolled-back' ? null : outcome.diagnostic,
    })
  } catch {}
}
