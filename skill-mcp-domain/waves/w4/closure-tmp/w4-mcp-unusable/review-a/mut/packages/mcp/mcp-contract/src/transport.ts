// The group port of one MCP transport, and the transport factory. Implementations speak the
// protocol; they hand over the answer of the peer and do not classify it. No SDK type is part of
// this port.
import type { JsonValue } from '@omne-harness/json-text'
import type { ActionName, ConnectionTarget, Generation, RequestState, TaskId } from './brands.ts'
import type {
  AnswerMalformed,
  AuthorizationDiscovery,
  ErrorAnswer,
  NoAnswerCause,
  PeerAnswer,
  TaskReport,
  UnusableCause,
} from './outcomes.ts'
import type { HttpCredentialHandle, ProcessHandle } from './ports.ts'
import type { PeerIdentity, Untrusted } from './values.ts'
import type { Outcome } from '@omne-harness/operation-result'

/**
 * A transport failure, by its peer effect. `not-sent`: the request did not take effect at the
 * peer; a refused authorization (HTTP 401 or 403) and an ended legacy session are such.
 * `no-answer`: the request left and no answer came, so its effect is unknown. `error-answer`: the request left and the peer
 * answered with a JSON-RPC error. `answer-malformed`: the request left and the answer is not in
 * the shape named for that request.
 *
 * `unusable` (T1) is present when the transport was not usable any more as it handed over this
 * answer, with the cause; absent, the transport is still usable. Only the failures a gone line
 * gives carry it: a refused authorization, a JSON-RPC error and an unreadable answer do not.
 */
export type TransportFailure =
  | Readonly<{ kind: 'not-sent'; cause: 'connection-unavailable'; unusable?: UnusableCause }>
  /** Streamable HTTP, legacy revision: the peer answered 404 to the session of the connection. */
  | Readonly<{ kind: 'not-sent'; cause: 'session-ended'; unusable?: UnusableCause }>
  | Readonly<{
      kind: 'not-sent'
      cause: 'authorization-required'
      discovery: AuthorizationDiscovery
    }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; unusable?: UnusableCause }>
  | ErrorAnswer
  | AnswerMalformed

/** Why the transport withheld a tool from a page. The set is closed. */
export type WithheldReason = 'header-invalid'

/**
 * One page of `tools/list`, as the peer wrote it. Each tool is the peer object. `withheld` lists
 * the tools that the transport took out before handing over the page: on Streamable HTTP, a tool
 * whose `x-mcp-header` declaration is invalid.
 */
export type ListingPage = Readonly<{
  tools: readonly JsonValue[]
  nextCursor?: string
  ttlMs?: number
  withheld?: readonly Readonly<{ name: Untrusted<string>; reason: WithheldReason }>[]
}>

/**
 * A request to call one peer action. `args` is a JSON object (`isActionArgs`). `args` and
 * `continuation.inputResponses` are value trees that passed `judgeJsonValue`. A continuation
 * carries the request state, the answers to an input request, or both. Whether the peer answers
 * with a task is the peer's decision for each request.
 */
export type CallRequest = Readonly<{
  action: ActionName
  args: JsonValue
  continuation?: Readonly<{ requestState?: RequestState; inputResponses?: JsonValue }>
}>

/** A progress or log notification of the peer. It is process information, never an outcome. */
export type PeerNotification = Readonly<{
  kind: 'progress' | 'log'
  notification: Untrusted<JsonValue>
}>

/** A sent call: the request identifier and the answer that will come. */
export type SentCall = Readonly<{ requestId: string; answer: Promise<PeerAnswer> }>

/** What `tasks/get` says about the result of a task. */
export type TaskAnswer =
  | Readonly<{ kind: 'finished'; answer: PeerAnswer }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'not-finished' }>
  | Readonly<{ kind: 'expired' }>

export interface McpTransport {
  /** The connection generation that this transport belongs to. */
  readonly generation: Generation
  /** Negotiates with the peer. On a peer of an earlier revision it falls back to `initialize`. */
  discover(): Promise<Outcome<PeerIdentity, TransportFailure>>
  listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>>
  /** Sends one call. The failure is always `not-sent`; a missing answer comes as `no-answer`. */
  call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>>
  /** Sends a cancel notification for a sent request. It does not prove that the peer stopped. */
  cancelRequest(requestId: string): Promise<void>
  /** `tasks/get`: the task status, with the input requests of an `input_required` task. */
  getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>>
  /**
   * `tasks/update`: hands the answers to the input requests of a task to the peer. The answers
   * are a value tree that passed `judgeJsonValue`.
   */
  updateTask(
    taskId: TaskId,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', TransportFailure>>
  getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>>
  /** `tasks/cancel`: an acknowledgement only. A terminal state is learned through `getTask`. */
  cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>>
  /** Closes the transport. It does not stop a process; the holder of the process handle does. */
  close(): Promise<void>
}

/**
 * The material that one transport opens on. Both kinds carry the connection generation and the
 * byte bound of the peer instructions, which `discover` applies with `boundInstructions`.
 */
export type TransportMaterial =
  | Readonly<{
      kind: 'stdio'
      process: ProcessHandle
      generation: Generation
      instructionsByteLimit: number
    }>
  | Readonly<{
      kind: 'streamable-http'
      target: ConnectionTarget
      credential?: HttpCredentialHandle
      generation: Generation
      instructionsByteLimit: number
    }>

export interface McpTransportFactory {
  open(
    material: TransportMaterial,
    signal: AbortSignal,
  ): Promise<Outcome<McpTransport, TransportFailure>>
}
