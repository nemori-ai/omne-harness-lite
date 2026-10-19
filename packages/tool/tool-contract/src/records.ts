// Durable state and protocol records exchanged with providers.
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolWaitSchemaSnapshot } from './author-context.ts'
import type { FixedToolRequest } from './definitions.ts'
import type { ToolExecutionRef } from './execution.ts'
import type {
  Access,
  Adoption,
  CallAccess,
  ConsumerRef,
  DurableEvidence,
  Mutation,
  ToolCallId,
  ToolDeliveryId,
  ToolOperationId,
  ToolResultVersion,
  ToolWaitId,
} from './identity.ts'
import type { ToolControl } from './operations.ts'
import type {
  DecisionValue,
  PreparedEnvironment,
  ToolExecutionFact,
  ToolStartLookup,
  ToolStartRecord,
} from './ports.ts'
import type { ChildReservation, ProgramEnd } from './program.ts'
import type { Reply, WaitState } from './results.ts'

export type PhysicalExecution =
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'starting' | 'live' | 'unknown'; start: ToolOperationId }>
  | Readonly<{ kind: 'suspended'; checkpoint: DurableEvidence }>
  | Readonly<{ kind: 'ended' | 'lost'; evidence: DurableEvidence }>
export type QueuePosition =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'waiting' | 'held'; key: string; ordinal: string }>
  | Readonly<{ kind: 'released'; key: string; ordinal: string; evidence: DurableEvidence }>
export type ClockSegment = Readonly<{
  operation: ToolOperationId
  source: string
  epoch: string
  marker: DurableEvidence
}>
export type ToolTiming = Readonly<{ accumulatedMs: string }> &
  (
    | Readonly<{ kind: 'running'; segment: ClockSegment }>
    | Readonly<{ kind: 'paused' | 'closed' }>
    | Readonly<{ kind: 'unknown'; segment: ClockSegment; diagnostic: string }>
  )
export type ProtocolIdentity = Readonly<{
  tenant: TenantId
  call: ToolCallId
  operation: ToolOperationId
  adoption: Adoption
  inputDigest: string
}>
export type PreparationRecord = ProtocolIdentity &
  Readonly<{
    purpose: 'initial' | 'resume'
    request: FixedToolRequest
  }>
export type PreparationProgress<E> =
  | Readonly<{ kind: 'prepared'; environment: PreparedEnvironment<E> }>
  | Readonly<{ kind: 'excluded'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown'; diagnostic: string }>
export type ReleaseRecord = ProtocolIdentity &
  Readonly<{
    preparation: ToolOperationId
    resource: DurableEvidence
    custody: DurableEvidence
  }>
export type ReleaseProgress =
  | Readonly<{ kind: 'released'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown' | 'rejected'; diagnostic: string }>
export type StartProgress =
  | Readonly<{ kind: 'started'; acceptance: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'not-started'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; exclusion: DurableEvidence }>
export type StartGuard = Readonly<{
  owner: string
  resource: string
  revision: string
  evidence: DurableEvidence
  scope:
    | Readonly<{ kind: 'resource' }>
    | (Readonly<{ kind: 'program'; parent: ToolCallId }> &
        (
          | Readonly<{ gate: 'open' }>
          | Readonly<{
              gate: 'closing' | 'closed'
              closure: ToolOperationId
              applies: 'all-children' | 'foreground-and-unadmitted'
              cutoff: DurableEvidence
            }>
        ))
}>
export type StartPermit = ProtocolIdentity &
  Readonly<{
    start: ToolStartRecord
    guards: readonly StartGuard[]
    request: DurableEvidence
  }>
export interface ToolStartAuthority<P> {
  exclude(input: Mutation<P> & Readonly<{ reason: string }>): Reply<DurableEvidence>
  prepare(
    input: CallAccess<P> & Readonly<{ start: ToolStartRecord; request: FixedToolRequest }>,
  ): Reply<StartPermit>
  consume(
    input: CallAccess<P> & Readonly<{ permit: StartPermit; executorReceipt: DurableEvidence }>,
  ): Reply<StartProgress>
  inspect(input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>): Reply<StartProgress>
  invalidate(
    input: Access<P> & Readonly<{ operation: ToolOperationId; guard: StartGuard }>,
  ): Reply<DurableEvidence>
}
export type WaitIntent = Readonly<{
  wait: ToolWaitId
  resume: DurableEvidence
  schemas: ToolWaitSchemaSnapshot
}> &
  (
    | Readonly<{ kind: 'ask'; request: DurableEvidence }>
    | Readonly<{
        kind: 'resource'
        contract: Adoption
        request: DurableEvidence
        deadline: string | null
      }>
  )
export type ExternalResponse =
  | Readonly<{ kind: 'decision'; value: DecisionValue; source: DurableEvidence }>
  | Readonly<{ kind: 'resource'; value: JsonValue; source: DurableEvidence }>
  | Readonly<{ kind: 'expired'; source: DurableEvidence }>
export type ResponseRecord = ProtocolIdentity &
  Readonly<{
    start: ToolStartRecord
    wait: ToolWaitId
    response: ExternalResponse
  }>
export type ResponseProgress =
  | Readonly<{ kind: 'accepted'; receipt: DurableEvidence }>
  | Readonly<{ kind: 'continued'; receipt: DurableEvidence; timing: DurableEvidence }>
  | Readonly<{ kind: 'not-accepted'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown' | 'rejected'; diagnostic: string }>
export type WaitRecord = Readonly<{ intent: WaitIntent }> &
  (
    | Readonly<{ phase: 'opening'; operation: ToolOperationId }>
    | Readonly<{ phase: 'open'; value: Exclude<WaitState, { kind: 'none' }> }>
    | Readonly<{
        phase: 'responding'
        value: Exclude<WaitState, { kind: 'none' }>
        response: ResponseRecord
        progress: ResponseProgress
      }>
    | Readonly<{
        phase: 'closed'
        cause: 'continued' | 'cancelled' | 'terminal'
        evidence: DurableEvidence
      }>
  )
export interface ToolResourceResponses<P> {
  inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>
  ensure(
    input: Mutation<P> & Readonly<{ wait: Extract<WaitIntent, { kind: 'resource' }> }>,
  ): Reply<DurableEvidence>
  inspect(
    input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>,
  ): Reply<Readonly<{ registration: DurableEvidence; response: DurableEvidence | null }>>
  expire(
    input: Mutation<P> &
      Readonly<{ wait: Extract<WaitIntent, { kind: 'resource' }>; registration: DurableEvidence }>,
  ): Reply<DurableEvidence>
  invalidate(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; terminal: DurableEvidence }>,
  ): Reply<DurableEvidence>
  resolve(
    input: CallAccess<P> & Readonly<{ wait: WaitIntent; response: DurableEvidence }>,
  ): Reply<Extract<ExternalResponse, { kind: 'resource' | 'expired' }>>
}
export type ExternalOperationResolution =
  | Readonly<{ kind: 'committed'; operation: ToolOperationId; receipt: DurableEvidence }>
  | Readonly<{ kind: 'excluded'; operation: ToolOperationId; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'pending' | 'unknown'; operation: ToolOperationId; diagnostic: string }>
export type ControlProgress =
  | Readonly<{ kind: 'pending' | 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'accepted'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'stopped' | 'already-ended' | 'relation-changed'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'rejected'; reason: string; evidence: DurableEvidence }>
export type ControlRecord = Readonly<{
  operation: ToolOperationId
  intent: ToolControl
  source: DurableEvidence
  progress: ControlProgress
}>
export type ControlDispatch = ProtocolIdentity &
  Readonly<{
    start: ToolStartRecord
    intent: Extract<ToolControl, { kind: 'stop' }>
    source: DurableEvidence
  }>
export type SuspensionRecord = ProtocolIdentity &
  Readonly<{ start: ToolStartRecord; schema: Adoption }>
export type Checkpoint = Readonly<{
  schema: Adoption
  payload: DurableEvidence
  start: ToolStartRecord
  consumedResponses: readonly ToolOperationId[]
  effectBoundary: DurableEvidence
  exclusion: DurableEvidence
}>
export type SuspensionProgress =
  | Readonly<{ kind: 'suspended'; checkpoint: Checkpoint }>
  | Readonly<{ kind: 'not-suspended'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown' | 'rejected'; diagnostic: string }>
export interface ToolRecoveryBinding<B extends ContentBlock> {
  acknowledge(input: FactReceipt): Reply<DurableEvidence>
  inspectStart(start: ToolStartRecord): Reply<ToolStartLookup<B>>
  inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>
  stop(input: ControlDispatch): Reply<ControlProgress>
  inspectControl(input: ControlDispatch): Reply<ControlProgress>
}
export type FactBatch<B extends ContentBlock> = Readonly<{
  start: ToolStartRecord
  source: DurableEvidence
  batch: string
  after: string | null
  cursor: string
  events: readonly Readonly<{ event: string; fact: ToolExecutionFact<B> }>[]
}>
export type FactReceipt = Readonly<{
  start: ToolOperationId
  batch: string
  cursor: string
  custody: DurableEvidence
}>
export type FactProgress = Readonly<{
  start: ToolStartRecord
  source: DurableEvidence
  cursor: string | null
  pendingAcknowledgements: readonly FactReceipt[]
}>
export type ProgramScheduling = Readonly<{
  execution: ToolExecutionRef
  source: DurableEvidence
  sequence: string
  marker: DurableEvidence
}> &
  (
    | Readonly<{ kind: 'runnable' }>
    | Readonly<{ kind: 'blocked'; children: readonly ToolCallId[] }>
    | Readonly<{ kind: 'unknown'; diagnostic: string }>
  )
export type ToolTask = Readonly<{
  operation: ToolOperationId
  state: 'pending' | 'blocked'
  diagnostic: string | null
}> &
  (
    | Readonly<{ kind: 'prepare'; preparation: PreparationRecord }>
    | Readonly<{ kind: 'release'; release: ReleaseRecord }>
    | Readonly<{ kind: 'start'; start: ToolStartRecord }>
    | Readonly<{ kind: 'answer'; response: ResponseRecord }>
    | Readonly<{ kind: 'stop'; control: ControlDispatch }>
    | Readonly<{ kind: 'suspend'; suspension: SuspensionRecord }>
    | Readonly<{
        kind: 'wait-registration'
        wait: ToolWaitId
        action: 'ensure' | 'invalidate'
        evidence: DurableEvidence
      }>
    | Readonly<{
        kind: 'deliver'
        result: ToolResultVersion
        delivery: ToolDeliveryId
        consumer: ConsumerRef
      }>
    | Readonly<{ kind: 'queue' | 'settle' | 'account' | 'facts' | 'clock'; basis: DurableEvidence }>
    | Readonly<{
        kind: 'child'
        reservation: ChildReservation
        action: 'reconcile' | 'collect' | 'control'
        cause: ProgramEnd | null
      }>
    | Readonly<{ kind: 'program-fence'; end: ProgramEnd; guard: StartGuard }>
    | Readonly<{
        kind: 'resource-wait'
        wait: Extract<WaitIntent, { kind: 'resource' }>
        action: 'ensure' | 'expire' | 'invalidate'
        evidence: DurableEvidence
      }>
    | Readonly<{
        kind: 'fact-ack'
        start: ToolStartRecord
        source: DurableEvidence
        receipt: FactReceipt
      }>
  )
export type TaskResolution =
  | Readonly<{ kind: 'done'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'blocked'; reason: string }>
export type DrainState = Readonly<{
  admission: 'open' | 'closed'
  inventory: DurableEvidence
  active: readonly ToolCallId[]
  tasks: readonly ToolTask[]
  untransferred: readonly DurableEvidence[]
}>
