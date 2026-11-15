import type { ContentBlock, TextContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Generation, RequestState, TaskId } from './brands.ts'
import type { Untrusted } from './values.ts'

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

export type OutputCheck =
  | Readonly<{ kind: 'conforms' }>
  | Readonly<{ kind: 'violates'; reason: string }>
  | Readonly<{ kind: 'no-schema' }>

export const STRUCTURED_CONTENT_MISSING = 'structured-content-missing'
export const OUTPUT_CHECK_FAILED = 'output-check-failed'

export type OutputValidator = (structured: JsonValue, outputSchema: JsonValue) => OutputCheck

export type NoAnswerCause = 'stream-broken' | 'process-exited' | 'abandoned'

export type UnusableCause = 'stream-broken' | 'process-exited' | 'session-ended'

export type PeerAnswer =
  | Readonly<{ kind: 'result'; result: JsonValue }>
  | Readonly<{ kind: 'error'; error: JsonValue }>
  | Readonly<{ kind: 'no-answer'; cause: NoAnswerCause; unusable?: UnusableCause }>

export type ProtocolFault =
  | Readonly<{ kind: 'peer-error'; code: number; message: string; data?: JsonValue }>
  | Readonly<{ kind: 'result-type-unknown'; resultType: string }>
  | Readonly<{ kind: 'result-malformed' }>
  | Readonly<{ kind: 'error-malformed' }>

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

export type TaskHints = Readonly<{
  pollIntervalMs?: number
  ttlMs?: number
  statusMessage?: Untrusted<string>
}>

export type TaskReport = Readonly<{ status: TaskStatus; inputRequests?: Untrusted<JsonValue> }> &
  TaskHints

export type BlockedReason = 'local-command-not-enabled' | 'disabled'

export type AuthorizationDiscovery = Readonly<{
  resourceMetadataUrl: string
  metadata: 'fetched' | 'unavailable'
  resourceMetadata?: Untrusted<JsonValue>
  issuers: readonly string[]
  scopes: readonly string[]
}>

export type ConfigItem = 'connect-timeout' | 'target' | 'credential' | `env.${string}`

export type Refusal =
  | Readonly<{ kind: 'not-available-to-you' }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'config-missing'; item: ConfigItem }>
  | Readonly<{ kind: 'config-invalid'; item: Exclude<ConfigItem, `env.${string}`> }>

export type ConnectionFailure =
  | Readonly<{ kind: 'credential-unavailable'; cause: 'missing' | 'rejected' | 'unknown' }>
  | Readonly<{ kind: 'authorization-required'; discovery: AuthorizationDiscovery }>
  | Readonly<{ kind: 'landing-unavailable' }>
  | Readonly<{ kind: 'connection-unavailable' }>

export type ErrorAnswer = Readonly<{
  kind: 'error-answer'
  code: number
  message: string
  data?: JsonValue
}>

export type EffectUnknown = Readonly<{
  kind: 'effect-unknown'
  cause: NoAnswerCause | 'no-connection'
}>

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

export type OperationFailure =
  | Refusal
  | ConnectionFailure
  | EffectUnknown
  | ErrorAnswer
  | AnswerMalformed

export type ReadFailure = Exclude<
  OperationFailure,
  Readonly<{ kind: 'effect-unknown' | 'error-answer' | 'answer-malformed' }>
>

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
