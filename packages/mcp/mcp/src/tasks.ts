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
import type {
  McpTransport,
  TaskAnswer,
  TransportFailure,
} from '@omne-harness/mcp-contract/provider'
import { classificationOf } from './internal/classification.ts'
import type { Ensured, EnsureFailure } from './internal/entry.ts'
import { decideForUse, type UseGate } from './internal/guard.ts'
import { connectionFailureOf, connectionFailureOfBuild, loseIfLost } from './internal/lost.ts'
import { judgedTree } from './internal/caller-values.ts'
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

/** The shutdown began before the request was sent: the exit of `request` answers it (S8). */
const SHUT = 'shut'
type Shut = typeof SHUT

/** A request of the task's initiator: the connection it goes on, and the task as it was recorded. */
type OnConnection = Readonly<{ ensured: Ensured; record: TaskRecord }>

/** A request that did not leave: why, as the operation would answer it without a shutdown. */
type Unsent = Readonly<{ unsent: OperationFailure }>

/** A request on the wire: the transport's answer, a `not-sent` one excluded. */
type Answered<T> = Readonly<{ on: OnConnection; answer: Outcome<T, TransportFailure> }>

/** The transport's answer as the operation's: `queryTask`, `provideTaskInput`, `cancelTask`. */
const asIs = <T>(answer: T): T => answer

/**
 * What a failed build means for a task request, which was not sent (S2, R7, MC-17 step 3). No
 * material to build on (a setting defect, a missing credential, a withdrawn adoption) is
 * `no-connection`; an unreadable adoption is `unknown`; a bound that fired first is the
 * `connection-unavailable` the build answered. A build that gave no connection is the connection
 * failure, as the call port reports it. A shutdown under way is not read here: the exit of
 * `request` answers every request not sent once it began (S8).
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
   * not act on it. A shutdown that landed while the gate was asked needs no look here: `ensure`
   * refuses after it without asking a port (MC-5), and the exit of `request` answers (S8).
   */
  async function built(
    access: Access<P>,
    task: TaskRef,
    record: TaskRecord,
  ): Promise<Outcome<Ensured, OperationFailure>> {
    const decision = await decideForUse(gate, access, task.ref)
    if (decision.kind !== 'admitted')
      return fail(decision.kind === 'adoption-unknown' ? UNKNOWN : NO_CONNECTION)
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
   * Step 3 of MC-17, without a wait: the usable connection of the tenant's holding on the task's
   * peer account, reused with no port asked.
   */
  function reusedOf(access: Access<P>, task: TaskRef, record: TaskRecord): Ensured | undefined {
    const account = accountTextOf(record.account)
    return table
      .currentOf(access.tenant, task.ref.holding)
      .find(ensured => accountTextOf(ensured.key.account) === account)
  }

  /**
   * The request under the connection bound (MC-17 step 4); it is asked before this yields, and
   * only while the connection takes requests: once its close began (`closeAll` closes every
   * connection) or it is lost, it gets the refusal a closed transport gives (T1, MC-10).
   */
  async function answerOf<T>(
    on: OnConnection,
    send: (transport: McpTransport) => Promise<Outcome<T, TransportFailure>>,
  ): Promise<Outcome<T, TransportFailure>> {
    const wire = on.ensured.wire()
    if ('failure' in wire) return wire
    const asked = ask(() => send(wire.ok), ABANDONED)
    const answered = await within(asked, startBound(on.ensured.bound, 'task'), scope)
    return answered.kind === 'answered' ? answered.value : ABANDONED
  }

  /**
   * The failure of a task request (S2, R7): `not-sent` is the connection failure, `no-answer` is
   * `effect-unknown` with the same cause, a JSON-RPC error and an unreadable answer are passed on.
   * A failure that says the connection is lost (`lostOf`: the transport is not usable any more, or
   * the authorization was refused) goes to the table first (`loseIfLost`); its teardown goes on in
   * the table's scope. Any other failure leaves the connection as it is.
   */
  function failureOf(ensured: Ensured, failure: TransportFailure): OperationFailure {
    loseIfLost(table, ensured, failure)
    switch (failure.kind) {
      case 'not-sent':
        return connectionFailureOf(failure)
      case 'no-answer':
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
   * Steps 2–4 of MC-17, up to the transport's answer: nothing after the shutdown (S8); the
   * connection, reused or built; then the request, which goes out only while the connection takes
   * requests (as MC-16 step 8). A reused connection goes from the look at the shutdown to the
   * request without a wait. A request the bound cuts off has no answer; a transport that breaches
   * its contract gave none either (T9).
   */
  async function exchange<T>(
    access: Access<P>,
    task: TaskRef,
    record: TaskRecord,
    send: (transport: McpTransport) => Promise<Outcome<T, TransportFailure>>,
  ): Promise<Answered<T> | Unsent | Shut> {
    if (table.isShut()) return SHUT
    const reused = reusedOf(access, task, record)
    const connection = reused === undefined ? await built(access, task, record) : succeed(reused)
    if ('failure' in connection) return { unsent: connection.failure }
    const on: OnConnection = { ensured: connection.ok, record }
    const answer = await answerOf(on, send)
    if ('failure' in answer && answer.failure.kind === 'not-sent')
      return { unsent: failureOf(on.ensured, answer.failure) }
    return { on, answer }
  }

  /**
   * The answer of a task request (MC-17), read from the state of the moment it comes back. A
   * request not sent once the shutdown began is S8's `effect-unknown` (`no-connection`), whatever
   * step or transport refused it, so an operation in flight at `closeAll` answers as one that
   * started after it. A request on the wire answers what the transport answered; `read` turns
   * that into the operation's answer outside `ask` (MC-15).
   */
  function outcomeOf<T, R>(
    exchanged: Answered<T> | Unsent | Shut,
    read: (answer: T, on: OnConnection) => R,
  ): Outcome<R, OperationFailure> {
    if (exchanged === SHUT || ('unsent' in exchanged && table.isShut())) return fail(NO_CONNECTION)
    if ('unsent' in exchanged) return fail(exchanged.unsent)
    const { on, answer } = exchanged
    if ('failure' in answer) return fail(failureOf(on.ensured, answer.failure))
    return succeed(read(answer.ok, on))
  }

  /**
   * One task request of the initiator (S2, S8, MC-17): the initiator and the task as it was
   * issued first (a reference with another generation is not this task; a key two accounts
   * answered on names none), then the exchange, then the one answer. `send` is the port call
   * alone.
   */
  async function request<T, R>(
    access: Access<P>,
    task: TaskRef,
    send: (transport: McpTransport) => Promise<Outcome<T, TransportFailure>>,
    read: (answer: T, on: OnConnection) => R,
  ): Promise<Outcome<R, OperationFailure>> {
    const record = tasks.get(keyOf(access, task))
    if (record === undefined || record.issuedAt !== task.issuedAt) return fail(UNKNOWN)
    return outcomeOf(await exchange(access, task, record, send), read)
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
      request(access, task, transport => transport.getTask(task.taskId), asIs),
    taskResult: (access, task) =>
      request(access, task, transport => transport.getTaskResult(task.taskId), resultOf),
    provideTaskInput: async (access, task, inputResponses: JsonValue) => {
      const responses = judgedTree(inputResponses, 'the input responses of an MCP task')
      return request(access, task, transport => transport.updateTask(task.taskId, responses), asIs)
    },
    cancelTask: (access, task) =>
      request(access, task, transport => transport.cancelTask(task.taskId), asIs),
  }
}
