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
import type { HttpCredentialHandle } from './ports.ts'
import type { PeerIdentity, Untrusted } from './values.ts'
import type { Outcome } from '@omne-harness/operation-result'

export type TransportFailure =
  | Readonly<{ kind: 'not-sent'; cause: 'connection-unavailable'; unusable?: UnusableCause }>
  | Readonly<{ kind: 'not-sent'; cause: 'session-ended'; unusable?: 'session-ended' }>
  | Readonly<{
      kind: 'not-sent'
      cause: 'authorization-required'
      discovery: AuthorizationDiscovery
    }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; unusable?: UnusableCause }>
  | ErrorAnswer
  | AnswerMalformed

export type WithheldReason = 'header-invalid'

export type ListingPage = Readonly<{
  tools: readonly JsonValue[]
  nextCursor?: string
  ttlMs?: number
  withheld?: readonly Readonly<{ name: Untrusted<string>; reason: WithheldReason }>[]
}>

export type CallRequest = Readonly<{
  action: ActionName
  args: JsonValue
  continuation?: Readonly<{ requestState?: RequestState; inputResponses?: JsonValue }>
}>

export type PeerNotification = Readonly<{
  kind: 'progress' | 'log'
  notification: Untrusted<JsonValue>
}>

export type SentCall = Readonly<{ requestId: string; answer: Promise<PeerAnswer> }>

export type TaskAnswer =
  | Readonly<{ kind: 'finished'; answer: Extract<PeerAnswer, { kind: 'result' | 'error' }> }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'not-finished' }>
  | Readonly<{ kind: 'expired' }>

/** What a long request listens for; the peer may agree to less, and says so first. */
export type ListenFilter = Readonly<{ toolsListChanged: boolean }>

export type ListenEvent =
  | Readonly<{ kind: 'acknowledged'; agreed: ListenFilter }>
  | Readonly<{ kind: 'tools-changed' }>

/** How a long request ends; it is never settled as a failed request, and a broken one is opened again by its opener. */
export type ListenEnd =
  | Readonly<{ kind: 'stopped' }>
  | Readonly<{ kind: 'broken' }>
  | Readonly<{ kind: 'ended' }>
  | Readonly<{ kind: 'refused'; failure: TransportFailure }>

export interface McpTransport {
  readonly generation: Generation
  discover(): Promise<Outcome<PeerIdentity, TransportFailure>>
  listActions(cursor?: string): Promise<Outcome<ListingPage, TransportFailure>>
  call(
    request: CallRequest,
    signal: AbortSignal,
    observe?: (notification: PeerNotification) => void,
  ): Promise<Outcome<SentCall, Extract<TransportFailure, { kind: 'not-sent' }>>>
  cancelRequest(requestId: string): Promise<void>
  getTask(taskId: TaskId): Promise<Outcome<TaskReport | 'expired', TransportFailure>>
  updateTask(
    taskId: TaskId,
    inputResponses: JsonValue,
  ): Promise<Outcome<'accepted', TransportFailure>>
  getTaskResult(taskId: TaskId): Promise<Outcome<TaskAnswer, TransportFailure>>
  cancelTask(taskId: TaskId): Promise<Outcome<'requested', TransportFailure>>
  /** A long request: `subscriptions/listen`, on a connection of the 2026-07-28 revision only. */
  listen?(
    filter: ListenFilter,
    signal: AbortSignal,
    observe: (event: ListenEvent) => void,
  ): Promise<ListenEnd>
  close(): Promise<void>
}

export type TransportMaterial = Readonly<{
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
