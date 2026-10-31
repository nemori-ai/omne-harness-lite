import type { AgentJournal, ExecutionMutation, Failure } from '@omne-harness/agent-contract'
import type {
  ConsumptionId,
  SessionLogObservation,
  SessionOperationId,
  SessionFailure,
  CommitReceipt,
} from '@omne-harness/session-contract'
import type { Outcome } from '@omne-harness/operation-result'
import { canonical, digestOf } from './session-values.ts'
import { executionKey, history, normalizedResult, HistoryFailure } from './history.ts'
import type { JournalCell } from './root.ts'
import type { publicationHooks } from './publication.ts'

const complete = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  ['owner', 'record', 'revision', 'digest'].every(
    key =>
      key in value &&
      typeof value[key as keyof typeof value] === 'string' &&
      String(value[key as keyof typeof value]).length > 0,
  )
export function preparationOperation<P>(
  cell: JournalCell<P>,
  input: ExecutionMutation<P>,
  method: 'commit' | 'recordResult',
): SessionOperationId {
  return `sop_result_${digestOf([cell.namespace, input.execution, input.operation, method])}` as SessionOperationId
}
/** The old Pending is interpreted separately before a new result and its participation are published. */
export function resultPreparation<P>(
  cell: JournalCell<P>,
  publications: ReturnType<typeof publicationHooks>,
  project: (
    value: SessionLogObservation,
    operation: SessionOperationId,
  ) => Promise<Outcome<CommitReceipt | null, SessionFailure>>,
  failureOf: (value: SessionFailure, operation: ExecutionMutation<P>['operation']) => Failure,
) {
  return async (
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
  ): Promise<Failure | undefined> => {
    const caller =
      method === 'commit'
        ? (input as Parameters<AgentJournal<P>['commit']>[0]).caller
        : (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
    if (caller.kind !== 'custody' && caller.kind !== 'processed') return
    if (
      !caller.result.version ||
      !complete(caller.result.source) ||
      !complete(caller.kind === 'custody' ? caller.retained : caller.completion) ||
      (caller.result.delivery !== null && !caller.result.delivery)
    )
      return {
        kind: 'invalid',
        field: 'transfer',
        reason: 'incomplete result or responsibility evidence',
      }
    const operation = preparationOperation(cell, input, method),
      key = canonical([cell.namespace, operation])
    try {
      for (;;) {
        const denied = cell.authorize(input, method)
        if (denied) return denied
        if (cell.gate() !== null)
          return { kind: 'unavailable', owner: 'session-history', diagnostic: cell.gate()! }
        const root = cell.current(),
          state = root.session,
          execution = root.agent.executions.get(executionKey(root, input.execution))
        if (!state || !execution) return { kind: 'denied', action: method }
        const value = normalizedResult(root, execution, caller.consumption, caller.result),
          consumption = String(caller.consumption) as ConsumptionId
        const registered = state.snapshot.callRegistrations?.find(
          item => item.consumption === consumption,
        )?.registration
        if (registered?.kind === 'associated')
          return canonical(registered.binding) === canonical(value.binding)
            ? undefined
            : { kind: 'conflict', operation: input.operation }
        const held = state.operations.get(operation)
        if (held) {
          if (held.projection?.execution !== input.execution || held.projection.sequence !== null)
            return { kind: 'conflict', operation: input.operation }
          return {
            kind: 'unavailable',
            owner: 'session-history',
            diagnostic: 'prepared binding is no longer present',
          }
        }
        const material = history(
          cell,
          state.snapshot,
          { kind: 'pending', inputs: state.snapshot.pending },
          [input.execution],
          new Map(),
        )
        const boundary = material.index.executions.find(item => item.execution === input.execution)
        if (!boundary)
          return {
            kind: 'unavailable',
            owner: 'session-history',
            diagnostic: 'original result preparation head',
          }
        const consequences: SessionLogObservation['consequences'] =
          registered?.kind === 'tool-intent'
            ? [
                {
                  kind: 'call-association',
                  consumption,
                  binding: value.binding,
                  source: boundary.executionEvidence,
                },
              ]
            : [
                {
                  kind: 'call-registration',
                  consumption,
                  registration: {
                    kind: 'associated',
                    binding: value.binding,
                    purpose: value.pending.purpose,
                  } as import('@omne-harness/session-contract').SessionCallRegistration,
                },
              ]
        await publications.wait(key)
        if (cell.current() !== root) continue
        const final = cell.authorize(input, method)
        if (final) return final
        if (cell.gate() !== null)
          return { kind: 'unavailable', owner: 'session-history', diagnostic: cell.gate()! }
        const fault = publications.takeFault(key)
        if (fault === 'before-publish')
          return {
            kind: 'unavailable',
            owner: 'session-memory-journal',
            diagnostic: 'before result preparation publication',
          }
        const result = await project(
          {
            tenant: cell.tenant,
            session: cell.session,
            execution: input.execution,
            run: boundary.run,
            operation,
            sequence: null,
            revision: boundary.revision,
            executionEvidence: boundary.executionEvidence,
            source: boundary.executionEvidence,
            consequences,
          },
          operation,
        )
        if ('failure' in result) return failureOf(result.failure, input.operation)
        if (fault === 'after-publish') return { kind: 'commit-unknown', operation: input.operation }
        // Continue through the same complete binding checks after the awaited publication.
      }
    } catch (error) {
      if (error instanceof HistoryFailure) {
        if (error.failure.kind === 'quarantined') cell.quarantine(error.failure.diagnostic)
        return failureOf(error.failure, input.operation)
      }
      throw error
    }
  }
}
