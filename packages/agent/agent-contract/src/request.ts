import type { JsonValue } from '@omne-harness/json-text'
import type * as M from '@omne-harness/model-contract'
import type {
  ModelPurpose,
  PreparedContextTransition,
  ProducedResult,
  InputBatch,
  RuntimeConditions,
  Reply,
} from './evaluation.ts'
import type {
  Access,
  Adoption,
  ActionId,
  Authority,
  ConsumerRef,
  DurableEvidence,
  PassageId,
} from './identity.ts'

export type ModelRecipient = Readonly<{ route: string; profile: Adoption }>
export type SelectedModel = Readonly<{
  recipient: ModelRecipient
  resolution: Extract<M.ProfileResolution, { kind: 'resolved' }> & Readonly<{ selectable: true }>
  parameters: readonly M.Parameter[]
  tools: DurableEvidence
  evidence: DurableEvidence
}>
export interface ModelSelection<P> {
  select(
    input: Access<P> &
      Readonly<{
        advance: Authority
        scope: DurableEvidence
        purpose: ModelPurpose
        position: ConsumerRef
        history: DurableEvidence
        conditions: RuntimeConditions
        alterations: readonly DurableEvidence[]
      }>,
  ): Reply<SelectedModel>
}
export type ContextContent = 'full' | 'incremental'
export type ModelContextRead = Readonly<{
  recipient: ModelRecipient
  content: ContextContent
  source: DurableEvidence
  coverage: DurableEvidence
}>
export interface ModelContextReader<P> {
  read(
    input: Access<P> &
      Readonly<{
        advance: Authority
        position: ConsumerRef
        recipient: ModelRecipient
        history: DurableEvidence
        adopted: DurableEvidence | null
        transition: DurableEvidence | null
      }>,
  ): Reply<ModelContextRead>
}
export type CompactionProgress = Readonly<{
  plan: DurableEvidence
  bound: string
  completed: string
}>
export type Preparation = Readonly<{
  id: ActionId
  purpose: ModelPurpose
  position: ConsumerRef
  source: DurableEvidence
  state: JsonValue
  schema: Adoption
}> &
  (
    | Readonly<{
        kind: 'assembled'
        input: M.AssembledModelInput
        budget: DurableEvidence
        recipient: ModelRecipient
        coverage: DurableEvidence
      }>
    | Readonly<{
        kind: 'ready'
        request: M.FixedModelRequest
        budget: DurableEvidence
        recipient: ModelRecipient
        coverage: DurableEvidence
      }>
    | Readonly<{
        kind: 'needs-compaction'
        original: Readonly<{
          input: DurableEvidence
          alterations: readonly DurableEvidence[]
          beforeModelCall: readonly PassageId[] | null
        }>
        progress: CompactionProgress
      }>
    | Readonly<{ kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction'; diagnostic: string }>
  )
export type SavedPreparation = Extract<Preparation, { kind: 'needs-compaction' | 'cannot-fit' }>
export type CompactionAdvance =
  | Readonly<{
      kind: 'continue'
      progress: CompactionProgress
      stepRequest: Extract<Preparation, { kind: 'ready' }>
    }>
  | Readonly<{ kind: 'transition'; progress: CompactionProgress; value: PreparedContextTransition }>
  | Readonly<{
      kind: 'cannot-fit'
      progress: CompactionProgress
      reason: 'after-compaction'
      diagnostic: string
    }>
export type CompactionState = Readonly<{
  action: ActionId
  progress: CompactionProgress
  initiated: string
  ended: 'committed' | 'failed' | null
}>
export type FinalRequest = Readonly<{
  preparation: ActionId
  request: M.FixedModelRequest
  recipient: ModelRecipient
  coverage: DurableEvidence
  alterations: readonly DurableEvidence[]
}>
export interface RequestPreparation<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        advance: Authority
        action: ActionId
        purpose: Exclude<ModelPurpose, 'compaction'>
        position: ConsumerRef
        history: DurableEvidence
        inputs: InputBatch
        conditions: RuntimeConditions
        selection: SelectedModel
        context: ModelContextRead
        previous: Preparation | null
        alterations: readonly DurableEvidence[]
        beforeModelCall: readonly PassageId[] | null
        definition?: Adoption
      }>,
  ): Reply<Preparation>
  derive(
    input: Access<P> &
      Readonly<{
        advance: Authority
        original: Extract<Preparation, { kind: 'needs-compaction' }>
        progress: CompactionProgress
        action: ActionId
        selection: SelectedModel
        result: Readonly<{ produced: ProducedResult; consumed: DurableEvidence }> | null
      }>,
  ): Reply<CompactionAdvance>
  resume(
    input: Access<P> &
      Readonly<{
        advance: Authority
        original: Extract<Preparation, { kind: 'needs-compaction' }>
        transition: DurableEvidence
        selection: SelectedModel
        context: ModelContextRead
      }>,
  ): Reply<Preparation>
}
export interface CurrentConditions<P> {
  read(
    input: Access<P> & Readonly<{ advance: Authority; previous: DurableEvidence | null }>,
  ): Reply<RuntimeConditions>
}
