import type {
  AgentExecutionInput,
  AgentJournal,
  CommandReceipt,
  Failure,
  InputHandoff,
  JournalSubmitLineage,
  MessageHandoff,
} from '@omne-harness/agent-contract'
import { fail, type Outcome } from '@omne-harness/operation-result'
import { rejectedInput } from './loop/initial-admission.ts'

export type SubmitInput<P> = Parameters<AgentExecutionInput<P>['submit']>[0]

export type SubmitPorts<P> = Readonly<{
  journal: Pick<AgentJournal<P>, 'load' | 'submit' | 'inputAcceptance'>
  handoff: Pick<MessageHandoff<P>, 'prepare'>
}>

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
  const found = await ports.journal.inputAcceptance({ ...access, execution, input: input.value.id })
  if ('failure' in found) return found
  const original = found.ok
  if (original !== null)
    return accept({
      kind: original.entry.operation === operation ? 'new-input' : 'recognize-input',
      original,
    })
  const loaded = await ports.journal.load({ ...access, execution })
  if ('failure' in loaded) return loaded
  if (loaded.ok.state.kind === 'ended') return fail({ kind: 'terminal' })
  const request = requestOf(input)
  const fixed = await ports.handoff.prepare({ ...access, kind: 'submit', request })
  if ('failure' in fixed) return fixed
  const { decision } = fixed.ok
  if (decision.kind === 'rejected') return fail(rejectedInput(request, decision))
  return accept({
    kind: 'new-input',
    original: { entry: request.entry, handoff: request.reference, outcome: fixed.ok },
  })
}
