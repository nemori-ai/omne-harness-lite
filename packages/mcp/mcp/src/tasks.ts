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

const SHUT = 'shut'
type Shut = typeof SHUT

type OnConnection = Readonly<{ ensured: Ensured; record: TaskRecord }>

type Unsent = Readonly<{ unsent: OperationFailure }>

type Answered<T> = Readonly<{ on: OnConnection; answer: Outcome<T, TransportFailure> }>

const asIs = <T>(answer: T): T => answer

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

  function reusedOf(access: Access<P>, task: TaskRef, record: TaskRecord): Ensured | undefined {
    const account = accountTextOf(record.account)
    return table
      .currentOf(access.tenant, task.ref.holding)
      .find(ensured => accountTextOf(ensured.key.account) === account)
  }

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
