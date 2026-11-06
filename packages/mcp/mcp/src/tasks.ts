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
  type McpConfig,
  type McpPorts,
  type OperationFailure,
  type Refusal,
  type TaskControl,
  type TaskRef,
  type TaskReport,
} from '@omne-harness/mcp-contract'
import type { TaskAnswer, TransportFailure } from '@omne-harness/mcp-contract/provider'
import { classificationOf } from './internal/classification.ts'
import type { Ensured, EnsureFailure } from './internal/entry.ts'
import { decideForUse, type UseGate } from './internal/guard.ts'
import {
  connectionFailureOf,
  connectionFailureOfBuild,
  loseInScope,
  lostOfNoAnswer,
  lostOfNotSent,
} from './internal/lost.ts'
import { ask, within } from './internal/port.ts'
import { prepareSettings } from './internal/settings.ts'
import { ensureOptionsOf, type ConnectionTable } from './internal/table.ts'
import type { TaskKey, TaskRecord, TaskTable } from './internal/task-table.ts'
import { accountTextOf } from './internal/text.ts'

export type TasksDependencies<P, S> = Readonly<{
  ports: McpPorts<P, S>
  config: McpConfig<P>
  table: ConnectionTable<P>
  tasks: TaskTable
}>

const UNKNOWN: Refusal = { kind: 'unknown' }
const NO_CONNECTION: OperationFailure = { kind: 'effect-unknown', cause: 'no-connection' }
const ABANDONED = fail<TransportFailure>({ kind: 'no-answer', cause: 'abandoned' })

/** A request of the task's initiator: the connection to send it on, or why there is none. */
type OnConnection = Readonly<{ ensured: Ensured; record: TaskRecord }>

/** The transport's answer as the operation's: `queryTask`, `provideTaskInput`, `cancelTask`. */
const asIs = <T>(answer: T): T => answer

/**
 * What a failed build means for a task request, which was not sent (S2, R7, MC-17 step 3). No
 * material to build on (a setting defect, a missing credential, a withdrawn adoption) is
 * `no-connection`; an unreadable adoption is `unknown`; a bound that fired first or the shutdown
 * under way is the `connection-unavailable` the build answered. A build that gave no connection
 * is the connection failure, as the call port reports it.
 */
function failureOfEnsure(failure: EnsureFailure): OperationFailure {
  if (failure.stage === 'connect') return connectionFailureOfBuild(failure)
  switch (failure.reason.kind) {
    case 'unknown':
      return UNKNOWN
    case 'connection-unavailable':
      return failure.reason
    default:
      return NO_CONNECTION
  }
}

export function createTasks<P, S>(deps: TasksDependencies<P, S>): TaskControl<P> {
  const { ports, config, table, tasks } = deps
  const { scope, startBound } = table.runtime
  const gate: UseGate<P, S> = { ports, table }

  const keyOf = (access: Access<P>, task: TaskRef): TaskKey => ({
    tenant: access.tenant,
    principalKey: config.principalKey(access.principal),
    holding: task.ref.holding,
    taskId: task.taskId,
  })

  /**
   * A connection built for the task through the gate (S2): eligibility `granted`, the material of
   * S4, and the same peer account the task was started on, so another account's credentials do
   * not act on it.
   */
  async function built(
    access: Access<P>,
    task: TaskRef,
    record: TaskRecord,
  ): Promise<Outcome<Ensured, OperationFailure>> {
    const decision = await decideForUse(gate, access, task.ref)
    if (decision.kind !== 'admitted')
      return fail(decision.kind === 'adoption-unknown' ? UNKNOWN : NO_CONNECTION)
    // S8 once more after the gate's wait: a shutdown that landed meanwhile builds nothing.
    if (table.isShut()) return fail(NO_CONNECTION)
    const prepared = prepareSettings(decision.endpoint, task.connectBound)
    if ('failure' in prepared) return fail(NO_CONNECTION)
    if (accountTextOf(prepared.ok.account) !== accountTextOf(record.account))
      return fail(NO_CONNECTION)
    const ensured = await table.ensure(
      decision.endpoint,
      access,
      ensureOptionsOf(task.connectBound),
    )
    return 'failure' in ensured ? fail(failureOfEnsure(ensured.failure)) : ensured
  }

  /**
   * Steps 2–3 of MC-17: nothing after the shutdown (S8); then the usable connection of the
   * tenant's holding on the task's peer account, reused with no port asked; else one built.
   */
  function connectionOf(
    access: Access<P>,
    task: TaskRef,
    record: TaskRecord,
  ): Promise<Outcome<Ensured, OperationFailure>> {
    if (table.isShut()) return Promise.resolve(fail(NO_CONNECTION))
    const account = accountTextOf(record.account)
    const reused = table
      .currentOf(access.tenant, task.ref.holding)
      .find(ensured => accountTextOf(ensured.key.account) === account)
    return reused === undefined ? built(access, task, record) : Promise.resolve(succeed(reused))
  }

  /**
   * The failure of a task request (S2, R7): `not-sent` is the connection failure, `no-answer` is
   * `effect-unknown` with the same cause, a JSON-RPC error and an unreadable answer are passed on.
   * A transport failure that takes the connection down, judged by its cause on the safe side (S7),
   * goes to the table first; its teardown goes on in the table's scope.
   */
  function failureOf(ensured: Ensured, failure: TransportFailure): OperationFailure {
    switch (failure.kind) {
      case 'not-sent':
        loseInScope(table, ensured, lostOfNotSent(failure))
        return connectionFailureOf(failure)
      case 'no-answer': {
        const lost = lostOfNoAnswer(failure.cause)
        if (lost !== undefined) loseInScope(table, ensured, lost)
        return { kind: 'effect-unknown', cause: failure.cause }
      }
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
   * One task request of the initiator (S2, S8, MC-17): the initiator and the task as it was
   * issued first (a reference with another generation is not this task; a key two accounts
   * answered on names none), then the connection, then the request under the connection bound. A request the bound cuts off has no answer; a
   * transport that breaches its contract gave none either (T9). `send` is the port call alone;
   * `read` turns the transport's answer into the operation's outside `ask` (MC-15).
   */
  async function request<T, R>(
    access: Access<P>,
    task: TaskRef,
    send: (on: OnConnection) => Promise<Outcome<T, TransportFailure>>,
    read: (answer: T, on: OnConnection) => R,
  ): Promise<Outcome<R, OperationFailure>> {
    const record = tasks.get(keyOf(access, task))
    if (record === undefined || record === 'ambiguous' || record.issuedAt !== task.issuedAt)
      return fail(UNKNOWN)
    const connection = await connectionOf(access, task, record)
    if ('failure' in connection) return connection
    const ensured = connection.ok
    const on: OnConnection = { ensured, record }
    const asked = ask(() => send(on), ABANDONED)
    const answered = await within(asked, startBound(ensured.bound, 'task'), scope)
    const answer = answered.kind === 'answered' ? answered.value : ABANDONED
    if ('failure' in answer) return fail(failureOf(ensured, answer.failure))
    return succeed(read(answer.ok, on))
  }

  /** The result of a finished task, classified like the answer to a call (O1), on the task's schema. */
  function resultOf(
    answer: TaskAnswer,
    on: OnConnection,
  ): CallOutcome | 'not-finished' | 'expired' | 'cancelled' {
    if (answer.kind !== 'finished') return answer.kind
    return classifyOutcome(
      answer.answer,
      classificationOf(on.ensured.generation, on.record.outputSchema, ports.checkOutput),
    )
  }

  return {
    queryTask: (access, task): Promise<Outcome<TaskReport | 'expired', OperationFailure>> =>
      request(access, task, on => on.ensured.transport.getTask(task.taskId), asIs),
    taskResult: (access, task) =>
      request(access, task, on => on.ensured.transport.getTaskResult(task.taskId), resultOf),
    provideTaskInput: (access, task, inputResponses: JsonValue) =>
      request(
        access,
        task,
        on => on.ensured.transport.updateTask(task.taskId, inputResponses),
        asIs,
      ),
    cancelTask: (access, task) =>
      request(access, task, on => on.ensured.transport.cancelTask(task.taskId), asIs),
  }
}
