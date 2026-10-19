// Execution coordination types of the Agent contract (README, "托管协调与运行实例"). This file
// holds the control and result-responsibility records that the loop facts of the evaluation chapter
// read; the rest of the chapter lands in the same file with the coordination slice.
import type * as M from '@omne-harness/model-contract'
import type * as T from '@omne-harness/tool-contract'
import type { ProducedResult } from './evaluation.ts'
import type { AgentOperationId, ConsumptionId, Evidence } from './identity.ts'

export type ExecutionControl =
  | Readonly<{ kind: 'interrupt-model'; call: M.ModelCallId; reason: Evidence }>
  | Readonly<{ kind: 'interrupt-tool' | 'background-tool'; call: T.ToolCallId; reason: Evidence }>
  | Readonly<{ kind: 'cancel'; reason: Evidence }>
  | Readonly<{ kind: 'suspend'; reason: Evidence }>
export type ControlStage =
  | 'accepted'
  | 'intent-established'
  | 'qualification-revoked'
  | 'producer-confirmed'
  | 'physically-stopped'
  | 'duty-released'
export type ControlStageFact = Readonly<{ state: 'reached' | 'unresolved'; source: Evidence }>
export type ControlRecord = Readonly<{
  operation: AgentOperationId
  command: ExecutionControl
  stages: Readonly<
    { accepted: ControlStageFact } & Partial<
      Record<Exclude<ControlStage, 'accepted'>, ControlStageFact>
    >
  >
}>
export type ResultResponsibility = Readonly<{
  result: ProducedResult
  consumption: ConsumptionId
  custody: Evidence | null
  completion: Evidence | null
  release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: Evidence }>
}>
