import type {
  AcceptedInput,
  AgentJournal,
  CommandReceipt,
  ExecutionMutation,
  Failure,
  InputBatch,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  deriveSessionOperation,
  inputsToDeliver,
  type DeliveredInputs,
  type InputId,
  type SessionCommand,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { JournalWrite } from './testing/journal.ts'

/** The input batch a write takes for its step, when it takes one that holds inputs. */
export function takenBatch<P>(
  input: ExecutionMutation<P>,
  method: JournalWrite,
): InputBatch | null {
  if (method !== 'commit') return null
  for (const event of (input as Parameters<AgentJournal<P>['commit']>[0]).events)
    if (event.kind === 'input-taken' && event.batch.ordered.length > 0) return event.batch
  return null
}

/**
 * What the step that takes `batch` puts into the model view: the inputs of the batch that are not
 * already at the end of the view, in batch order, each with the message the execution accepted.
 * Null when an input of the batch has no accepted message.
 */
export function deliveriesOf(
  batch: InputBatch,
  accepted: readonly AcceptedInput[],
  snapshot: Pick<WorkSnapshot, 'deliveredTail'>,
): DeliveredInputs['deliveries'] | null {
  const messages = new Map(accepted.map(item => [String(item.id), item.content]))
  const deliveries = []
  for (const input of inputsToDeliver(
    snapshot,
    batch.ordered.map(id => String(id) as InputId),
  )) {
    const message = messages.get(input)
    if (message === undefined) return null
    deliveries.push({ input, message })
  }
  return deliveries
}

/**
 * The Session command a write carries when it takes an input batch: the delivery of that batch to
 * the model view, in the same commit as the step that takes it. Undefined when the write takes no
 * batch, or every input of the batch is already at the end of the view.
 */
export function deliveryCommand<P>(
  scope: Readonly<{ tenant: TenantId; session: SessionId }>,
  input: ExecutionMutation<P>,
  method: JournalWrite,
  receipt: CommandReceipt,
  accepted: readonly AcceptedInput[] | undefined,
  snapshot: Pick<WorkSnapshot, 'deliveredTail'> | null | undefined,
): Outcome<SessionCommand, Failure> | undefined {
  const batch = takenBatch(input, method)
  if (batch === null) return undefined
  const unavailable = (diagnostic: string) =>
    fail<Failure>({ kind: 'unavailable', owner: 'session-delivery', diagnostic })
  if (snapshot === null || snapshot === undefined)
    return unavailable('a batch taken without the current Session state')
  const deliveries = deliveriesOf(batch, accepted ?? [], snapshot)
  if (deliveries === null) return unavailable('a taken input without its accepted message')
  if (deliveries.length === 0) return undefined
  return succeed({
    kind: 'recordMessage',
    input: {
      tenant: scope.tenant,
      session: scope.session,
      operation: deriveSessionOperation({
        kind: 'participation',
        execution: input.execution,
        operation: input.operation,
        joint: 'delivered',
      }),
      participation: {
        execution: input.execution,
        operation: input.operation,
        joint: 'delivered',
        written: receipt.revision,
        handover: receipt.evidence,
      },
      value: { deliveries, source: receipt.evidence, admission: receipt.evidence },
    },
  })
}

/** Whether `deliveryCommand` answers for this write: with a command, or with why it has none. */
export function carriesDelivery<P>(
  input: ExecutionMutation<P>,
  method: JournalWrite,
  accepted: readonly AcceptedInput[] | undefined,
  snapshot: Pick<WorkSnapshot, 'deliveredTail'> | null | undefined,
): boolean {
  const batch = takenBatch(input, method)
  if (batch === null) return false
  if (snapshot === null || snapshot === undefined) return true
  return deliveriesOf(batch, accepted ?? [], snapshot)?.length !== 0
}
