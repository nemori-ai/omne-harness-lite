import type { JsonValue } from '@omne-harness/json-text'
import type { FixedToolRequest } from './definitions.ts'
import type { CallAccess, ToolCallId, ToolOperationId } from './identity.ts'
import type {
  InvocationAccess,
  ToolInvokeRequest,
  ToolDefiniteFailure,
  ToolInvokeOutcome,
} from './operations.ts'
import type { ToolStartRecord } from './ports.ts'
import type { Reply } from './results.ts'

/** Provider proof of the original author execution. The source verifies it again. */
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
