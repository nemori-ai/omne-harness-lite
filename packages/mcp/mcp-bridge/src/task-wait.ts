import { createHash } from 'node:crypto'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  EndpointRef,
  FollowedTask,
  Generation,
  Millis,
  TaskArrival,
  TaskId,
  TaskRef,
  TaskWatch,
} from '@omne-harness/mcp-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { defineSchema, jsonSchemaDefinition } from '@omne-harness/schema-provider'
import type {
  DurableEvidence,
  Reply,
  ToolFailure,
  ToolWaitId,
  WaitRecord,
} from '@omne-harness/tool-contract'
import {
  WAIT_RESPONSE_MAX_BYTES,
  defineToolWaitContract,
  describedAdoption,
  type CallAccess,
  type ToolDecisionBridge,
  type ToolRecovery,
  type ToolValueSchema,
  type ToolWaitContract,
} from '@omne-harness/tool-contract/provider'

export const MCP_TASK_WAIT_OWNER = '@omne-harness/mcp-bridge'

/** Which task a call waits for, and in which round of it: the round moves on each time the task got input. */
export type TaskWait = Readonly<{
  ref: EndpointRef
  taskId: string
  issuedAt: number
  round: number
}>

const string = { type: 'string', minLength: 1 } as const
const closed = (
  properties: Readonly<Record<string, unknown>>,
  optional: readonly string[] = [],
) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties).filter(key => !optional.includes(key)),
  properties,
})
const requestDocument = closed({
  endpoint: string,
  holding: string,
  task: string,
  issuedAt: { type: 'integer', minimum: 0 },
  round: { type: 'integer', minimum: 1 },
})
const responseDocument = {
  anyOf: [
    closed({ kind: { const: 'terminal' }, status: { enum: ['completed', 'failed', 'cancelled'] } }),
    closed({ kind: { const: 'input' }, inputRequests: { type: 'object' } }, ['inputRequests']),
    closed({ kind: { const: 'expired' } }),
    closed({ kind: { const: 'unknown' } }),
  ],
}

const sha256 = (text: string): string => `sha256:${createHash('sha256').update(text).digest('hex')}`
const digestOf = (parts: readonly unknown[]): string => sha256(JSON.stringify(parts))

function valueSchema<T>(
  name: string,
  document: Readonly<Record<string, unknown>>,
  maxBytes: number,
): ToolValueSchema<T> {
  const id = `${MCP_TASK_WAIT_OWNER}/task-wait-${name}`
  return {
    identity: { id, revision: '1', digest: sha256(JSON.stringify(document)) },
    maxBytes,
    ref: defineSchema<T>({
      id,
      load: async () => jsonSchemaDefinition<T>({ document, numbers: 'exact-or-reject' }),
    }),
  }
}

const defined = defineToolWaitContract<unknown, 'ask'>({
  kind: 'ask',
  adoption: describedAdoption({
    owner: MCP_TASK_WAIT_OWNER,
    name: 'task-wait',
    revision: '1',
    changes:
      'A call waits for its task at an MCP endpoint: a terminal status, a question, expiry, or not known.',
  }),
  expiry: 'forbidden',
  background: 'waits',
  request: valueSchema('request', requestDocument, 4096),
  response: valueSchema('response', responseDocument, WAIT_RESPONSE_MAX_BYTES),
})
if ('failure' in defined) throw new TypeError(defined.failure.reason)

/** The wait by which a call follows its task at an MCP endpoint; only the task watcher answers it. */
export const mcpTaskWait: ToolWaitContract<unknown, 'ask'> = defined.ok

const text = (value: string): JsonValue => ({ kind: 'string', value })
const integer = (value: number): JsonValue => ({ kind: 'number', lexeme: String(value) })
const object = (members: Readonly<Record<string, JsonValue>>): JsonValue => ({
  kind: 'object',
  entries: Object.entries(members).map(([key, value]) => ({ key, value })),
})

export function taskWaitRequest(wait: TaskWait): JsonValue {
  return object({
    endpoint: text(wait.ref.name),
    holding: text(wait.ref.holding),
    task: text(wait.taskId),
    issuedAt: integer(wait.issuedAt),
    round: integer(wait.round),
  })
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isCount = (value: unknown, least: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= least

export function readTaskWaitRequest(kept: string): TaskWait | null {
  let value: unknown
  try {
    value = JSON.parse(kept)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const { endpoint, holding, task, issuedAt, round } = value
  if (!isText(endpoint) || !isText(holding) || !isText(task)) return null
  if (!isCount(issuedAt, 0) || !isCount(round, 1)) return null
  const ref = { name: endpoint, holding } as unknown as EndpointRef
  return { ref, taskId: task, issuedAt, round }
}

export function taskRefOf(wait: TaskWait, connectBound?: TaskRef['connectBound']): TaskRef {
  return {
    ref: wait.ref,
    taskId: wait.taskId as TaskId,
    issuedAt: wait.issuedAt as Generation,
    ...(connectBound === undefined ? {} : { connectBound }),
  }
}

const LIMITS = {
  maxBytes: WAIT_RESPONSE_MAX_BYTES,
  maxDepth: 64,
  maxItems: 16_384,
  maxMembers: 4096,
  maxStringLength: WAIT_RESPONSE_MAX_BYTES,
  maxNumberLength: 64,
}

export function taskWaitAnswer(arrival: TaskArrival): JsonValue {
  const kind = text(arrival.kind)
  if (arrival.kind === 'terminal') return object({ kind, status: text(arrival.status) })
  if (arrival.kind === 'input' && arrival.inputRequests !== undefined)
    return object({ kind, inputRequests: arrival.inputRequests.untrusted })
  return object({ kind })
}

const STATUSES: ReadonlySet<unknown> = new Set(['completed', 'failed', 'cancelled'])

/** The answer of a task wait as a resume gets it; anything else is not one this bridge gave out. */
export function readTaskWaitAnswer(value: unknown): TaskArrival | undefined {
  if (!isRecord(value)) return undefined
  const { kind, status, inputRequests } = value
  if (kind === 'terminal' && STATUSES.has(status))
    return { kind, status: status as 'completed' | 'failed' | 'cancelled' }
  if (kind === 'expired' || kind === 'unknown') return { kind }
  if (kind !== 'input') return undefined
  if (inputRequests === undefined) return { kind }
  const tree = readJsonText(JSON.stringify(inputRequests), LIMITS)
  return tree.kind === 'ok' && tree.value.kind === 'object'
    ? { kind, inputRequests: { untrusted: tree.value } }
    : undefined
}

type Facts = Pick<ToolRecovery, 'waits' | 'waitRequest' | 'tasks'>
type Access<P> = CallAccess<P>

export type TaskWaitBridgeInput<P> = Readonly<{
  watch: () => TaskWatch<P> | undefined
  recoveryOf: (access: Access<P>) => Reply<Facts>
  /** How long a connection may take when the endpoint's own connection timeout is not set. */
  connectBound: Millis
}>

const invalid = (field: string, reason: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'invalid', field, reason })
const UNAVAILABLE: Outcome<never, ToolFailure> = fail({
  kind: 'unavailable',
  dependency: MCP_TASK_WAIT_OWNER,
  diagnostic: 'the task of the wait cannot be read',
})

const evidence = (record: string, parts: readonly unknown[]): DurableEvidence => ({
  owner: MCP_TASK_WAIT_OWNER,
  record,
  revision: '1',
  digest: digestOf(parts),
})

export function isTaskWait(record: WaitRecord): boolean {
  return record.intent.schemas.contract.digest === mcpTaskWait.adoption.digest
}

function waitOf(facts: Facts, wait: ToolWaitId): Outcome<TaskWait, ToolFailure> {
  const record = facts.waits.find(item => item.intent.wait === wait)
  if (record === undefined || !isTaskWait(record))
    return invalid('wait', 'the wait is not a task wait of an MCP endpoint')
  const kept = facts.waitRequest
  if (kept === null || kept.wait !== wait) return invalid('request', 'the wait request is not kept')
  const read = readTaskWaitRequest(kept.request)
  return read === null ? invalid('request', 'the kept request names no task') : succeed(read)
}

/** The decision of a wait: there once the task got somewhere in the round the wait is for, and the same after. */
function decisionOf(wait: TaskWait, task: FollowedTask) {
  const { arrival } = task
  const there = task.state === 'arrived' || task.state === 'awaiting'
  if (!there || arrival === undefined || task.round !== wait.round) return null
  const value = taskWaitAnswer(arrival)
  return {
    value,
    evidence: evidence(`task-arrival/${wait.taskId}`, [
      wait.taskId,
      wait.round,
      writeJsonText(value),
    ]),
  }
}

export function createTaskWaitBridge<P>(input: TaskWaitBridgeInput<P>): ToolDecisionBridge<P> {
  const registration = (access: Access<P>, wait: ToolWaitId, task: TaskWait) =>
    evidence(`task-wait/${task.taskId}/${String(task.round)}`, [
      access.call,
      wait,
      task.taskId,
      task.round,
    ])
  const closing = (access: Access<P>, wait: ToolWaitId, terminal: DurableEvidence, cause: string) =>
    evidence(`task-wait-closed/${digestOf([access.call, wait])}`, [
      access.call,
      wait,
      terminal.digest,
      cause,
    ])

  async function waited(access: Access<P>, wait: ToolWaitId) {
    const facts = await input.recoveryOf(access)
    return 'failure' in facts ? facts : waitOf(facts.ok, wait)
  }

  /** Followed as the principal of the call: after a restart, waking the call gives the watcher its principal again. */
  async function followed(access: Access<P>, task: TaskWait) {
    const watch = input.watch()
    if (watch === undefined) return UNAVAILABLE
    const seen = await watch
      .follow(access, taskRefOf(task, input.connectBound))
      .catch(() => undefined)
    return seen === undefined || 'failure' in seen ? UNAVAILABLE : succeed(seen.ok)
  }

  type Inspect = Parameters<ToolDecisionBridge<P>['inspectOperation']>[0]
  const recall = async (request: Inspect, facts: Facts) => {
    const { operation } = request
    const unknown = (diagnostic: string) => ({ kind: 'unknown' as const, operation, diagnostic })
    const duty = facts.tasks.find(
      item => item.kind === 'wait-registration' && item.operation === operation,
    )
    if (duty?.kind !== 'wait-registration')
      return unknown('no wait duty of the call has the operation')
    if (duty.action === 'ensure') {
      const task = waitOf(facts, duty.wait)
      return 'failure' in task
        ? unknown(`the registration cannot be rebuilt: ${task.failure.kind}`)
        : {
            kind: 'committed' as const,
            operation,
            receipt: registration(request, duty.wait, task.ok),
          }
    }
    const closed = facts.waits.find(record => record.intent.wait === duty.wait)
    if (closed?.phase !== 'closed' || closed.cause === 'continued')
      return unknown('the wait of the closing is not closed by a control or a terminal')
    return {
      kind: 'committed' as const,
      operation,
      receipt: closing(request, duty.wait, duty.evidence, closed.cause),
    }
  }

  return {
    ensure: async request => {
      const task = await waited(request, request.wait)
      if ('failure' in task) return task
      await followed(request, task.ok)
      return succeed(registration(request, request.wait, task.ok))
    },
    inspect: async request => {
      const task = await waited(request, request.wait)
      if ('failure' in task) return task
      const seen = await followed(request, task.ok)
      if ('failure' in seen) return seen
      return succeed({
        registration: registration(request, request.wait, task.ok),
        decision: decisionOf(task.ok, seen.ok)?.evidence ?? null,
      })
    },
    resolve: async request => {
      const task = await waited(request, request.wait)
      if ('failure' in task) return task
      const seen = await followed(request, task.ok)
      if ('failure' in seen) return seen
      const decided = decisionOf(task.ok, seen.ok)
      return decided !== null && decided.evidence.digest === request.decision.digest
        ? succeed({ kind: 'answer', value: decided.value })
        : invalid('decision', 'the decision is not where the task of the wait got to')
    },
    invalidate: async request => {
      const task = await waited(request, request.wait)
      const watch = input.watch()
      if ('ok' in task && watch !== undefined)
        await watch
          .drop(request, taskRefOf(task.ok, input.connectBound), request.cause === 'cancelled')
          .catch(() => undefined)
      return succeed(closing(request, request.wait, request.terminal, request.cause))
    },
    inspectOperation: async request => {
      const facts = await input.recoveryOf(request)
      if ('ok' in facts) return succeed(await recall(request, facts.ok))
      const diagnostic = `the call cannot be read: ${facts.failure.kind}`
      return succeed({ kind: 'unknown', operation: request.operation, diagnostic })
    },
  }
}
