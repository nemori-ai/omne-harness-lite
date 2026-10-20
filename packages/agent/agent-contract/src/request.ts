// Request preparation, model selection and compaction types of the Agent contract (README,
// "请求准备、模型选择与压缩"): Agent's own port shapes toward Model and Context.
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
  Evidence,
  PassageId,
} from './identity.ts'

export type ModelRecipient = Readonly<{ route: string; profile: Adoption }>
export type SelectedModel = Readonly<{
  recipient: ModelRecipient
  resolution: Extract<M.ProfileResolution, { kind: 'resolved' }> & Readonly<{ selectable: true }>
  parameters: readonly M.Parameter[]
  tools: Evidence
  evidence: Evidence
}>
/** The port that selects the model of one request; see SPEC "模型选择". */
export interface ModelSelection<P> {
  select(
    input: Access<P> &
      Readonly<{
        advance: Authority
        scope: Evidence
        purpose: ModelPurpose
        position: ConsumerRef
        history: Evidence
        conditions: RuntimeConditions
        alterations: readonly Evidence[]
      }>,
  ): Reply<SelectedModel>
}
export type ContextContent = 'full' | 'incremental'
export type ModelContextRead = Readonly<{
  recipient: ModelRecipient
  content: ContextContent
  source: Evidence
  coverage: Evidence
}>
/** The port that reads the runtime context for the model as the one consumer; see SPEC "Runtime Context 的消费". */
export interface ModelContextReader<P> {
  read(
    input: Access<P> &
      Readonly<{
        advance: Authority
        position: ConsumerRef
        recipient: ModelRecipient
        history: Evidence
        adopted: Evidence | null
        transition: Evidence | null
      }>,
  ): Reply<ModelContextRead>
}
export type CompactionProgress = Readonly<{ plan: Evidence; bound: string; completed: string }>
export type Preparation = Readonly<{
  id: ActionId
  purpose: ModelPurpose
  position: ConsumerRef
  source: Evidence
  state: JsonValue
  schema: Adoption
}> &
  (
    | Readonly<{
        kind: 'assembled'
        input: M.AssembledModelInput
        budget: Evidence
        recipient: ModelRecipient
        coverage: Evidence
      }>
    | Readonly<{
        kind: 'ready'
        request: M.FixedModelRequest
        capacity: M.ResultCapacity
        budget: Evidence
        recipient: ModelRecipient
        coverage: Evidence
      }>
    | Readonly<{
        kind: 'needs-compaction'
        original: Readonly<{
          input: Evidence
          alterations: readonly Evidence[]
          beforeModelCall: readonly PassageId[] | null
        }>
        progress: CompactionProgress
      }>
    | Readonly<{ kind: 'cannot-fit'; reason: 'fixed' | 'after-compaction'; diagnostic: string }>
  )
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
  stepRequest: Extract<Preparation, { kind: 'ready' }> | null
  ended: 'committed' | 'failed' | null
}>
export type FinalRequest = Readonly<{
  preparation: ActionId
  request: M.FixedModelRequest
  capacity: M.ResultCapacity
  recipient: ModelRecipient
  coverage: Evidence
  alterations: readonly Evidence[]
}>
/** The port that prepares, derives and resumes a model request; see SPEC "请求准备与压缩". */
export interface RequestPreparation<P> {
  prepare(
    input: Access<P> &
      Readonly<{
        advance: Authority
        action: ActionId
        purpose: Exclude<ModelPurpose, 'compaction'>
        position: ConsumerRef
        history: Evidence
        inputs: InputBatch
        conditions: RuntimeConditions
        selection: SelectedModel
        context: ModelContextRead
        previous: Preparation | null
        alterations: readonly Evidence[]
        beforeModelCall: readonly PassageId[] | null
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
        result: Readonly<{ produced: ProducedResult; consumed: Evidence }> | null
      }>,
  ): Reply<CompactionAdvance>
  resume(
    input: Access<P> &
      Readonly<{
        advance: Authority
        original: Extract<Preparation, { kind: 'needs-compaction' }>
        transition: Evidence
        selection: SelectedModel
        context: ModelContextRead
      }>,
  ): Reply<Preparation>
}
/** The port that reads the current runtime conditions through a trusted adapter; see SPEC "身份、原位置与纯求值". */
export interface CurrentConditions<P> {
  read(
    input: Access<P> & Readonly<{ advance: Authority; previous: Evidence | null }>,
  ): Reply<RuntimeConditions>
}
