import type { AgentExecutionId, Failure, StepId } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { RuntimeFactory } from './host.ts'
import type { AgentHostConfig } from './host-config.ts'

export const DEFAULT_HALT_LIMIT = 3
export const HALT_LEDGER_EXECUTIONS = 256

export type Halt = Readonly<{ step: StepId | null; node: string | null; failure: Failure['kind'] }>

export type HaltLedger = Readonly<{
  record(execution: AgentExecutionId, halt: Halt): void
  refusal(execution: AgentExecutionId): Extract<Failure, { kind: 'invalid' }> | null
  forget(execution: AgentExecutionId): void
}>

type Streak = Readonly<{ last: Halt; count: number }>

export function createHaltLedger(
  policy: Readonly<{ limit: number; capacity: number }>,
): HaltLedger {
  const streaks = new Map<AgentExecutionId, Streak>()
  return {
    record(execution, halt) {
      const before = streaks.get(execution)
      streaks.delete(execution)
      streaks.set(execution, {
        last: halt,
        count: before !== undefined && before.last.step === halt.step ? before.count + 1 : 1,
      })
      if (streaks.size <= policy.capacity) return
      for (const oldest of streaks.keys()) {
        streaks.delete(oldest)
        return
      }
    },
    refusal(execution) {
      const streak = streaks.get(execution)
      if (streak === undefined || streak.count < policy.limit) return null
      const { step, node, failure } = streak.last
      const where = step === null ? 'before the first step' : `at ${step}`
      return {
        kind: 'invalid',
        field: 'execution',
        reason: `halted ${String(streak.count)} times ${where}, last at ${node ?? 'no node'} on ${failure}`,
      }
    },
    forget(execution) {
      streaks.delete(execution)
    },
  }
}

export function haltBounded(
  factory: RuntimeFactory,
  ledger: HaltLedger,
  warn: (message: string) => void,
): RuntimeFactory {
  return async (dependencies, options, extras) => {
    const { haltLimit: _limit, ...configuration } = options.configuration as AgentHostConfig
    const created = await factory(
      dependencies,
      { ...options, configuration },
      {
        ...extras,
        failed(event) {
          const { execution, step, node, failure } = event
          ledger.record(execution, { step, node, failure: failure.kind })
          extras.failed(event)
        },
        endedFailed(event) {
          ledger.forget(event.execution)
          extras.endedFailed(event)
        },
      },
    )
    if ('failure' in created) return created
    const { runtime } = created.ok
    return succeed({
      ...created.ok,
      runtime: {
        ...runtime,
        resume(input) {
          const refused = ledger.refusal(input.execution)
          if (refused === null) return runtime.resume(input)
          warn(`agent run is not resumed: execution=${input.execution} ${refused.reason}`)
          return Promise.resolve(fail(refused))
        },
      },
    })
  }
}
