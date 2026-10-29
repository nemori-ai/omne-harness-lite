import type {
  GuardCommand,
  SessionCommand,
  SessionFailure,
  SessionHistoryIndex,
  SessionHistoryReads,
  SessionInputScope,
  WorkSnapshot,
  HistoryEntry,
} from '@omne-harness/session-contract'

/** Verifies a currently issued credential against the complete original initialization input. */
export interface InitializationSource {
  verify(
    command: Extract<SessionCommand, { kind: 'create' | 'completeInitialization' }>,
    guards: readonly GuardCommand[],
  ): SessionFailure | null
}
export interface HistorySource {
  read(
    snapshot: WorkSnapshot,
    entries: readonly HistoryEntry[],
    scope: SessionInputScope,
    extra?: readonly string[],
    through?: ReadonlyMap<string, string>,
  ): Readonly<{ index: SessionHistoryIndex; reads: SessionHistoryReads }>
}
