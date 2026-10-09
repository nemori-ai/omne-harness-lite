import type { AttachmentRef } from '@omne-harness-lite/content-blocks'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { ToolOriginalIssueIdentity } from './original-issue.ts'
import type { ToolJournalHistory } from './journal-history.ts'
import type { StoredToolResult } from './tool-results.ts'

/** Exact immutable original terminal, never a mutable latest-result pointer. */
export type ToolTerminalRecord = NonNullable<ToolJournalHistory['terminal']>

/** Reference ownership survives the original job and observer lifetime. */
export interface ToolResultCustodyEvidence {
  readonly original: ToolOriginalIssueIdentity
  readonly terminal: ToolTerminalRecord
  /** Required for an author return; absent only when the terminal has no author result. */
  readonly stored?: StoredToolResult
  readonly references: readonly AttachmentRef[]
}

/** Trusted source over the actual Tool journal and immutable result storage. */
export interface ToolResultCustodySource {
  readonly verifyIn: (
    unit: StorageUnit,
    original: ToolOriginalIssueIdentity,
    terminal: ToolTerminalRecord,
  ) => Promise<
    | { readonly verified: ToolResultCustodyEvidence }
    | { readonly failure: 'invalidSource' | 'unavailable' }
  >
}
