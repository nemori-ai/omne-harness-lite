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
const MAY_HOLD: Readonly<Record<Exclude<AgentState['kind'], 'occupied'>, boolean>> = {
  reserved: true,
  draining: true,
  idle: false,
  disposed: false,
}

function holds(reported: AgentState, execution: AgentExecutionId): boolean {
  return reported.kind === 'occupied' ? reported.execution === execution : MAY_HOLD[reported.kind]
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
