import type {
  AgentJournal,
  CallerCommit,
  CommandReceipt,
  ExecutionMutation,
  Failure,
  InputBatch,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  deriveSessionOperation,
  inputsToDeliver,
  type ConsumptionId,
  type DeliveredInputs,
  type InputId,
  type ProducedResult,
  type SessionCommand,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import { sessionEpochOf } from './cordis/history-epoch.ts'
import type { JournalWrite } from './testing/journal.ts'

type Scope = Readonly<{ tenant: TenantId; session: SessionId }>
type Tail = Pick<WorkSnapshot, 'deliveredTail'> | null | undefined
type ResultCaller = Extract<CallerCommit, { kind: 'custody' | 'processed' }>
/** What a journal knows of the execution a write belongs to. */
export type JointState = Readonly<{
  snapshot: Tail
  resultOf: (caller: ResultCaller) => Outcome<ProducedResult, Failure>
}>

function takenBatch<P>(input: ExecutionMutation<P>, method: JournalWrite): InputBatch | null {
  if (method !== 'commit') return null
  for (const event of (input as Parameters<AgentJournal<P>['commit']>[0]).events)
    if (event.kind === 'input-taken' && event.batch.ordered.length > 0) return event.batch
  return null
}

/** The inputs the step that takes `batch` delivers. */
function deliveredOf(
  batch: InputBatch,
  snapshot: Pick<WorkSnapshot, 'deliveredTail'>,
): DeliveredInputs['inputs'] {
  return inputsToDeliver(
    snapshot,
    batch.ordered.map(id => String(id) as InputId),
  )
}

/** The delivery a write that takes a batch carries to the Session, in the same commit. */
function deliveryCommand<P>(
  scope: Scope,
  input: ExecutionMutation<P>,
  method: JournalWrite,
  receipt: CommandReceipt,
  snapshot: Tail,
): Outcome<SessionCommand, Failure> | undefined {
  const batch = takenBatch(input, method)
  if (batch === null) return undefined
  const unavailable = (diagnostic: string) =>
    fail<Failure>({ kind: 'unavailable', owner: 'session-delivery', diagnostic })
  if (snapshot === null || snapshot === undefined)
    return unavailable('a batch taken without the current Session state')
  const inputs = deliveredOf(batch, snapshot)
  if (inputs.length === 0) return undefined
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
      value: { inputs, source: receipt.evidence, admission: receipt.evidence },
    },
  })
}

/** The Session command the caller of a joint write hands over. */
function callerCommand<P>(
  scope: Scope,
  input: ExecutionMutation<P>,
  receipt: CommandReceipt,
  caller: Exclude<CallerCommit, { kind: 'none' }>,
  resultOf: JointState['resultOf'],
): Outcome<SessionCommand, Failure> {
  const operation = deriveSessionOperation({
    kind: 'participation',
    execution: input.execution,
    operation: input.operation,
    joint: caller.kind,
  })
  const common = { tenant: scope.tenant, session: scope.session, operation }
  const participation = {
    execution: input.execution,
    operation: input.operation,
    joint: caller.kind,
    written: receipt.revision,
    handover: receipt.evidence,
  }
  switch (caller.kind) {
    case 'message':
      return succeed({
        kind: 'recordMessage',
        input: {
          ...common,
          participation,
          value: {
            message: caller.message,
            source: caller.source,
            admission: caller.admission,
            consumption: null,
          },
        },
      })
    case 'context-transition':
      if (caller.value.message.role !== 'compaction')
        return fail({ kind: 'invalid', field: 'caller.value.message', reason: 'not compaction' })
      return succeed({
        kind: 'commitDerived',
        input: {
          ...common,
          participation,
          value: {
            kind: 'compaction',
            message: caller.value.message,
            epoch: sessionEpochOf(caller.value.epoch),
          },
          judgment: caller.admission,
        },
      })
    case 'custody':
    case 'processed': {
      const found = resultOf(caller)
      if ('failure' in found) return found
      const result = found.ok
      const consumption = String(caller.consumption) as ConsumptionId
      return succeed(
        caller.kind === 'custody'
          ? {
              kind: 'preserveResult',
              input: { ...common, participation, consumption, result, custody: caller.retained },
            }
          : {
              kind: 'completeConsumption',
              input: {
                ...common,
                participation,
                completion: { consumption, result, completion: caller.completion },
              },
            },
      )
    }
  }
}

/** The Session command of a joint write: what its caller hands over, or the batch it delivers. */
export function jointCommandOf<P>(
  scope: Scope,
  input: ExecutionMutation<P>,
  method: JournalWrite,
  receipt: CommandReceipt,
  caller: CallerCommit,
  state: JointState,
): Outcome<SessionCommand, Failure> | undefined {
  if (caller.kind === 'none') return deliveryCommand(scope, input, method, receipt, state.snapshot)
  if (takenBatch(input, method) !== null)
    return fail({
      kind: 'unavailable',
      owner: 'session-delivery',
      diagnostic: 'a write that takes a batch and joins the Session another way',
    })
  return callerCommand(scope, input, receipt, caller, state.resultOf)
}

/** Whether a write joins the Session: through its caller, or through the batch it takes. */
export function joinsSession<P>(
  input: ExecutionMutation<P>,
  method: JournalWrite,
  caller: CallerCommit,
  state: Pick<JointState, 'snapshot'>,
): boolean {
  if (caller.kind !== 'none') return true
  const batch = takenBatch(input, method)
  if (batch === null) return false
  if (state.snapshot === null || state.snapshot === undefined) return true
  return deliveredOf(batch, state.snapshot).length !== 0
}
