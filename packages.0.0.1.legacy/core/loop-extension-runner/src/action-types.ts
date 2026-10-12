import type { AvailabilityReport } from '@omne-harness-lite/asset-registry'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { CallId, ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { BeforeActionSubject } from '@omne-harness-lite/loop-extension'
import type { SessionAccess, SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  OfficialActionGate,
  AdmissionInput,
  AdmissionToken,
  AuthorizationContext,
  SessionRunMode,
} from '@omne-harness-lite/tool-admission'
import type { RunnerFailure, RunnerPassResult, RunnerPiece } from './run-pass-types.ts'

export interface RunnerActionRequest {
  readonly position: 'before_action'
  /** Empty only if the actual nonempty model batch has no parsed call. */
  readonly actions: readonly BeforeActionSubject[]
  readonly anchors: readonly string[]
  readonly assistantMessage: string
  readonly manifest: string
  readonly run: RunId
  readonly attempt: AttemptId
  readonly admission: {
    readonly report: AvailabilityReport
    readonly grants: AuthorizationContext
    readonly runMode: SessionRunMode
    readonly parent?: NonNullable<AdmissionInput['parent']>
  }
}

export type { OfficialActionGate } from '@omne-harness-lite/tool-admission'

export type RunnerActionResult =
  | RunnerFailure
  | {
      readonly gate: OfficialActionGate
      readonly chain: readonly RunnerPiece[]
      readonly results: readonly Exclude<RunnerPassResult, RunnerFailure>[]
      /** Absent for the entire batch if any action is asked. */
      readonly admissions?: readonly {
        readonly callId: CallId
        readonly token?: AdmissionToken
        readonly conclusion?: string
      }[]
    }

/** Trusted host facts, read from the actual Run, adoption and complete model reply. */
export interface RunnerActionSource {
  readonly access: SessionAccess
  readonly scope: SessionScope
  readonly run: RunId
  readonly attempt: AttemptId
  readonly assistantMessage: string
  readonly calls: readonly [ToolCallBlock, ...ToolCallBlock[]]
  /** Stable host-owned anchors, in the parsed calls' original order. */
  readonly anchors: readonly string[]
  readonly report: AvailabilityReport
  /** Current policy and opaque grants obtained by the trusted host. */
  readonly grants: AuthorizationContext
  readonly runMode: SessionRunMode
  readonly parent?: NonNullable<AdmissionInput['parent']>
  /** The complete adopted tool table's model names, including entries not in composition. */
  readonly toolNames: readonly string[]
}
