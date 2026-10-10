import type { JsonNumber, LogEntry, CheckedPrefix } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { ToolActionFacts } from '@omne-harness-lite/tool-admission'
import type {
  ExecutionRef,
  ExecutionOrigin,
  ToolJournalHistory,
  ToolJournalPayload,
} from '@omne-harness-lite/tool-execution-runtime'

/** The entries can be an indexed Tool history, not a complete Session prefix. */
export interface ToolRecordSnapshot {
  readonly scope: SessionScope
  readonly ownerGeneration: string
  readonly tail: JsonNumber
  readonly entries: readonly LogEntry[]
}

export interface RuntimeJournalView {
  readonly kind: 'view'
  readonly prefix: ToolRecordSnapshot
  readonly executions: ReadonlyMap<string, ToolJournalHistory>
  readonly facts?: ToolActionFacts
}
export type RuntimeJournalFailure = {
  readonly kind: 'rejected'
  readonly reason: 'invalidInput' | 'unavailable' | 'conflict' | 'tailChanged'
}

export interface RuntimeJournal {
  readonly generation: string
  readonly isCurrent: () => boolean
  readonly read: (
    scope: SessionScope,
    call: string,
  ) => Promise<RuntimeJournalView | RuntimeJournalFailure>
  readonly commit: (input: {
    readonly ref: ExecutionRef
    readonly origin: ExecutionOrigin
    readonly expected: Pick<CheckedPrefix, 'ownerGeneration' | 'tail'>
    readonly values: readonly ToolJournalPayload[]
  }) => Promise<RuntimeJournalView | RuntimeJournalFailure>
  readonly close: () => Promise<void>
}
