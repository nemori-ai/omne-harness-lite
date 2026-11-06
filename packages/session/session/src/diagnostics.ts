// The named diagnostics of this member (SPEC「实现现状」诊断出口, R2-D327). A coordinator or scheduler
// that stops on a failure records one, so the stop is never silent. The record names the session,
// the Run, the step and the reason; it carries failure kinds and port diagnostics, never content.
import type { RunId, SessionId, WorkSnapshot } from '@omne-harness/session-contract'

export type SessionDiagnostic = Readonly<{
  /** The coordinator or scheduler that stopped (SPEC S1, C2). */
  owner: 'S1' | 'C2'
  /** The step that failed. */
  step: 'read' | 'startRun' | 'replay' | 'invoke' | 'receive' | 'finishRun' | 'freeze'
  tenant: WorkSnapshot['tenant']
  session: SessionId
  /** The Run the step served; null before a Run is known. */
  run: RunId | null
  /**
   * The failure kind that the port answered, or one of this member's own reasons:
   * `retries-exhausted`, `agent-absent`, `clock-refused`, `wait-cancelled`,
   * `advance-withdrawn`, `attempt-replaced`.
   */
  reason: string
  /** The answered failure as JSON text, or a short text of this member. */
  detail: string
}>

/**
 * The observer of the diagnostics. It is called synchronously; a throw changes nothing and leaves
 * no trace. It must not call back into the instance.
 */
export type SessionDiagnose = (diagnostic: SessionDiagnostic) => void
