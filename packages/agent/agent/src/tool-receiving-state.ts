import type { Access, AgentOperationId, ReceivedCommitValue } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import type { ToolReceptionTarget } from './tool-receiving-types.ts'

export type ToolReception<P> = {
  access: Access<P>
  target: ToolReceptionTarget
  delivery: ToolDelivery<ContentBlock>
  operation: AgentOperationId
  bytes: number
  attachments: number
  commit: { kind: 'new' | 'unknown' | 'excluded' } | { kind: 'saved'; value: ReceivedCommitValue }
}

/** The host owns this state and its actual tasks across receiver and runtime reassembly. */
export class ToolReceiverState<P> {
  readonly receptions = new Map<string, ToolReception<P>>()
  readonly writing = new Set<string>()
  readonly active = new Map<string, number>()
  readonly tasks = new Set<Promise<unknown>>()
  readonly diagnostics = new Map<string, string>()
}

export const createToolReceiverState = <P>() => new ToolReceiverState<P>()
export type ToolReceiverReport = Readonly<{
  pending: number
  diagnostics: readonly Readonly<{ operation: string; reason: string }>[]
}>
