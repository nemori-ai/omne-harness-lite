import type {
  CompactionInputRef,
  CompactionResultIdentity,
  CompactionTaskIdentity,
  PreparedCompactionCommit,
} from './compaction.ts'
import type { CompactionMessage } from '@omne-harness/message'
import type { JsonValue } from '@omne-harness/json-text'
import type * as M from '@omne-harness/model-contract'
import type { ModelPurpose, InputBatch, RuntimeConditions, Reply } from './evaluation.ts'
import type {
  Access,
  Adoption,
  ActionId,
  Authority,
  ConsumerRef,
  DurableEvidence,
  PassageId,
  ConsumptionId,
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
        input: CompactionInputRef
      }>
    | Readonly<{ kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction'; diagnostic: string }>
  )
export type SavedPreparation = Extract<Preparation, { kind: 'needs-compaction' | 'cannot-fit' }>
export type CompactionState = Readonly<{
  action: ActionId
  task: CompactionTaskIdentity
  provider: Adoption
  consumer: ConsumerRef
  input: CompactionInputRef
  consumption: ConsumptionId
  result: CompactionResultIdentity | null
  received: DurableEvidence | null
  transition: DurableEvidence | null
  ended: 'committed' | 'failed' | null
}>
export type CompactionAssessment =
  | Readonly<{ kind: 'accepted'; value: PreparedCompactionCommit }>
  | Readonly<{ kind: 'cannot-fit'; diagnostic: string }>
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
        purpose: ModelPurpose
        position: ConsumerRef
        history: DurableEvidence
        inputs: InputBatch
        conditions: RuntimeConditions
        selection: SelectedModel
        previous: Preparation | null
        alterations: readonly DurableEvidence[]
        beforeModelCall: readonly PassageId[] | null
        definition?: Adoption
      }>,
  ): Reply<Preparation>
  assessCompaction(
    input: Access<P> &
      Readonly<{
        advance: Authority
        original: Extract<Preparation, { kind: 'needs-compaction' }>
        task: CompactionTaskIdentity
        consumption: ConsumptionId
        result: CompactionResultIdentity
        received: DurableEvidence
        message: CompactionMessage
      }>,
  ): Reply<CompactionAssessment>
  resume(
    input: Access<P> &
      Readonly<{
        advance: Authority
        original: Extract<Preparation, { kind: 'needs-compaction' }>
        transition: DurableEvidence
        history: DurableEvidence
        selection: SelectedModel
      }>,
  ): Reply<Exclude<Preparation, { kind: 'needs-compaction' }>>
}
export interface CurrentConditions<P> {
  read(
    input: Access<P> & Readonly<{ advance: Authority; previous: DurableEvidence | null }>,
  ): Reply<RuntimeConditions>
}
