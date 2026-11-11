// The checkpointed author: an executor that runs in segments (SPEC「恢复型执行者按段执行」).
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

/**
 * What a segment can use while it runs: process output and the stop signal of this execution.
 * It has no `wait`: a segment waits for a person only by returning `suspended`, so no author code
 * runs outside an execution slot while it waits.
 */
export interface ToolSegmentContext extends ToolProcessEmitter {
  readonly signal: AbortSignal
}

/** The one wait a segment may end with. Only Ask is supported. */
export type AuthorWait = ToolAskRequest<unknown>

/** The most UTF-8 bytes the result for a closed wait may take. */
export const CLOSED_RESULT_MAX_BYTES = 1024

/**
 * How a segment ends: with the result of the call, or suspended with the state that the next
 * segment needs and the Ask that it waits for. `closedResult` is the text the call answers with
 * when a control closes that wait before a person answered: the call is interrupted and no later
 * segment runs. The text says what did not happen. It is not an answer of the person.
 */
export type AuthorSegment<S, R> =
  | Readonly<{ kind: 'completed'; value: R }>
  | Readonly<{ kind: 'suspended'; state: S; wait: AuthorWait; closedResult: string }>

/**
 * The checkpoint an author declares: the schema of its state, the codec of the state bytes, and
 * the most bytes one state may take.
 */
export type ToolCheckpointDeclaration = Readonly<{
  schema: ToolSchemaIdentity
  codec: Adoption
  maxBytes: number
}>

/**
 * An executor that runs in segments. `initial` runs once with the arguments of the call. `resume`
 * runs with the committed state of the previous segment and the decision of its wait, and never
 * reruns a segment that completed. The state is already encoded by the declared codec.
 */
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

/**
 * The decision of a wait as a resume segment reads it. The ledger keeps an answer's value as a
 * json-text tree; the author declared plain JSON in its wait contract, so the value is decoded
 * once here. Other decisions carry no value and pass unchanged.
 */
export function authorDecision(decision: ToolDecision<JsonValue>): ToolDecision<unknown> {
  if (decision.kind !== 'answer') return decision
  return { kind: 'answer', value: JSON.parse(writeJsonText(decision.value)) as unknown }
}
