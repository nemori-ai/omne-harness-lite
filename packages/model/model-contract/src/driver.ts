// Declarations of the public-api chapter "受信宿主驱动".
// ModelDriverHost extends ModelInstanceHost, which refers to ModelHandle, so it is not declared
// until the shared message package has ToolCallPart.
import type { TenantId } from '@omne-harness/legal-identity'
import type { CallAccess, ModelCallId, ModelInstanceId, ModelOperationId } from './root.ts'
import type { DurableEvidence, ModelFailure, Reply } from './result.ts'

export type ModelDriveInput<P> = CallAccess<P> &
  Readonly<{
    instance: ModelInstanceId
    operation: ModelOperationId
    continuity: DurableEvidence
  }>
export interface ModelDriver<P> {
  drive(input: ModelDriveInput<P>, signal: AbortSignal): Reply<void>
}
export interface ModelHostAuthority<P> {
  resolve(input: Readonly<{ tenant: TenantId; call: ModelCallId }>): Reply<ModelDriveInput<P>>
}
export interface ModelDriverBinding {
  close(): Reply<void>
}
export type ModelBindingFailure =
  | Readonly<{ kind: 'conflict' }>
  | Extract<ModelFailure, { kind: 'invalid' | 'unavailable' }>
