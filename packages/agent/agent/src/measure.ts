// The structured measurement events of the Agent implementation (SPEC「测量事件」, R2-D17 DP1 取 C,
// R2-D49). The member names the boundaries; the factory caller gives the observer and reads its own
// monotonic clock when the observer is called. The call is synchronous at the boundary, so the call
// time is the boundary time. No `Date.now` or `performance.now` is read here, and the injected
// `AgentClock` is not used: it is a UTC reading that answers asynchronously and that tests count.
import type { AgentExecutionId } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AgentRunEndedFailedReceiver, AgentRunFailedReceiver } from './run-failure.ts'

/**
 * One pass of work that Agent does for one execution:
 *
 * - `accept`: U0 to E0, the reliable acceptance that `invoke` waits for;
 * - `run`: one `runExecution` drive, from E1 (or R0) to where it stops, yields at a saved wait or
 *   ends. The wait between two passes is outside every segment.
 *
 * The segment is inclusive: it contains the time that Agent waits for the Journal, the Model and the
 * Tool inside the pass. Whoever collects the events subtracts the external waits it knows.
 */
export type AgentSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'agent'
      phase: 'start'
      /** Pairs this start with its end; unique in the process. */
      span: number
      pass: 'accept' | 'run'
      execution: AgentExecutionId
      /** The tenant of the runtime binding. The factory always knows it. */
      tenant?: TenantId
    }>
  | Readonly<{
      kind: 'segment'
      segment: 'agent'
      phase: 'end'
      span: number
      pass: 'accept' | 'run'
      execution: AgentExecutionId
      tenant?: TenantId
      /** `failure` for an answer that carries a failure and for a thrown error. */
      outcome: 'ok' | 'failure'
    }>

export type AgentMeasureEvent = AgentSegmentEvent

/** Receives each event synchronously. It must not call back into the runtime. */
export type AgentMeasure = (event: AgentMeasureEvent) => void

/** The optional parameters of the factory. They carry no policy and are not configuration. */
export type AgentRuntimeExtras = Readonly<{
  /** The observer of the measurement events. Absent means no event is built. */
  measure?: AgentMeasure
  /**
   * The receiver of the report of a run that stopped on a failure (SPEC「运行失败」). Absent: the
   * slot still becomes `failed`, and nobody is told.
   */
  failed?: AgentRunFailedReceiver
  /**
   * The receiver of the report of a run that ended with a `fail` conclusion (SPEC「以失败终结」).
   * Absent: the run ends the same, and nobody is told.
   */
  endedFailed?: AgentRunEndedFailedReceiver
}>

export type AgentMeasurer = Readonly<{
  segment<T>(
    pass: 'accept' | 'run',
    execution: AgentExecutionId,
    run: () => Promise<T>,
    failed: (answer: T) => boolean,
  ): Promise<T>
}>

/** Counts in the process, so the runtimes that share an observer never reuse a span. */
let spans = 0

/** `tenant` is the tenant of the runtime binding; every event of this measurer names it. */
export function createAgentMeasurer(
  measure: AgentMeasure | undefined,
  tenant?: TenantId,
): AgentMeasurer {
  if (measure === undefined) return { segment: (_pass, _execution, run) => run() }
  const emit = (event: AgentMeasureEvent): void => {
    try {
      measure(event)
    } catch {
      // Measurement observes the runtime and never decides an answer of it.
    }
  }
  return {
    async segment(pass, execution, run, failed) {
      const span = (spans += 1)
      // An absent tenant stays absent: an `undefined` member would still be a key of the event.
      const who = tenant === undefined ? { execution } : { execution, tenant }
      emit({ kind: 'segment', segment: 'agent', phase: 'start', span, pass, ...who })
      let outcome: 'ok' | 'failure' = 'failure'
      try {
        const answer = await run()
        outcome = failed(answer) ? 'failure' : 'ok'
        return answer
      } finally {
        emit({ kind: 'segment', segment: 'agent', phase: 'end', span, pass, ...who, outcome })
      }
    },
  }
}
