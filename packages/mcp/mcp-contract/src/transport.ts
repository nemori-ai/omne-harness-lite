// The group port of one MCP transport, and the transport factory. Implementations speak the
// protocol; they hand over the answer of the peer and do not classify it. No SDK type is part of
// this port.
import type { JsonValue } from '@omne-harness/json-text'
import type { AuthorizationDiscovery, NoAnswerCause, PeerAnswer, TaskStatus } from './outcomes.ts'
import type {
  ActionName,
  CallMode,
  ConnectionTarget,
  Generation,
  PeerIdentity,
  RequestState,
  TaskId,
  Untrusted,
} from './values.ts'
import type { CredentialHandle, ProcessHandle } from './ports.ts'
import type { Outcome } from '@omne-harness/operation-result'

/**
 * A transport failure. `not-sent` means the request did not leave, so it had no peer effect.
 * `no-answer` means it left and no answer came, so its effect is unknown.
 */
export type TransportFailure =
  | Readonly<{ kind: 'not-sent'; cause: 'connection-unavailable' }>
  | Readonly<{
      kind: 'not-sent'
      cause: 'authorization-required'
      discovery: AuthorizationDiscovery
    }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>

/** One page of `tools/list`, as the peer wrote it. Each tool is the peer object. */
export type ListingPage = Readonly<{
  tools: readonly JsonValue[]
  nextCursor?: string
  ttlMs?: number
}>

/** A request to call one peer action. A continuation carries the answers to an input request. */
export type CallRequest = Readonly<{
  action: ActionName
  args: JsonValue
  mode: CallMode
  continuation?: Readonly<{ requestState?: RequestState; inputResponses: JsonValue }>
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
  getTask(taskId: TaskId): Promise<Outcome<TaskStatus | 'expired', TransportFailure>>
  getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>>
  cancelTask(taskId: TaskId): Promise<Outcome<'requested' | 'already-terminal', TransportFailure>>
  /** Closes the transport. It does not stop a process; the holder of the process handle does. */
  close(): Promise<void>
}

/** The material that one transport opens on. Both kinds carry the connection generation. */
export type TransportMaterial =
  | Readonly<{ kind: 'stdio'; process: ProcessHandle; generation: Generation }>
  | Readonly<{
      kind: 'streamable-http'
      target: ConnectionTarget
      credential?: CredentialHandle
      generation: Generation
    }>

export interface McpTransportFactory {
  open(
    material: TransportMaterial,
    signal: AbortSignal,
  ): Promise<Outcome<McpTransport, TransportFailure>>
}
