import type { LogPrefixView, SystemReminderMessage } from '@omne-harness-lite/messages'

import { type PositionedSubject } from '@omne-harness-lite/loop-extension'
import { type LogEntry, type LogEntryInput } from '@omne-harness-lite/session-log'

export interface RunnerLogBinding {
  readonly session: string
  readonly tenant: LogEntryInput['tenant']
  /** Identifies the physical log owner whose work this task owner retains. */
  readonly logGeneration: string
}

export interface CandidateBase {
  readonly binding: RunnerLogBinding
  readonly entry: LogEntryInput
}

export interface RunnerConclusionCandidate extends CandidateBase {
  readonly kind?: 'conclusion'
  readonly subject: PositionedSubject
}

export interface RunnerReminderCandidate extends CandidateBase {
  readonly kind: 'reminder'
  readonly message: SystemReminderMessage
  readonly messagePrefix: LogPrefixView
}

export type RunnerAppendCandidate = RunnerConclusionCandidate | RunnerReminderCandidate

export type RunnerRecoveryResult =
  | { readonly kind: 'same'; readonly entry: LogEntry }
  | { readonly kind: 'winner'; readonly entry: LogEntry }
  | { readonly kind: 'absent' }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'unavailable' }

export interface RunnerRecoveredLog {
  /** This closure is supplied only after the old physical log has stopped and recovery admitted. */
  readonly binding: RunnerLogBinding
  readonly readByKey: (key: string) => Promise<readonly LogEntry[] | { readonly unavailable: true }>
}

export interface RunnerTaskOwner {
  readonly start: <T>(task: {
    readonly kind: 'read' | 'append'
    readonly candidate?: RunnerAppendCandidate
    readonly execute: () => Promise<T>
    readonly unknown?: (result: T) => boolean
  }) => { readonly completion: Promise<T> } | { readonly unavailable: true }
  readonly hasUnknown: (binding: RunnerLogBinding, passKey?: string) => boolean
  readonly closeAdmission: () => void
  readonly drain: () => Promise<void>
  readonly reconcileStoppedLog: (
    recovered: RunnerRecoveredLog,
  ) => Promise<readonly RunnerRecoveryResult[] | { readonly unavailable: true }>
}
