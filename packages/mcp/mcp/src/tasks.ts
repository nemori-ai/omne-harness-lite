// The task operations `TaskControl` (SPEC S2, S8, R7, T6): open to the initiator only, on the
// connection the task was started on (the same tenant, holding and peer account), reused without
// any port asked, or built again through the gate when there is none. Each one sends one request
// under the connection bound and reports the transport's answer as an operation failure or the
// task's state, through the one reader of SPEC MC-17.
import type { JsonValue } from '@omne-harness/json-text'
import type { Access } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  classifyOutcome,
  type CallOutcome,
  type OperationFailure,
  type Refusal,
  type TaskControl,
  type TaskRef,
  type TaskReport,
} from '@omne-harness/mcp-contract'
import type { TaskAnswer, TransportFailure } from '@omne-harness/mcp-contract/provider'
import type { CallsDependencies } from './calls.ts'
import type { Ensured, EnsureFailure } from './internal/entry.ts'
import { admit } from './internal/gate.ts'
import { withdraws } from './internal/guard.ts'
import { lostOfNoAnswer, lostOfNotSent, type Lost } from './internal/lost.ts'
import { ask, within } from './internal/port.ts'
import { prepareSettings } from './internal/settings.ts'
import type { TaskKey, TaskRecord } from './internal/task-table.ts'
import { accountTextOf } from './internal/text.ts'

const UNKNOWN: Refusal = { kind: 'unknown' }
const NO_CONNECTION: OperationFailure = { kind: 'effect-unknown', cause: 'no-connection' }
const ABANDONED = fail<TransportFailure>({ kind: 'no-answer', cause: 'abandoned' })

/** A request of the task's initiator: the connection to send it on, or why there is none. */
type OnConnection = Readonly<{ ensured: Ensured; record: TaskRecord }>

/**
 * What a failed build means for a task operation (S2): a setting defect, a missing credential, a
 * withdrawn adoption, the shut table or a bound that fired first mean there is no connection to
 * build; an unreadable adoption is `unknown`; a failure of the build itself is reported as it is.
 */
function failureOfEnsure(failure: EnsureFailure): OperationFailure {
  if (failure.stage === 'connect') return failure.reason
  return failure.reason.kind === 'unknown' ? UNKNOWN : NO_CONNECTION
}

export function createTasks<P, S>(deps: CallsDependencies<P, S>): TaskControl<P> {
  const { ports, config, table, tasks } = deps
  const { scope, startBound } = table.runtime

  const keyOf = (access: Access<P>, task: TaskRef): TaskKey => ({
    tenant: access.tenant,
    principalKey: config.principalKey(access.principal),
    holding: task.ref.holding,
    taskId: task.taskId,
  })

  /**
   * The connection of the task (S2): the usable one of the tenant's holding on the task's peer
   * account, reused with no port asked; else one built through the gate, with eligibility
   * `granted`, on the same peer account, unless the table is shut (S8).
   */
  async function connectionOf(
    access: Access<P>,
    task: TaskRef,
    record: TaskRecord,
  ): Promise<Outcome<Ensured, OperationFailure>> {
    const account = accountTextOf(record.account)
    const reused = table
      .currentOf(access.tenant, task.ref.holding)
      .find(ensured => accountTextOf(ensured.key.account) === account)
    if (reused !== undefined) return succeed(reused)
    if (table.isShut()) return fail(NO_CONNECTION)
    const decision = await admit(ports, access, task.ref)
    if (decision.kind !== 'admitted') {
      // Invariant 6 at this use: a withdrawn or blocked endpoint does not keep its connection.
      if (withdraws(decision)) await table.close(access.tenant, task.ref.holding)
      return fail(decision.kind === 'adoption-unknown' ? UNKNOWN : NO_CONNECTION)
    }
    const prepared = prepareSettings(decision.endpoint, task.connectBound)
    if ('failure' in prepared) return fail(NO_CONNECTION)
    // The task was started on one peer account; another account's credentials do not act on it.
    if (accountTextOf(prepared.ok.account) !== account) return fail(NO_CONNECTION)
    const options = task.connectBound === undefined ? {} : { connectBound: task.connectBound }
    const ensured = await table.ensure(decision.endpoint, access, options)
    return 'failure' in ensured ? fail(failureOfEnsure(ensured.failure)) : ensured
  }

  /** A transport answer that says the connection is gone goes to the table first (S7). */
  async function losing(ensured: Ensured, lost: Lost | undefined): Promise<void> {
    if (lost === undefined) return
    await table.lose(ensured.connection, ensured.generation, lost.reason, lost.mark)
  }

  /**
   * The failure of a task request (S2, R7): `not-sent` is the connection failure, `no-answer` is
   * `effect-unknown` with the same cause, a JSON-RPC error and an unreadable answer are passed on.
   */
  async function failureOf(ensured: Ensured, failure: TransportFailure): Promise<OperationFailure> {
    switch (failure.kind) {
      case 'not-sent':
        await losing(ensured, lostOfNotSent(failure))
        return failure.cause === 'authorization-required'
          ? { kind: 'authorization-required', discovery: failure.discovery }
          : { kind: 'connection-unavailable' }
      case 'no-answer':
        await losing(ensured, lostOfNoAnswer(failure.cause))
        return { kind: 'effect-unknown', cause: failure.cause }
      case 'error-answer':
      case 'answer-malformed':
        return failure
      default: {
        const exhaustive: never = failure
        return exhaustive
      }
    }
  }

  /**
   * One task request of the initiator (S2, S8): the initiator check first, then the connection,
   * then the request under the connection bound. A request the bound cuts off has no answer; a
   * transport that breaches its contract gave none either (T9).
   */
  async function request<T>(
    access: Access<P>,
    task: TaskRef,
    send: (on: OnConnection) => Promise<Outcome<T, TransportFailure>>,
  ): Promise<Outcome<T, OperationFailure>> {
    const record = tasks.get(keyOf(access, task))
    if (record === undefined) return fail(UNKNOWN)
    const connection = await connectionOf(access, task, record)
    if ('failure' in connection) return connection
    const ensured = connection.ok
    const on: OnConnection = { ensured, record }
    const asked = ask(() => send(on), ABANDONED)
    const answered = await within(asked, startBound(ensured.bound, 'task'), scope)
    const answer = answered.kind === 'answered' ? answered.value : ABANDONED
    if ('failure' in answer) return fail(await failureOf(ensured, answer.failure))
    return answer
  }

  /** The result of a finished task, classified like the answer to a call (O1), on the task's schema. */
  function resultOf(
    on: OnConnection,
    answer: TaskAnswer,
  ): CallOutcome | 'not-finished' | 'expired' | 'cancelled' {
    if (answer.kind !== 'finished') return answer.kind
    return classifyOutcome(answer.answer, {
      issuedAt: on.ensured.generation,
      ...(on.record.outputSchema === undefined ? {} : { outputSchema: on.record.outputSchema }),
      checkOutput: ports.checkOutput,
    })
  }

  return {
    queryTask: (access, task): Promise<Outcome<TaskReport | 'expired', OperationFailure>> =>
      request(access, task, on => on.ensured.transport.getTask(task.taskId)),
    taskResult: async (access, task) => {
      const answered = await request(access, task, async on => {
        const answer = await on.ensured.transport.getTaskResult(task.taskId)
        return 'failure' in answer ? answer : succeed(resultOf(on, answer.ok))
      })
      return answered
    },
    provideTaskInput: (access, task, inputResponses: JsonValue) =>
      request(access, task, on => on.ensured.transport.updateTask(task.taskId, inputResponses)),
    cancelTask: (access, task) =>
      request(access, task, on => on.ensured.transport.cancelTask(task.taskId)),
  }
}
