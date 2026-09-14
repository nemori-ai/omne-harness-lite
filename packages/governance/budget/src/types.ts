import type {
  Causality,
  CommitEnvelope,
  Counter,
  OperationInput,
  StreamRef,
  Watermark,
} from '@omne-harness-lite/records'
import type {
  CallRef,
  DefinitionRef,
  DefinitionVersion,
  JsonValue,
  Money,
  OpaqueId,
  OperationRef,
  RunRef,
  SessionRef,
  WorkOwner,
} from '@omne-harness-lite/work-data'
import type { EvidenceRef, Instant } from '@omne-harness-lite/tenant'

export type { Money }

export type BudgetScope =
  | Readonly<{ kind: 'tenant'; tenantId: OpaqueId }>
  | Readonly<{ kind: 'definition'; tenantId: OpaqueId; definition: DefinitionRef }>
  | Readonly<{ kind: 'session'; session: SessionRef }>
  | Readonly<{ kind: 'run'; run: RunRef }>

export type Period = Readonly<{
  periodId: OpaqueId
  startsAt: Instant
  endsAt: Instant | null
}>

export type Budget = Readonly<{
  budgetId: OpaqueId
  tenantId: OpaqueId
  scope: BudgetScope
  currency: string
  scale: number
  limit: Money | null
  mode: 'observe' | 'soft' | 'hard'
  thresholds: readonly Money[]
  period: Period
  revision: Counter
}>

export type CostSource = Readonly<{
  sourceId: OpaqueId
  revision: Counter
  providerId: OpaqueId
  currency: string
  priceEvidence: readonly EvidenceRef[]
  bound:
    | Readonly<{
        kind: 'finite'
        maximum: Money
        guarantee: readonly EvidenceRef[]
      }>
    | Readonly<{ kind: 'unknown'; knownReserve: Money }>
  kind: 'tool' | 'model'
}>

export type Allocation = Readonly<{
  budgetId: OpaqueId
  budgetRevision: Counter
  periodId: OpaqueId
  reserved: Money
}>

export type ChargeAttempt = Readonly<{
  chargeAttemptId: OpaqueId
  tenantId: OpaqueId
  owner: WorkOwner
  session: SessionRef | null
  run: RunRef | null
  subjectDefinition: DefinitionVersion
  target:
    | Readonly<{ kind: 'tool'; call: CallRef; toolDefinition: DefinitionVersion }>
    | Readonly<{ kind: 'model'; requestId: OpaqueId; attemptId: OpaqueId }>
  source: CostSource
  causality: Causality
  allocations: readonly Allocation[]
  phase: 'reserved' | 'possibly_emitted' | 'reconciled' | 'released_before_start'
  uncertainty: 'known' | 'unknown'
}>

export type MeterFactRef = Readonly<{
  sourceId: OpaqueId
  externalFactId: OpaqueId
  revision: Counter
}>

export type Quantity = Readonly<{ integer: string; scale: number; unit: string }>

export type MeterFact = Readonly<{
  sourceId: OpaqueId
  externalFactId: OpaqueId
  revision: Counter
  previousRevision: Counter | null
  chargeAttemptId: OpaqueId | null
  providerRequestId: string | null
  quality: 'actual' | 'estimated' | 'unknown'
  amount: Money | null
  quantities: readonly Quantity[]
  completeness: 'partial' | 'final'
  corrects: MeterFactRef | null
  evidence: readonly EvidenceRef[]
}>

export type SourcePosture = Readonly<{
  tenantId: OpaqueId
  source: CostSource
  enabled: boolean
  tenantPostureBudgetId: OpaqueId
  unknownPermissions: readonly Readonly<{ budgetId: OpaqueId; allowed: boolean }>[]
}>

export type PolicyChanged = Readonly<{
  kind: 'budget.policy_changed'
  version: '1'
  data: Readonly<{
    budget: Budget
    previousRevision: Counter
    affectedAttempts: readonly OpaqueId[]
    effectiveBoundary: 'next_admission'
  }>
}>

export type PeriodOpened = Readonly<{
  kind: 'budget.period_opened'
  version: '1'
  data: Readonly<{
    budgetId: OpaqueId
    previousPeriodId: OpaqueId
    period: Period
    budgetRevision: Counter
  }>
}>

export type SourcePostureChanged = Readonly<{
  kind: 'budget.source_posture_changed'
  version: '1'
  data: SourcePosture & Readonly<{ previousRevision: Counter }>
}>

export type AttemptReserved = Readonly<{
  kind: 'budget.attempt_reserved'
  version: '1'
  data: Readonly<{ attempt: ChargeAttempt }>
}>

export type ReservationChanged = Readonly<{
  kind: 'budget.reservation_changed'
  version: '1'
  data: Readonly<{
    chargeAttemptId: OpaqueId
    budgetId: OpaqueId
    periodId: OpaqueId
    before: Money
    after: Money
    reason: 'reserved' | 'partial_meter' | 'reconciled' | 'never_started'
    evidence: readonly EvidenceRef[]
  }>
}>

export type ExposureRecorded = Readonly<{
  kind: 'budget.exposure_recorded'
  version: '1'
  data: Readonly<{
    chargeAttemptId: OpaqueId
    phase: 'possibly_emitted'
    uncertainty: 'known' | 'unknown'
    sourceFact: EvidenceRef
  }>
}>

export type MeterRecorded = Readonly<{
  kind: 'budget.meter_recorded'
  version: '1'
  data: Readonly<{ fact: MeterFact }>
}>

export type SourceFactIndexed = Readonly<{
  kind: 'budget.source_fact_indexed'
  version: '1'
  data: Readonly<{
    sourceId: OpaqueId
    externalFactId: OpaqueId
    revision: Counter
    previousRevision: Counter | null
    chargeAttemptId: OpaqueId | null
    inputDigest: string
  }>
}>

export type AttemptReconciled = Readonly<{
  kind: 'budget.attempt_reconciled'
  version: '1'
  data: Readonly<{
    chargeAttemptId: OpaqueId
    finalFacts: readonly EvidenceRef[]
    released: readonly Allocation[]
    remainingUnknown: boolean
  }>
}>

export type ReleasedBeforeStart = Readonly<{
  kind: 'budget.released_before_start'
  version: '1'
  data: Readonly<{
    chargeAttemptId: OpaqueId
    proof: readonly EvidenceRef[]
    released: readonly Allocation[]
  }>
}>

export type UnallocatedRecorded = Readonly<{
  kind: 'budget.unallocated_recorded'
  version: '1'
  data: Readonly<{ fact: MeterFact; tenantId: OpaqueId }>
}>

export type CostAttributed = Readonly<{
  kind: 'budget.cost_attributed'
  version: '1'
  data: Readonly<{
    sourceId: OpaqueId
    externalFactId: OpaqueId
    revision: Counter
    chargeAttemptId: OpaqueId
    allocations: readonly Allocation[]
    evidence: readonly EvidenceRef[]
  }>
}>

export type ThresholdCrossed = Readonly<{
  kind: 'budget.threshold_crossed'
  version: '1'
  data: Readonly<{
    budgetId: OpaqueId
    periodId: OpaqueId
    threshold: Money
    knownExposure: Money
    unknownAttempts: readonly OpaqueId[]
    delivery: 'pending'
  }>
}>

export type ThresholdDeliveryChanged = Readonly<{
  kind: 'budget.threshold_delivery_changed'
  version: '1'
  data: Readonly<{
    crossingOperation: OperationRef
    budgetId: OpaqueId
    periodId: OpaqueId
    threshold: Money
    delivery: 'applied' | 'failed' | 'unknown'
    evidence: readonly EvidenceRef[]
  }>
}>

export type OperationDenied = Readonly<{
  kind: 'budget.operation_denied'
  version: '1'
  data: Readonly<{
    operationKind: string
    target: JsonValue
    code: string
    evidence: readonly EvidenceRef[]
    observed: Watermark
  }>
}>

export type BudgetRecord =
  | PolicyChanged
  | PeriodOpened
  | SourcePostureChanged
  | AttemptReserved
  | ReservationChanged
  | ExposureRecorded
  | MeterRecorded
  | SourceFactIndexed
  | AttemptReconciled
  | ReleasedBeforeStart
  | UnallocatedRecorded
  | CostAttributed
  | ThresholdCrossed
  | ThresholdDeliveryChanged
  | OperationDenied

export type DecodedBudgetEnvelope = Readonly<{
  position: CommitEnvelope['position']
  operation: OperationRef
  input: OperationInput
  streamRevisions: readonly Readonly<{
    stream: StreamRef
    expectedRevision: Counter
  }>[]
  records: readonly BudgetRecord[]
}>

export type SourceFactStatus = 'current' | 'pending' | 'superseded'
export type SourceFactEntry = Readonly<{
  fact: MeterFact
  inputDigest: string
  allocatedChargeAttemptId: OpaqueId | null
  status: SourceFactStatus
}>

export type AttemptAccount = Readonly<{
  attempt: ChargeAttempt
  phase: ChargeAttempt['phase']
  uncertainty: ChargeAttempt['uncertainty']
  currentAllocations: readonly Allocation[]
  finalFacts: readonly EvidenceRef[]
  releaseEvidence: readonly EvidenceRef[]
}>

export type ThresholdCrossing = Readonly<{
  crossingOperation: OperationRef
  budgetId: OpaqueId
  periodId: OpaqueId
  threshold: Money
  knownExposure: Money
  unknownAttempts: readonly OpaqueId[]
  delivery: 'pending' | 'applied' | 'failed' | 'unknown'
  evidence: readonly EvidenceRef[]
}>

export type DeniedOperation = Readonly<{
  operationKind: string
  target: JsonValue
  code: string
  evidence: readonly EvidenceRef[]
  observed: Watermark
}>

export type BudgetLedger = Readonly<{
  coordinationDomain: OpaqueId | null
  throughSeq: Counter
  lastCommitId: OpaqueId | null
  streamRevisions: readonly Readonly<{ stream: StreamRef; revision: Counter }>[]
  budgets: readonly Budget[]
  periods: readonly Readonly<{ budgetId: OpaqueId; period: Period }>[]
  sourcePostures: readonly SourcePosture[]
  attempts: readonly AttemptAccount[]
  sourceFacts: readonly SourceFactEntry[]
  thresholdCrossings: readonly ThresholdCrossing[]
  deniedOperations: readonly DeniedOperation[]
}>

export type AttemptExposure = Readonly<{
  chargeAttemptId: OpaqueId
  knownCost: Money
  remainingReserve: Money
  knownExposure: Money
  boundViolated: boolean
  unknown: boolean
  qualities: readonly ('actual' | 'estimated')[]
}>
