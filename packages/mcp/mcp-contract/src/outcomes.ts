// Call outcomes, refusals and not-sent reasons. "Not sent" and "sent" are separate types: a call
// that was not sent has no effect at the peer; a sent call with no answer has an unknown effect.
import type { ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Generation, RequestState, TaskId } from './brands.ts'
import type { Untrusted } from './values.ts'

/** Why one content item of the peer is not delivered as it is. The set is closed. */
export type ContentDefect =
  | 'not-an-object'
  | 'type-missing'
  | 'type-unknown'
  | 'text-invalid'
  | 'data-invalid'
  | 'mime-type-invalid'
  | 'uri-invalid'
  | 'name-invalid'
  | 'resource-invalid'
  | 'annotations-invalid'

/**
 * One item of peer content, in peer order. A common content block carries text, an image or
 * audio. Protocol content that a common block cannot carry keeps its protocol type and is not
 * rewritten as text. An invalid item becomes a text block that names its type and the reason.
 */
export type DeliveredContent =
  | Readonly<{
      kind: 'block'
      block: ContentBlock
      annotations?: Untrusted<JsonValue>
      meta?: JsonValue
    }>
  | Readonly<{
      kind: 'protocol'
      type: 'resource_link' | 'resource'
      item: JsonValue
      annotations?: Untrusted<JsonValue>
    }>
  | Readonly<{ kind: 'invalid'; type?: string; reason: ContentDefect; block: TextContentBlock }>

/** The conclusion about the structured content against the output schema of the action. */
export type OutputCheck =
  | Readonly<{ kind: 'conforms' }>
  | Readonly<{ kind: 'violates'; reason: string }>
  | Readonly<{ kind: 'no-schema' }>

/**
 * Checks structured content against an output schema. The caller injects it: this member has
 * no JSON Schema validator. It is called only when the action declares an output schema and the
 * result carries structured content, and its answer is the output check of the outcome.
 */
export type OutputValidator = (structured: JsonValue, outputSchema: JsonValue) => OutputCheck

/** Why a sent call has no answer. */
export type NoAnswerCause = 'stream-broken' | 'process-exited' | 'abandoned'

/** What the peer answered to a sent request, or that no answer came. */
export type PeerAnswer =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause }>

/** A protocol error. It does not prove that the call had no effect. */
export type ProtocolFault =
  | Readonly<{ kind: 'peer-error'; code: number; message: string; data?: JsonValue }>
  | Readonly<{ kind: 'result-type-unknown'; resultType: string }>
  | Readonly<{ kind: 'result-malformed' }>
  | Readonly<{ kind: 'error-malformed' }>

/** The outcome of a call that was sent. */
export type CallOutcome =
  | Readonly<{
      kind: 'complete'
      content: readonly DeliveredContent[]
      structured?: JsonValue
      output: OutputCheck
    }>
  | Readonly<{ kind: 'toolError'; content: readonly DeliveredContent[]; structured?: JsonValue }>
  | Readonly<{
      kind: 'inputRequired'
      inputRequests?: Untrusted<JsonValue>
      requestState?: RequestState
      issuedAt: Generation
    }>
  | (Readonly<{ kind: 'task'; taskId: TaskId; issuedAt: Generation }> & TaskHints)
  | Readonly<{ kind: 'protocolError'; fault: ProtocolFault }>
  | Readonly<{ kind: 'unknown'; cause: NoAnswerCause }>

export type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'

/**
 * The hints of a task, as the peer wrote them on the task handle or on `tasks/get`. A `ttlMs` of
 * `null` means unlimited and is left out. A hint that is not of its type is left out: the poll
 * interval and the ttl are non-negative safe integers, the status message is text.
 */
export type TaskHints = Readonly<{
  pollIntervalMs?: number
  ttlMs?: number
  statusMessage?: Untrusted<string>
}>

/** The state of a task, and the input requests it waits for when it is `input_required`. */
export type TaskReport = Readonly<{ status: TaskStatus; inputRequests?: Untrusted<JsonValue> }> &
  TaskHints

/** A refusal reason that a use-eligibility answer gives only to a principal with eligibility. */
export type BlockedReason = 'local-command-not-enabled' | 'disabled'

/**
 * What the peer said when it required authorization. `metadata` tells whether the protected
 * resource metadata was fetched; `resourceMetadata` is present only when it was. MCP runs no
 * authorization flow.
 */
export type AuthorizationDiscovery = Readonly<{
  resourceMetadataUrl: string
  metadata: 'fetched' | 'unavailable'
  resourceMetadata?: Untrusted<JsonValue>
  issuers: readonly string[]
  scopes: readonly string[]
}>

/** A setting or a process variable that an operation needs. */
export type ConfigItem = 'connect-timeout' | 'target' | 'credential' | `env.${string}`

/**
 * The refusal of a read, control or call operation before any connection is used. Not adopted,
 * not eligible and not existing are one answer, `not-available-to-you`.
 */
export type Refusal =
  | Readonly<{ kind: 'not-available-to-you' }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'config-missing'; item: ConfigItem }>
  | Readonly<{ kind: 'config-invalid'; item: Exclude<ConfigItem, `env.${string}`> }>

/** A connection condition that kept an operation from reaching the peer. */
export type ConnectionFailure =
  | Readonly<{ kind: 'credential-unavailable'; cause: 'missing' | 'rejected' | 'unknown' }>
  | Readonly<{ kind: 'authorization-required'; discovery: AuthorizationDiscovery }>
  | Readonly<{ kind: 'landing-unavailable' }>
  | Readonly<{ kind: 'connection-unavailable' }>

/** A request that left and was answered with a JSON-RPC error. */
export type ErrorAnswer = Readonly<{
  kind: 'error-answer'
  code: number
  message: string
  data?: JsonValue
}>

/**
 * A request that left and got no answer, so its effect is unknown, or a task operation that has
 * neither a connection nor the adopted material to build one (`no-connection`).
 */
export type EffectUnknown = Readonly<{
  kind: 'effect-unknown'
  cause: NoAnswerCause | 'no-connection'
}>

/**
 * A request that left and was answered with something the transport cannot read in the shape that
 * SPEC names for that request. `what` says which part is wrong.
 */
export type AnswerMalformed = Readonly<{
  kind: 'answer-malformed'
  what:
    | 'status-unknown'
    | 'input-requests-missing'
    | 'result-missing'
    | 'error-missing'
    | 'error-shape'
    | 'tools-missing'
    | 'cursor-invalid'
    | 'discover-shape'
}>

/** The failure of a read, status or task operation that may need a connection. */
export type OperationFailure =
  | Refusal
  | ConnectionFailure
  | EffectUnknown
  | ErrorAnswer
  | AnswerMalformed

/** The failure of an operation that does not send a request: `current` and `peer`. */
export type ReadFailure = Exclude<
  OperationFailure,
  Readonly<{ kind: 'effect-unknown' | 'error-answer' | 'answer-malformed' }>
>

/** Why a call was not sent. The set is closed. A call that was not sent has no peer effect. */
export type NotSentReason =
  | Refusal
  | Readonly<{ kind: 'correlation-key-in-use' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'definition-changed' }>
  | Readonly<{ kind: 'action-unavailable' }>
  | ConnectionFailure

export type InvokeResult =
  | Readonly<{ kind: 'not-sent'; reason: NotSentReason }>
  | Readonly<{ kind: 'sent'; outcome: CallOutcome }>
