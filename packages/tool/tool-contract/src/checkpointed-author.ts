import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ToolAskRequest,
  ToolDecision,
  ToolPrimitiveFailure,
  ToolProcessEmitter,
} from './author-context.ts'
import type { ToolSchemaIdentity } from './definitions.ts'
import type { Adoption } from './identity.ts'

export interface ToolSegmentContext extends ToolProcessEmitter {
  readonly signal: AbortSignal
}

export type AuthorWait = ToolAskRequest<unknown>

export const CLOSED_RESULT_MAX_BYTES = 1024

export type AuthorSegment<S, R> =
  | Readonly<{ kind: 'completed'; value: R }>
  | Readonly<{ kind: 'suspended'; state: S; wait: AuthorWait; closedResult: string }>

export const CHECKPOINT_STATE_MAX_BYTES = 262_144

export type ToolCheckpointDeclaration = Readonly<{
  schema: ToolSchemaIdentity
  codec: Adoption
  maxBytes: number
}>

export interface CheckpointedToolExecutor<A, R, E> {
  readonly checkpoint: ToolCheckpointDeclaration
  initial(
    argumentsValue: A,
    environment: E,
    context: ToolSegmentContext,
  ): Promise<Outcome<AuthorSegment<Uint8Array, R>, ToolPrimitiveFailure>>
  resume(
    input: Readonly<{ checkpoint: Uint8Array; response: ToolDecision<unknown> }>,
    environment: E,
    context: ToolSegmentContext,
  ): Promise<Outcome<AuthorSegment<Uint8Array, R>, ToolPrimitiveFailure>>
}

export function authorDecision(decision: ToolDecision<JsonValue>): ToolDecision<unknown> {
  if (decision.kind !== 'answer') return decision
  return { kind: 'answer', value: JSON.parse(writeJsonText(decision.value)) as unknown }
}
