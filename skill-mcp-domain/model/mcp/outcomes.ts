// MCP 限界上下文：调用结局、未发出原因、读面拒绝。
// 「未发出」与「已发出」在类型上分开：未发出没有对端效果，已发出的 unknown 表示效果未知。

import type { ContentBlock, JsonValue } from '../shared.ts'
import type { AuthorizationDiscovery, BlockedReason } from './ports.ts'
import type { Generation, RequestState, TaskId } from './values.ts'

/** 公共 ContentBlock 表达不了的协议内容，原样带协议类型交出，不改写成文本。 */
export type DeliveredContent =
  | Readonly<{ kind: 'block'; block: ContentBlock }>
  | Readonly<{ kind: 'protocol'; type: string; raw: JsonValue }>

export type OutputCheck =
  | Readonly<{ kind: 'conforms' }>
  | Readonly<{ kind: 'violates'; reason: string }>
  | Readonly<{ kind: 'no-schema' }>

export type CallOutcome =
  | Readonly<{ kind: 'complete'; content: readonly DeliveredContent[]; structured?: JsonValue; output: OutputCheck }>
  | Readonly<{ kind: 'toolError'; content: readonly DeliveredContent[] }>
  | Readonly<{ kind: 'inputRequired'; inputRequests: JsonValue; requestState: RequestState; issuedAt: Generation }>
  | Readonly<{ kind: 'task'; taskId: TaskId; issuedAt: Generation }>
  | Readonly<{ kind: 'protocolError'; code: number; message: string }> // 不证明没有效果
  | Readonly<{ kind: 'unknown'; cause: 'stream-broken' | 'process-exited' | 'abandoned' }>

export type TaskStatus = 'working' | 'input_required' | 'completed' | 'failed' | 'cancelled'

/** 读面与调用口共用的识别结果：未采用、无权、不存在三者不可区分。 */
export type Refusal =
  | Readonly<{ kind: 'not-available-to-you' }>
  | Readonly<{ kind: 'blocked'; reason: BlockedReason }>
  | Readonly<{ kind: 'unknown' }>

export type NotSentReason =
  | Refusal
  | Readonly<{ kind: 'correlation-key-in-use' }>
  | Readonly<{ kind: 'cancelled' }> // 占位后、发出前被 cancel
  | Readonly<{ kind: 'definition-changed' }>
  | Readonly<{ kind: 'action-unavailable' }>
  | Readonly<{ kind: 'mode-unsupported' }>
  | Readonly<{ kind: 'credential-unavailable'; cause: 'missing' | 'rejected' | 'unknown' }>
  | Readonly<{ kind: 'authorization-required'; discovery: AuthorizationDiscovery }>
  | Readonly<{ kind: 'landing-unavailable' }>
  | Readonly<{ kind: 'connection-unavailable' }>
  | Readonly<{ kind: 'config-missing'; item: 'connect-timeout' | 'target' }>

export type InvokeResult =
  | Readonly<{ kind: 'not-sent'; reason: NotSentReason }>
  | Readonly<{ kind: 'sent'; outcome: CallOutcome }>
