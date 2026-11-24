import type {
  Access,
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  ControlRecord,
  ExecutionSnapshot,
  Failure,
} from '@omne-harness/agent-contract'
import { succeed, type Outcome } from '@omne-harness/operation-result'

// Nothing was written to the execution since its current judgment: a new candidate is a write too.
function judgmentHolds(read: ExecutionSnapshot): boolean {
  const { currentJudgment, judgments } = read.settlement
  const current = judgments.find(item => item.operation === currentJudgment)
  return current?.receipt.revision === read.revision
}

// Null off the cancellation route. A judgment is a function of what it reads: a new one is written only
// after a write to the execution, or after a finish answered that its basis changed.
export async function judgeCancellation<P>(
  journal: Pick<AgentJournal<P>, 'commitSettlement'>,
  target: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  read: ExecutionSnapshot,
  input: Readonly<{
    control: ControlRecord | undefined
    operation: AgentOperationId
    again: boolean
  }>,
): Promise<Outcome<unknown, Failure> | null> {
  const { candidate, route } = read.settlement
  const { control } = input
  if (control === undefined || candidate === null || route?.kind !== 'cancellation') return null
  if (!input.again && judgmentHolds(read)) return succeed(null)
  return journal.commitSettlement({
    ...target,
    operation: input.operation,
    kind: 'judge-cancellation',
    authorization: {
      kind: 'cancel',
      control: control.operation,
      source: control.stages.accepted.source,
    },
    expected: read.revision,
    installation: route.installation,
    candidate: candidate.candidate,
    route: route.record,
  })
}
