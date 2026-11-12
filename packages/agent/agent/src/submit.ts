// `input.submit` of an execution handle (agent-contract SPEC "输入内容与水位线" and the per-operation
// table, input.submit; loop-algorithm U0). A submit works on the durable view of the original
// execution: it needs no live runtime, advance, grant, slot, resume or attach, and it changes none
// of them. The Journal recognizes the original operation first, so a retry of an accepted submit
// gets its original receipt even after the end. An input that the execution already accepted under
// another operation is recognized through its original acceptance. A new input goes through the
// submit branch of message admission; a rejection answers `invalid` on `value`, and the provider's
// record makes a retry answer the same rejection. A thrown `Journal.submit` answers commit-unknown
// for the original operation: its retry is the recognition.
import type {
  AgentExecutionInput,
  AgentJournal,
  CommandReceipt,
  ExecutionSnapshot,
  Failure,
  InputHandoff,
  JournalSubmitLineage,
  MessageHandoff,
  OriginalInputAcceptance,
} from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'

export type SubmitInput<P> = Parameters<AgentExecutionInput<P>['submit']>[0]

export type SubmitPorts<P> = Readonly<{
  journal: Pick<AgentJournal<P>, 'load' | 'submit'>
  handoff: Pick<MessageHandoff<P>, 'prepare'>
}>

/** The original acceptance of `input`'s identity in `snapshot`, if the execution accepted it. */
function acceptanceOf<P>(
  snapshot: ExecutionSnapshot,
  input: SubmitInput<P>,
): OriginalInputAcceptance | null {
  for (const record of snapshot.handoffs) {
    const { handoff, request, resolution } = record
    if (
      handoff.kind === 'input' &&
      handoff.input === input.value.id &&
      request.kind === 'input' &&
      resolution?.kind === 'recorded' &&
      record.history.kind === 'committed'
    )
      return { entry: request.entry, handoff, outcome: resolution.outcome }
  }
  return null
}

/** The external request of a new submit entry: Ki is the execution, the operation and the input. */
function requestOf<P>(input: SubmitInput<P>): InputHandoff {
  const { execution, operation, value } = input
  return {
    kind: 'input',
    reference: { kind: 'input', execution, entry: operation, input: value.id },
    entry: { kind: 'submit', operation, execution, value },
    source: { kind: 'external-input', input: value.id },
  }
}

export async function submitInput<P>(
  ports: SubmitPorts<P>,
  input: SubmitInput<P>,
): Promise<Outcome<CommandReceipt, Failure>> {
  const { principal, tenant, execution, operation } = input
  const access = { principal, tenant }
  const accept = async (lineage: JournalSubmitLineage) => {
    try {
      return await ports.journal.submit({ ...input, lineage })
    } catch {
      return fail({ kind: 'commit-unknown' as const, operation })
    }
  }
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  const original = acceptanceOf(loaded.ok, input)
  if (original !== null)
    return accept({
      kind: original.entry.operation === operation ? 'new-input' : 'recognize-input',
      original,
    })
  if (loaded.ok.state.kind === 'ended') return fail({ kind: 'terminal' })
  const request = requestOf(input)
  const fixed = await ports.handoff.prepare({ ...access, kind: 'submit', request })
  if ('failure' in fixed) return fixed
  const { decision } = fixed.ok
  if (decision.kind === 'rejected')
    return fail({ kind: 'invalid', field: 'value', reason: decision.reason })
  return accept({
    kind: 'new-input',
    original: { entry: request.entry, handoff: request.reference, outcome: fixed.ok },
  })
}
