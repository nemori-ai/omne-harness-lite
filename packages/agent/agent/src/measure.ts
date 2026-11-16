import type { AgentExecutionId } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  AgentModelRetryingReceiver,
  AgentRunEndedFailedReceiver,
  AgentRunFailedReceiver,
  AgentRunWaitingReceiver,
} from './run-failure.ts'

export type AgentSegmentEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'agent'
      phase: 'start'
      span: number
      pass: 'accept' | 'run'
      execution: AgentExecutionId
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
      outcome: 'ok' | 'failure'
    }>

export type AgentMeasureEvent = AgentSegmentEvent

/** Receives each event synchronously. It must not call back into the runtime. */
export type AgentMeasure = (event: AgentMeasureEvent) => void

export type AgentRuntimeExtras = Readonly<{
  measure?: AgentMeasure
  failed?: AgentRunFailedReceiver
  endedFailed?: AgentRunEndedFailedReceiver
  waiting?: AgentRunWaitingReceiver
  modelRetrying?: AgentModelRetryingReceiver
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

export function createAgentMeasurer(
  measure: AgentMeasure | undefined,
  tenant?: TenantId,
): AgentMeasurer {
  if (measure === undefined) return { segment: (_pass, _execution, run) => run() }
  const emit = (event: AgentMeasureEvent): void => {
    try {
      measure(event)
    } catch {}
  }
  return {
    async segment(pass, execution, run, failed) {
      const span = (spans += 1)
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
