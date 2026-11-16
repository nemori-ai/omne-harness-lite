import type { AgentExecutionId } from '@omne-harness/agent-contract'

export type ContextSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'context'
      phase: 'start'
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
      outcome: 'ok' | 'failure'
    }>

export type ContextMeasureEvent = ContextSegmentEvent

export type ContextMeasure = (event: ContextMeasureEvent) => void

type Operation = ContextSegmentEvent['operation']

let spans = 0

export type ContextMeasurer = Readonly<{
  segment<T>(
    operation: Operation,
    execution: AgentExecutionId,
    run: () => Promise<T>,
    failed: (answer: T) => boolean,
  ): Promise<T>
}>

export function createContextMeasurer(measure: ContextMeasure | undefined): ContextMeasurer {
  if (measure === undefined) return { segment: (_operation, _execution, run) => run() }
  const emit = (event: ContextMeasureEvent): void => {
    try {
      measure(event)
    } catch {}
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
