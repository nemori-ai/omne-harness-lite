import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionId, AgentJournal, FailureCandidate } from '@omne-harness/agent-contract'
import { agentJournalKey } from '@omne-harness/agent-cordis-contract/cordis'
import type {
  RunFailureCause,
  RunFailureCauses,
  RunFailureReading,
} from '@omne-harness/session-access'

export type FinishReader = Pick<AgentJournal<unknown>, 'readFinish'>

export function failureCauseOf(failure: FailureCandidate): RunFailureCause {
  const detail = failure.kind === 'no-reply' ? (failure.fault?.diagnostic ?? '') : ''
  return { kind: failure.kind, detail: detail === '' ? null : detail }
}

export function runFailureCausesOf(
  journal: FinishReader | undefined,
): RunFailureCauses | undefined {
  const readFinish = journal?.readFinish?.bind(journal)
  if (readFinish === undefined) return undefined
  return {
    async read({ principal, tenant, execution }): Promise<RunFailureReading> {
      const found = await readFinish({
        principal,
        tenant,
        execution: execution as AgentExecutionId,
      })
      if ('failure' in found) return { kind: 'unavailable' }
      const failure = found.ok?.failure ?? null
      return failure === null ? { kind: 'none' } : { kind: 'cause', cause: failureCauseOf(failure) }
    },
  }
}

export function runFailureCauses(ctx: Context): RunFailureCauses | undefined {
  return runFailureCausesOf(ctx.get(agentJournalKey) as FinishReader | undefined)
}
