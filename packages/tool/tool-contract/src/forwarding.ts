import type { JsonValue } from '@omne-harness/json-text'
import type { FixedToolRequest } from './definitions.ts'
import type { ToolCapabilityIdentity } from './entry-source.ts'
import type { ToolActionGate } from './gates.ts'
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
  /** The asset behind the target, when it is not a tool of its own name; permission is found by it. */
  capability?: ToolCapabilityIdentity
  definition: Adoption
  command: string | null
  effectiveArguments: string
  gate: ToolActionGate
}>
export type ToolCallAction =
  | Readonly<{ kind: 'own'; gate: ToolActionGate; capability?: ToolCapabilityIdentity }>
  | Readonly<{
      kind: 'carried'
      carrier: Readonly<{ name: string; definition: Adoption; gate: ToolActionGate }>
      target: ToolActionTarget
    }>
  | Readonly<{ kind: 'argument-error'; gate: ToolActionGate; field: string; reason: string }>
/** Answered before the call is made, for the exact definition the caller judges. */
export interface ToolActionResolution<P> {
  resolve(
    input: Access<P> & Readonly<{ name: string; definition: Adoption; effectiveArguments: string }>,
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
