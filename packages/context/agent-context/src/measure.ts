// The structured measurement events of agent-context (SPEC「测量事件」, R2-D17 DP1 取 C, R2-D49).
// The Context segment is one call of the request preparation or the readable-context read of
// Agent, from the call to its answer. The factory caller gives the observer and reads its own
// monotonic clock when the observer is called; the call is synchronous at the boundary, so the call
// time is the boundary time. This member keeps no clock of its own and reads none.
import type { AgentExecutionId } from '@omne-harness/agent-contract'

/**
 * One call that Agent makes into Context: `prepare`, `derive` and `resume` of the request
 * preparation (AG-12) and `read` of the readable context (AG-13). The segment is inclusive: it
 * contains the time that this member waits for Request Context, Runtime Context and the Model
 * preparation inside the call.
 */
export type ContextSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'context'
      phase: 'start'
      /** Pairs this start with its end; unique in the process. */
      span: number
      operation: 'prepare' | 'derive' | 'resume' | 'read'
      execution: AgentExecutionId
    }>
  | Readonly<{
      kind: 'segment'
      segment: 'context'
      phase: 'end'
      span: number
      operation: 'prepare' | 'derive' | 'resume' | 'read'
      execution: AgentExecutionId
      /** `failure` for an answer that carries a failure and for a thrown error. */
      outcome: 'ok' | 'failure'
    }>

export type ContextMeasureEvent = ContextSegmentEvent

/** Receives each event synchronously. It must not call back into this member. */
export type ContextMeasure = (event: ContextMeasureEvent) => void

type Operation = ContextSegmentEvent['operation']

/** Counts in the process, so the two factories that share an observer never reuse a span. */
let spans = 0

export type ContextMeasurer = Readonly<{
  segment<T>(
    operation: Operation,
    execution: AgentExecutionId,
    run: () => Promise<T>,
    failed: (answer: T) => boolean,
  ): Promise<T>
}>

/** The measurer of one observer. */
export function createContextMeasurer(measure: ContextMeasure | undefined): ContextMeasurer {
  if (measure === undefined) return { segment: (_operation, _execution, run) => run() }
  const emit = (event: ContextMeasureEvent): void => {
    try {
      measure(event)
    } catch {
      // Measurement observes this member and never decides an answer of it.
    }
  }
  return {
    async segment(operation, execution, run, failed) {
      const span = (spans += 1)
      emit({ kind: 'segment', segment: 'context', phase: 'start', span, operation, execution })
      let outcome: 'ok' | 'failure' = 'failure'
      try {
        const answer = await run()
        outcome = failed(answer) ? 'failure' : 'ok'
        return answer
      } finally {
        emit({
          kind: 'segment',
          segment: 'context',
          phase: 'end',
          span,
          operation,
          execution,
          outcome,
        })
      }
    },
  }
}
