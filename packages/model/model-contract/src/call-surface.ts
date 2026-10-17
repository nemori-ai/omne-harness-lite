// Declarations of the public-api chapter "普通调用面与实例观察".
// The observation and read names (VisibleBlock to ReadStart, ModelConsumption, ModelDirectory,
// ModelRuntime) refer to ModelBlock, which is not declared until the shared message package has
// ToolCallPart.
import type { CallAccess, Mutation, Admit, DispatchId, ModelOperationId, Supplier } from './root.ts'
import type { Admission, ControlState, Lookup, Reply, Termination } from './result.ts'
import type { MaterializationReceipt } from './provider.ts'
import type { DurableEvidence } from './result.ts'
import type { CallAccount } from '@omne-harness/call-account'

export type GrowingContentKind = 'text' | 'thinking' | 'tool-arguments' | 'voice'
export type DispatchRecord = Readonly<{
  dispatch: DispatchId
  supplier: Supplier
  intent: ModelOperationId
  send: 'prepared' | 'started' | 'unknown' | 'not-sent'
  firstContent: 'none-proven' | 'observed' | 'uncertain'
  terminal: Termination | null
  account: CallAccount | null
  materialization: Readonly<{ receipt: MaterializationReceipt; source: DurableEvidence }> | null
}>
export interface ModelCalls<P> {
  admit(input: Admit<P>): Reply<Admission>
  inspect(input: CallAccess<P> & Readonly<{ admission: ModelOperationId }>): Reply<Lookup>
  dispatches(input: CallAccess<P>): Reply<readonly DispatchRecord[]>
  cancel(input: Mutation<P>): Reply<ControlState>
}
