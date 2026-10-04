


import { type Conclusion, type ErrorPolicy, type ExtensionInput, type ExtensionOutput, type LoopExtensionDefinition, type PositionedSubject, type Power } from '@omne-harness-lite/loop-extension'
import { type SystemReminderMessage } from '@omne-harness-lite/messages'

import type { LogEntry, LogEntryInput, ReadResult } from '@omne-harness-lite/session-log'
import { type RunnerExecution } from './conclusion-codec.ts'
import { type RunnerEffect } from './effect.ts'

import type { RunnerLogBinding } from './task-owner-types.ts'



export interface RunnerPass {
  readonly initial: PositionedSubject
  readonly anchor: string
  readonly execution: RunnerExecution
}

export interface RunnerPiece {
  /** The immutable definition read with the same manifest evaluation as the chain. */
  readonly definition: LoopExtensionDefinition
  readonly power: Power
  readonly onError?: ErrorPolicy
  /** Only a trusted system chain source may designate one of the five fixed fallbacks. */
  readonly fallback?: 'modality' | 'retry' | 'admission' | 'loop' | 'offload'
}

export type RunnerFailure =
  | { readonly failure: 'invalidInput' }
  | { readonly failure: 'positionUnknown' }
  | { readonly failure: 'manifestMissing' }
  | { readonly failure: 'replayInconsistent' }
  | { readonly failure: 'unavailable' }
  | { readonly failure: 'attemptSuperseded' }
  | { readonly failure: 'cancelled' }

export type RunnerPassResult =
  { readonly conclusions: readonly Conclusion[]; readonly effect: RunnerEffect } | RunnerFailure

export interface RunnerAskAssociation {
  readonly binding: RunnerLogBinding
  readonly pass: RunnerPass
  readonly piece: string
  readonly askEntry: LogEntry
  readonly askHistory: readonly Conclusion[]
  readonly earlier: readonly Conclusion[]
  readonly subject: PositionedSubject
}

export interface RunnerReplayBinding {
  readonly association: RunnerAskAssociation
  readonly cardId: string
  readonly batchId: string
  readonly answerId: string
  /** The waiting owner latches any deviation, even when the contributor catches it. */
  readonly control: () => 'valid' | 'replayInconsistent' | 'unavailable'
  readonly release: () => void
}

export type RunnerAskState =
  | {
      readonly kind: 'pending'
      readonly association: RunnerAskAssociation
      readonly card?: { readonly cardId: string; readonly batchId: string }
    }
  | { readonly kind: 'ready'; readonly binding: RunnerReplayBinding }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'unavailable' }

export type RunnerInvocationMode =
  { readonly kind: 'fresh' } | { readonly kind: 'replay'; readonly binding: RunnerReplayBinding }

export interface RunnerHandles {
  readonly log: ExtensionInput['log']
  readonly environment: ExtensionInput['environment']
  readonly release: () => void
}

export type RunnerInvocationResult =
  | { readonly kind: 'output'; readonly value: unknown }
  | {
      readonly kind: 'errored'
      readonly error: string
      readonly classification?: 'ordinary' | 'nonzero_exit' | 'timeout' | 'bad_output'
    }
  | { readonly kind: 'notStartedUnavailable' }
  | { readonly kind: 'replayInconsistent' }
  | { readonly kind: 'controlUnavailable' }

export type RunnerCapabilityResult =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'rejected'; readonly reason: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalidInput' }

export type RunnerRecordResult =
  | { readonly kind: 'confirmed'; readonly entry: LogEntry }
  | { readonly kind: 'alreadyRecorded'; readonly entry: LogEntry }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'attemptSuperseded' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'invalidInput' }

export type RunnerReminderRead =
  | { readonly kind: 'absent' }
  | { readonly kind: 'same' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'unavailable' }

export type RunnerReminderAppend =
  | { readonly kind: 'confirmed' }
  | { readonly kind: 'alreadyRecorded' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'attemptSuperseded' }
  | { readonly kind: 'unavailable' }

export interface RunnerPorts {
  readonly binding: RunnerLogBinding
  /** Reads all runner entries for this pass from one log generation. */
  readonly readConclusions: (pass: RunnerPass) => Promise<ReadResult>
  readonly readAskState: (
    association: RunnerAskAssociation,
    signal: AbortSignal,
  ) => Promise<RunnerAskState>
  readonly presence: (piece: RunnerPiece) => Promise<'present' | 'absent' | 'unavailable'>
  readonly openHandles: (
    piece: RunnerPiece,
    mode: RunnerInvocationMode,
  ) => Promise<RunnerHandles | { readonly unavailable: true }>
  /** The execution owner controls waits and reports deviations outside contributor catch blocks. */
  readonly invoke: (
    piece: RunnerPiece,
    input: ExtensionInput,
    signal: AbortSignal,
    mode: RunnerInvocationMode,
  ) => Promise<RunnerInvocationResult>
  readonly verifyFailure: (
    subject: PositionedSubject,
    binding: RunnerLogBinding,
    execution: RunnerExecution,
  ) => Promise<
    | {
        readonly kind: 'verified'
        readonly subject: PositionedSubject
        readonly release: () => void
      }
    | { readonly kind: 'invalidInput' }
    | { readonly kind: 'unavailable' }
  >
  readonly judgeCapabilities: (
    input: ExtensionInput,
    output: ExtensionOutput,
  ) => Promise<RunnerCapabilityResult>
  readonly record: (entry: LogEntryInput, execution: RunnerExecution) => Promise<RunnerRecordResult>
  readonly now: () => string | { readonly unavailable: true }
  readonly mintReminder: () => string | { readonly unavailable: true }
  readonly isActive: () => boolean
  readonly fallbackNeedsProjection: (
    subject: PositionedSubject,
  ) => Promise<boolean | { readonly unavailable: true }>
  readonly reminders: {
    readonly inspect: (message: SystemReminderMessage) => Promise<RunnerReminderRead>
    readonly nestedChain: (
      message: SystemReminderMessage,
    ) => Promise<readonly RunnerPiece[] | { readonly unavailable: true }>
    readonly append: (
      message: SystemReminderMessage,
      execution: RunnerExecution,
    ) => Promise<RunnerReminderAppend>
  }
}
