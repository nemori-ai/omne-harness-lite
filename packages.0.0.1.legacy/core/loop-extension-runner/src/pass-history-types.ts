import { type JsonNumber } from '@omne-harness-lite/content-blocks'

import { type PositionedSubject } from '@omne-harness-lite/loop-extension'

import type { LogEntry } from '@omne-harness-lite/session-log'

import type { RunnerFailure, RunnerPiece } from './run-pass-types.ts'
import type { RunnerLogBinding } from './task-owner-types.ts'

export type RunnerReplayFailure = Extract<
  RunnerFailure,
  {
    readonly failure:
      'invalidInput' | 'positionUnknown' | 'manifestMissing' | 'replayInconsistent' | 'unavailable'
  }
>
export interface RunnerHistoryScope {
  readonly initial: PositionedSubject
  readonly anchor: string
  readonly run?: string
}
export interface ReadPassConclusionsInput extends RunnerHistoryScope {
  readonly binding: RunnerLogBinding
  readonly chain: readonly RunnerPiece[]
  readonly entries: readonly LogEntry[]
  readonly tail: JsonNumber
}
