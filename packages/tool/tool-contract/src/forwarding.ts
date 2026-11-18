import type { JsonValue } from '@omne-harness/json-text'
import type { FixedToolRequest } from './definitions.ts'
import type { Access, Adoption, CallAccess, ToolCallId, ToolOperationId } from './identity.ts'
import type {
  InvocationAccess,
  ToolInvokeRequest,
  ToolDefiniteFailure,
  ToolInvokeOutcome,
} from './operations.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Reply } from './results.ts'

export type ToolForwardParent<P> = CallAccess<P> &
  Readonly<{
    start: Extract<ToolStartRecord, { kind: 'start' }>
    request: FixedToolRequest
  }>
export type ToolForwardIntent = Readonly<{
  name: string
  command: string | null
  arguments: JsonValue
}>
/** The action one tool call really performs: the tool it names, with the command and arguments it runs. */
export type ToolActionTarget = Readonly<{
  name: string
  definition: Adoption
  command: string | null
  effectiveArguments: string
}>
/**
 * A call is its own action (the tool it names, as described before admission), or it carries the
 * action of a target it names; the carrier is then kept.
 */
export type ToolCallAction =
  | Readonly<{ kind: 'own' }>
  | Readonly<{
      kind: 'carried'
      carrier: Readonly<{ name: string; definition: Adoption }>
      target: ToolActionTarget
    }>
/**
 * Which action a call performs, answered by Tool before the call is made. A carried call naming a
 * target that is not there, a command the target lacks or arguments of the wrong shape answers
 * `invalid`.
 */
export interface ToolActionResolution<P> {
  resolve(
    input: Access<P> & Readonly<{ name: string; effectiveArguments: string }>,
  ): Reply<ToolCallAction>
}
export type ToolForwardBinding = Readonly<{
  call: ToolCallId
  admission: ToolOperationId
  request: FixedToolRequest
  recovered: boolean
}>
export type ToolForwardSourceOutcome =
  | (Readonly<{ kind: 'bound' }> & ToolForwardBinding)
  | Readonly<{ kind: 'issuance-unknown'; call: ToolCallId; admission: ToolOperationId }>
  | Readonly<{ kind: 'association-unknown' }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>
export interface ToolForwardSource<P> {
  resolve(
    input: ToolForwardParent<P> &
      Readonly<{ intent: ToolForwardIntent; target: ToolInvokeRequest }>,
  ): Promise<ToolForwardSourceOutcome>
  lookup(
    input: InvocationAccess<P>,
  ): Reply<
    Readonly<{ kind: 'bound'; binding: ToolForwardBinding }> | Readonly<{ kind: 'unresolved' }>
  >
}
export interface ToolForwardRuntime<P> {
  invoke(
    input: ToolForwardParent<P> &
      Readonly<{ intent: ToolForwardIntent; target: ToolInvokeRequest }>,
  ): Promise<ToolInvokeOutcome>
  resume(input: InvocationAccess<P>): Promise<ToolInvokeOutcome>
}
