import {
  type AcceptedInput,
  type AgentJournal,
  type CallerCommit,
  type ExecutionMutation,
} from '@omne-harness/agent-contract'
import {
  type HistoryEntry,
  type InputId as SessionInputId,
  type RunTerminal,
} from '@omne-harness/session-contract'
import { type CommonRoot } from './root.ts'
import { type JournalWrite } from './journal.ts'
import { canonical } from './session-values.ts'

// Values of the memory Session journal factory that read none of its state.

export function sessionCaller<P>(input: ExecutionMutation<P>, method: JournalWrite): CallerCommit {
  const caller =
    method === 'commit'
      ? (input as Parameters<AgentJournal<P>['commit']>[0]).caller
      : method === 'recordResult'
        ? (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
        : { kind: 'none' as const }
  return (caller.kind === 'custody' || caller.kind === 'processed') &&
    caller.result.producer.kind === 'compaction'
    ? { kind: 'none' }
    : caller
}

export function cancelBatchRow(root: CommonRoot, terminal: RunTerminal): HistoryEntry {
  for (const row of root.sources.rowsById.values())
    if (
      row.kind === 'run.terminal' &&
      canonical(row.origin.source) === canonical(terminal.evidence)
    )
      return row
  throw new Error('session double defect: a Run terminal without its SE26 row')
}

type AdmittedInputs = ReadonlyMap<
  SessionInputId,
  Readonly<{ origin: unknown; message: unknown }> | undefined
>

export const admittedBy =
  (inputs: AdmittedInputs) =>
  (input: AcceptedInput): boolean => {
    const admitted = inputs.get(String(input.id) as SessionInputId)
    return (
      admitted !== undefined &&
      canonical(admitted.origin) === canonical(input.source) &&
      canonical(admitted.message) === canonical(input.content)
    )
  }

export function recordAdmissions<Row extends { ordinal: string }>(
  directory: Pick<Map<SessionInputId, readonly Row[]>, 'get' | 'set'>,
  admitted: readonly AcceptedInput[],
  row: Omit<Row, 'ordinal'>,
): void {
  for (const { id } of admitted) {
    const key = String(id) as SessionInputId
    const rows = directory.get(key) ?? []
    directory.set(key, [...rows, { ordinal: String(rows.length), ...row } as Row])
  }
}
