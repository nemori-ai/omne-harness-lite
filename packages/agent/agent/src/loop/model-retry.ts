import type {
  AgentExecutionId,
  AgentInstant,
  Failure,
  ModelRetryState,
  StepId,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { decideRetry, type RetryPolicy } from '@omne-harness/retry'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { AgentConfiguration, AgentRuntimeBinding } from '../construction.ts'
import type { AgentModelRetryingReceiver } from '../run-failure.ts'
import type { LoopPorts } from './coordinator.ts'
import type { ModelResult } from './model-result.ts'

export type ModelRetryEntry = Readonly<{
  modelRetry?: Readonly<{ policy: RetryPolicy; random: () => number }>
  modelRetrying?(
    step: StepId,
    retry: Readonly<{ attempt: number; fault: M.ModelFault; notBefore: AgentInstant }>,
  ): void
}>

export async function retryModelCall<P>(
  entry: ModelRetryEntry,
  of: StepId,
  result: Extract<ModelResult, { kind: 'unusable' }>,
  savedRetry: () => ModelRetryState | null,
  clock: LoopPorts<P>['clock'],
): Promise<Outcome<ModelRetryState | null, Failure>> {
  const terminal = result.settlement.termination
  const retry = entry.modelRetry
  if (retry === undefined || result.nature !== 'transient' || terminal.kind !== 'failed')
    return succeed(null)
  const instant = await clock.now()
  if ('failure' in instant) return instant
  const saved = savedRetry()
  const failures = (saved?.failures ?? 0) + 1
  const since = saved?.since ?? instant.ok
  const elapsedMs = Math.max(0, Date.parse(instant.ok) - Date.parse(since))
  const decision = decideRetry(retry.policy, { failures, elapsedMs }, retry.random)
  if (decision.kind === 'exhausted') return succeed(null)
  const notBefore = new Date(Date.parse(instant.ok) + decision.delayMs).toISOString()
  entry.modelRetrying?.(of, { attempt: decision.attempt, fault: terminal.fault, notBefore })
  return succeed({ failures, since, notBefore })
}

export function modelRetryEntry(
  entry: Readonly<{
    binding: AgentRuntimeBinding
    configuration: Pick<AgentConfiguration, 'modelRetry'>
    modelRetrying: AgentModelRetryingReceiver | undefined
  }>,
  random: () => number,
  execution: AgentExecutionId,
): ModelRetryEntry {
  return {
    modelRetry: { policy: entry.configuration.modelRetry, random },
    modelRetrying: (step, retry) => {
      try {
        entry.modelRetrying?.({
          kind: 'model-retrying',
          tenant: entry.binding.tenant,
          instance: entry.binding.instance,
          execution,
          step,
          ...retry,
        })
      } catch {}
    },
  }
}

export async function modelRetryNotDue<P>(
  saved: ModelRetryState | null,
  clock: LoopPorts<P>['clock'],
): Promise<Outcome<Extract<Failure, { kind: 'unavailable' }> | null, Failure>> {
  if (saved === null) return succeed(null)
  const instant = await clock.now()
  if ('failure' in instant) return instant
  if (Date.parse(instant.ok) >= Date.parse(saved.notBefore)) return succeed(null)
  return succeed({
    kind: 'unavailable',
    owner: 'modelRetry',
    diagnostic: `the next main model call is not before ${saved.notBefore}`,
  })
}
