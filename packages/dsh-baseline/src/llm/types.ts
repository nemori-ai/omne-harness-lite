/** Provider-neutral message and streaming vocabulary selected from dsh-llm. */

import type { Branded } from '../support/brand.ts'
import type { FileAttachmentRef, ImageAttachmentRef } from '../media/index.ts'
import type { ProviderRequestId, ReasoningEffortId, ToolCallId } from './brand.ts'
import type { Message } from './message.ts'

export type {
  AssistantMessage,
  AssistantProvenance,
  ContextSnapshotSection,
  Message,
  MessageSource,
  MessageSourceMap,
  ModelMessageSource,
  SystemMessage,
  ToolMessageSource,
  ToolResultMessage,
  UserMessage,
} from './message.ts'

/** Serializable provider or transport failure facts; policy decides whether they are retryable. */
export interface LlmFailure {
  readonly message: string
  readonly code: string
  readonly status?: number
  readonly providerRetryAfterMs?: number
  readonly requestId?: ProviderRequestId
}

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ReasoningBlock {
  type: 'reasoning'
  text: string
}

export interface ImageBlock {
  type: 'image'
  attachment: ImageAttachmentRef
}

export interface FileBlock {
  type: 'file'
  attachment: FileAttachmentRef
}

export interface ToolCallBlock {
  type: 'tool-call'
  id: ToolCallId
  name: string
  arguments: string
}

export interface ToolResultBlock {
  type: 'tool-result'
  toolCallId: ToolCallId
  content: ContentBlock[]
  isError?: boolean
}

/** Merge-extensible source block map retained for baseline consumers. */
export interface ContentBlockMap {
  text: TextBlock
  reasoning: ReasoningBlock
  image: ImageBlock
  file: FileBlock
  'tool-call': ToolCallBlock
  'tool-result': ToolResultBlock
}

export type ContentBlockType = keyof ContentBlockMap
export type ContentBlock = ContentBlockMap[ContentBlockType]

export interface FinishReasonMap {
  stop: { kind: 'stop' }
  'tool-calls': { kind: 'tool-calls' }
  'max-tokens': { kind: 'max-tokens' }
  aborted: { kind: 'aborted'; failure: LlmFailure }
  error: { kind: 'error'; failure: LlmFailure }
}

export type FinishReason = FinishReasonMap[keyof FinishReasonMap]

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

/** Opaque adapter replay state aligned to emitted blocks when block metadata is present. */
export interface ReplayEnvelope {
  response: unknown
  blocks?: readonly unknown[]
}

export type StreamChunk =
  | { type: 'block-start'; index: number; blockType: ContentBlockType }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: ToolCallId; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: ContentBlock }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'finish'; reason: FinishReason; replayState?: ReplayEnvelope }

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Source adapter declaration for applying a changed system prompt in history. */
export type SystemPromptUpdate = 'in-history'

/** Source request envelope only; the selected baseline contains no dispatching adapter. */
export interface GenerateOptions {
  provider: string
  model: string
  reasoningEffort?: ReasoningEffortId
  messages: Message[]
  system?: string
  tools?: ToolSchema[]
  temperature?: number
  maxTokens?: number
  stop?: string[]
  signal?: AbortSignal
  sessionId?: Branded<'SessionId'>
  purpose?: 'compaction' | 'session-title'
}
