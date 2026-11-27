import { describe, expect, it } from 'vitest'
import { sessionId } from '@omne-harness/session-contract/testing'
import type { JournalPublicationReport } from '../src/cordis/agent-journal.ts'
import { reportUnstored, unstoredText } from '../src/cordis/unstored-blocks.ts'
import type { JournalCommitResult } from '../src/journal-commit.ts'

type Unstored = Exclude<JournalCommitResult, { kind: 'committed' }>

const book = { tenantText: 'tenant-a', session: sessionId('session-1') }
const stored = { execution: 'execution-1', storageOperation: 'blobs-1', bytes: 300 }

function reported(outcome: Unstored): JournalPublicationReport[] {
  const reports: JournalPublicationReport[] = []
  reportUnstored(report => reports.push(report), book, stored, outcome)
  return reports
}

describe('content blocks that were not stored', () => {
  it.each<readonly [Unstored, JournalPublicationReport['outcome'], string | null]>([
    [
      { kind: 'refused', reason: 'command_limit', said: 'limit', diagnostic: 'refused: limit' },
      'unavailable',
      'refused: limit',
    ],
    [{ kind: 'unavailable', diagnostic: 'queue_full' }, 'unavailable', 'queue_full'],
    [{ kind: 'unknown', diagnostic: 'no reply', attempt: 1 }, 'commit-unknown', 'no reply'],
    [{ kind: 'rolled-back', receipt: {} as never }, 'rolled-back', null],
  ])(
    'are reported once with their bytes and the answer of the storage: %o',
    (outcome, as, said) => {
      expect(reported(outcome)).toEqual([
        {
          tenant: 'tenant-a',
          session: book.session,
          execution: 'execution-1',
          operation: null,
          storageOperation: 'blobs-1',
          method: 'blobs',
          recordBytes: 300,
          bytes: 300,
          batchBytes: 0,
          blobBytes: 300,
          facts: 0,
          outcome: as,
          diagnostic: said,
        },
      ])
    },
  )

  it('a receiver that throws, or none at all, changes nothing', () => {
    const outcome: Unstored = { kind: 'unavailable', diagnostic: 'queue_full' }
    expect(() =>
      reportUnstored(
        () => {
          throw new Error('the log is gone')
        },
        book,
        stored,
        outcome,
      ),
    ).not.toThrow()
    expect(() => reportUnstored(undefined, book, stored, outcome)).not.toThrow()
  })

  it('says why in the text of the failure: the diagnostic, or that the commit rolled back', () => {
    expect(unstoredText({ kind: 'unavailable', diagnostic: 'queue_full' })).toBe('queue_full')
    expect(unstoredText({ kind: 'rolled-back', receipt: {} as never })).toBe('rolled back')
  })
})
