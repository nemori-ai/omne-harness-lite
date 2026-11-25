import type {
  AgentExecutionId,
  AgentInstanceId,
  AgentState,
  DurableEvidence,
} from '@omne-harness/agent-contract'

export type Contact =
  | Readonly<{ kind: 'live' }>
  | Readonly<{ kind: 'lost'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown' }>

/** Between executions (reserved) and while draining the runtime may still be taking this one up. */
function holds(reported: AgentState, execution: AgentExecutionId): boolean {
  switch (reported.kind) {
    case 'occupied':
      return reported.execution === execution
    case 'reserved':
    case 'draining':
      return true
    case 'idle':
    case 'disposed':
      return false
  }
}

/** A runtime this host runs answers by its own report; for any other instance only the assembly's proof counts. */
export function contactOf(
  owner: string,
  running: AgentState | undefined,
  asked: Readonly<{
    execution: AgentExecutionId
    authority: Readonly<{ instance: AgentInstanceId }>
  }>,
  proof: () => DurableEvidence | null | undefined,
): Contact {
  const { execution } = asked
  if (running === undefined) {
    const evidence = proof() ?? null
    return evidence === null ? { kind: 'unknown' } : { kind: 'lost', evidence }
  }
  if (holds(running, execution)) return { kind: 'live' }
  const digest = `instance:${asked.authority.instance}/execution:${execution}`
  return { kind: 'lost', evidence: { owner, record: 'runtime-released', revision: '1', digest } }
}
