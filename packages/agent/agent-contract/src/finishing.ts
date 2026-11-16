import type * as T from '@omne-harness/tool-contract'
import type {
  AcceptedInput,
  AgentAccessOperation,
  ControlRecord,
  ExecutionMutation,
  CommandReceipt,
  FinishAuthorization,
  ResultResponsibility,
  TerminalObservation,
} from './execution.ts'
import type {
  AgentCheckpoint,
  AgentConclusion,
  FailureCandidate,
  PendingCall,
} from './evaluation.ts'
import type { ExtensionInvocationMode, ExtensionInvocationResult } from './extensions.ts'
import type {
  Access,
  ActionId,
  Adoption,
  AgentExecutionId,
  AgentOperationId,
  CardRoundId,
  ConsumerRef,
  ConsumptionId,
  DurableEvidence,
  ExecutionRevision,
  InputBatchId,
  InputId,
  PassageId,
} from './identity.ts'
import type { ExecutionHandoff, HandoffCustody } from './journal.ts'
import type {
  CardRound,
  HandoffLookup,
  HandoffReference,
  HandoffResolution,
  Passage,
  PendingHandoff,
} from './passages.ts'
import type { ProducedResult } from './evaluation.ts'

export type FinishCandidateContent = Readonly<{
  origin: DurableEvidence
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: DurableEvidence
  conditions: DurableEvidence
}>
export type FinishCandidate = Readonly<{
  candidate: AgentOperationId
  origin: DurableEvidence
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: DurableEvidence
  checkpoint: AgentCheckpoint
  conditions: DurableEvidence
}>
export type LegacyF2Entry =
  | Readonly<{
      kind: 'not-started'
      ordinal: number
      declaration: DurableEvidence
      implementation: Adoption
      passage: PassageId | null
      exclusion: DurableEvidence
    }>
  | Readonly<{ kind: 'recorded'; passage: Passage; version: DurableEvidence }>
export type FinishRoute =
  | Readonly<{
      kind: 'author'
      record: DurableEvidence
      candidate: AgentOperationId
      policy: Adoption
      plan: readonly LegacyF2Entry[]
      beforeTerminal: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'cancellation'
      record: DurableEvidence
      candidate: AgentOperationId
      control: AgentOperationId
      policy: Adoption
      installation: DurableEvidence
      origin:
        | Readonly<{ kind: 'native'; operation: AgentOperationId }>
        | Readonly<{ kind: 'migration'; operation: AgentOperationId }>
    }>
export type CandidateSupersession = Readonly<{
  from: AgentOperationId
  to: AgentOperationId
  control: AgentOperationId | null
  revision: ExecutionRevision
  route: FinishRoute
}>

export type PendingReason =
  | 'input-disposition'
  | 'cancel-intent'
  | 'qualification-revocation'
  | 'operation-resolution'
  | 'call-custody'
  | 'required-judgment'
  | 'passage-custody'
  | 'card-custody'
  | 'result-custody'
  | 'material-custody'
  | 'output-custody'
  | 'observation-custody'
  | 'handoff-history'
export type RecoveryAction =
  | 'original-operation-query'
  | 'original-invoke-recovery'
  | 'tool-association-retain'
  | 'producer-query'
  | 'producer-receive'
  | 'producer-release'
  | 'card-lookup'
  | 'card-read'
  | 'card-invalidate'
  | 'material-read'
  | 'input-read'
  | 'output-read-ack'
  | 'terminal-observe'
  | 'restore-source'
  | 'handoff-lookup'
  | 'handoff-exclude'
  | 'handoff-record'
  | 'handoff-source-recovery'
export type ContinuationRequest<Parameters> =
  | Readonly<{ kind: 'parameters'; value: Parameters }>
  | Readonly<{ kind: 'record'; schema: Adoption; record: DurableEvidence }>
  | Readonly<{ kind: 'unresolved'; key: string; missing: DurableEvidence }>
type ContinuationHead<
  K extends RecoveryAction,
  Parameters,
  Purpose extends AgentAccessOperation = AgentAccessOperation,
> = Readonly<{
  kind: K
  request: ContinuationRequest<Parameters>
  owner: string
  custodian: ConsumerRef | null
  purpose: Purpose
}>
export type HandoffRecordMaterial =
  | Readonly<{ kind: 'source-bound-request' }>
  | Readonly<{ kind: 'observed-operation'; originalCall: DurableEvidence }>
export type RecoveryContinuation =
  | ContinuationHead<
      'original-operation-query',
      Readonly<{ execution: AgentExecutionId; operation: AgentOperationId }>,
      'query'
    >
  | ContinuationHead<
      'original-invoke-recovery',
      Readonly<{ intent: ToolIntentKey; fixed: DurableEvidence }>
    >
  | ContinuationHead<
      'tool-association-retain',
      Readonly<{
        intent: ToolIntentKey
        request: DurableEvidence
        source: DurableEvidence
        priorExcluded: ExcludedPredecessor | null
      }>,
      'reconcile'
    >
  | ContinuationHead<'producer-query', Readonly<{ pending: PendingCall }>>
  | ContinuationHead<
      'producer-receive',
      Readonly<{ result: ProducedResult; consumption: ConsumptionId }>
    >
  | ContinuationHead<
      'producer-release',
      Readonly<{ result: ProducedResult; consumption: ConsumptionId }>
    >
  | ContinuationHead<'card-lookup', Readonly<{ passage: PassageId; round: CardRoundId }>>
  | ContinuationHead<'card-read', Readonly<{ passage: PassageId; round: CardRoundId }>>
  | ContinuationHead<
      'card-invalidate',
      Readonly<{ passage: PassageId; round: CardRoundId; reason: DurableEvidence }>
    >
  | ContinuationHead<'material-read', Readonly<{ identity: string; consumer: ConsumerRef }>>
  | ContinuationHead<'input-read', Readonly<{ input: InputId }>>
  | ContinuationHead<'output-read-ack', Readonly<{ after: string | null; through: string | null }>>
  | ContinuationHead<
      'terminal-observe',
      Readonly<{ passage: PassageId; terminal: DurableEvidence; implementation: Adoption }>,
      'record-terminal-observation'
    >
  | ContinuationHead<'restore-source', Readonly<{ source: DurableEvidence }>>
  | ContinuationHead<
      'handoff-lookup',
      Readonly<{ lookup: HandoffLookup; provider: Adoption }>,
      'read-message-handoff'
    >
  | ContinuationHead<
      'handoff-exclude',
      Readonly<{ request: PendingHandoff; prepared: DurableEvidence; control: AgentOperationId }>,
      'exclude-message-handoff'
    >
  | ContinuationHead<
      'handoff-record',
      Readonly<{
        operation: AgentOperationId
        handoff: HandoffReference
        original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
        provider: Adoption
        material: HandoffRecordMaterial
        custody: HandoffCustody | null
      }>,
      'record-message-handoff'
    >
  | ContinuationHead<
      'handoff-source-recovery',
      Readonly<{
        handoff: Extract<HandoffReference, { kind: 'execution' }>
        prepare: AgentOperationId
        apply: AgentOperationId | null
        request: PendingHandoff
        material: DurableEvidence | null
      }>,
      'query'
    >
export type CancellationUnknown = Readonly<{
  owner: string
  key: string
  position: DurableEvidence
  reason:
    | 'original-operation-unknown'
    | 'source-unavailable'
    | 'source-not-authenticated'
    | 'coverage-incomplete'
    | 'policy-unavailable'
    | 'qualification-unavailable'
}>
export type ObligationDisposition =
  | Readonly<{ kind: 'settled'; completion: DurableEvidence }>
  | Readonly<{
      kind: 'held'
      custodian: ConsumerRef
      acceptance: DurableEvidence
      retained: DurableEvidence
      continuation: RecoveryContinuation
    }>
  | Readonly<{ kind: 'pending'; reason: PendingReason; required: RecoveryContinuation }>
  | Readonly<{ kind: 'unknown'; question: CancellationUnknown; required: RecoveryContinuation }>
export type ObligationCategory = 'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
type ObligationHead<K extends string> = Readonly<{
  kind: K
  key: string
  source: DurableEvidence
  version: DurableEvidence
  position: ConsumerRef | null
  disposition: ObligationDisposition
}>
export type FinishObligation =
  | (ObligationHead<'accepted-input'> &
      Readonly<{
        input: InputId
        value: AcceptedInput
        acceptance: AgentOperationId
        origin: DurableEvidence
        taken: InputBatchId | null
      }>)
  | (ObligationHead<'control'> & Readonly<{ control: AgentOperationId }>)
  | (ObligationHead<'operation'> &
      Readonly<{
        operation: AgentOperationId
        method: string
        request: DurableEvidence
        resolution: 'committed' | 'rejected' | 'excluded' | 'unknown'
        result: DurableEvidence | null
      }>)
  | (ObligationHead<'handoff'> & Readonly<{ handoff: HandoffReference; record: ExecutionHandoff }>)
  | (ObligationHead<'call'> &
      Readonly<{
        action: ActionId
        intent: AgentOperationId
        pending: PendingCall
        started: DurableEvidence | null
        outcome: DurableEvidence | null
        interruptions: readonly AgentOperationId[]
        custodian: ConsumerRef | null
      }>)
  | (ObligationHead<'passage'> &
      Readonly<{
        passage: Passage
        candidate: AgentOperationId
        route: DurableEvidence
        implementation: Adoption
        superseded: boolean
      }>)
  | (ObligationHead<'card-round'> &
      Readonly<{
        passage: PassageId
        round: CardRound
        present: DurableEvidence | null
        lookups: readonly AgentOperationId[]
        invalidate: Readonly<{ operation: AgentOperationId; reason: DurableEvidence }> | null
      }>)
  | (ObligationHead<'result'> &
      Readonly<{ responsibility: ResultResponsibility; material: DurableEvidence | null }>)
  | (ObligationHead<'material'> &
      Readonly<{
        identity: string
        consumer: ConsumerRef
        schema: Adoption
        resultVersion: DurableEvidence
        material: DurableEvidence
        custodian: ConsumerRef | null
        acceptance: DurableEvidence | null
      }>)
  | (ObligationHead<'output'> &
      Readonly<{
        emittedThrough: string | null
        acknowledgedThrough: string | null
        retention: DurableEvidence
      }>)
  | (ObligationHead<'terminal-observation'> &
      Readonly<{ observation: TerminalObservation; terminal: DurableEvidence | null }>)
export function obligationCategoryOf(kind: FinishObligation['kind']): ObligationCategory {
  switch (kind) {
    case 'accepted-input':
      return 'inputs'
    case 'control':
      return 'controls'
    case 'operation':
    case 'handoff':
    case 'call':
      return 'operations'
    case 'passage':
    case 'card-round':
      return 'passages'
    case 'result':
    case 'material':
    case 'output':
    case 'terminal-observation':
      return 'custody'
  }
}
export type CoverageFacet = Readonly<{
  owner: string
  version: DurableEvidence
  read: DurableEvidence
}>
export type ResponsibilityCoverage = Readonly<{
  readRevision: ExecutionRevision
  inputWatermark: DurableEvidence
  operations: CoverageFacet
  candidates: CoverageFacet
  passages: CoverageFacet
  results: CoverageFacet
  materials: CoverageFacet
  output: CoverageFacet
  controls: CoverageFacet
  observations: CoverageFacet
  handoffs: CoverageFacet
}>
export type TerminalParticipantFact = Readonly<{
  owner: string
  protocol: Adoption
  source: DurableEvidence
  version: DurableEvidence
  condition:
    | Readonly<{ kind: 'ready' | 'changed' | 'unknown' }>
    | Readonly<{ kind: 'blocked'; category: ObligationCategory; source: DurableEvidence }>
  purpose: DurableEvidence
}>
export type TerminalParticipantFacts =
  | Readonly<{ kind: 'standalone'; basis: DurableEvidence }>
  | Readonly<{
      kind: 'coordinated'
      association: DurableEvidence
      participants: readonly TerminalParticipantFact[]
    }>
export type FinishObligations = Readonly<{
  operation: AgentOperationId
  revision: ExecutionRevision
  evidence: DurableEvidence
  candidate: AgentOperationId
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: DurableEvidence
  checkpoint: DurableEvidence
  conditions: DurableEvidence
  items: readonly FinishObligation[]
  coverage: ResponsibilityCoverage
}>

export type CancellationPolicyInstallation = Readonly<{
  record: DurableEvidence
  decision: DurableEvidence
  policy: Adoption
  inputSchema: Adoption
  implementation: Adoption
  legacyProtocols: readonly Readonly<{
    protocol: Adoption
    checkpointSchema: Adoption
    recognition: DurableEvidence
  }>[]
  admission: DurableEvidence
}>
export type CancellationJudgmentInput = Readonly<{
  tenant: Access<unknown>['tenant']
  execution: AgentExecutionId
  candidate: FinishCandidate
  control: ControlRecord
  route: Extract<FinishRoute, { kind: 'cancellation' }>
  readRevision: ExecutionRevision
  coverage: ResponsibilityCoverage
  items: readonly FinishObligation[]
  participants: TerminalParticipantFacts
}>
export type CancellationBlock = Readonly<{
  category: ObligationCategory
  key: string
  reason: PendingReason
  source: DurableEvidence
  required: RecoveryContinuation
}>
export type CancellationDecision =
  | Readonly<{ kind: 'allowed'; basis: readonly DurableEvidence[] }>
  | Readonly<{ kind: 'blocked'; reasons: readonly [CancellationBlock, ...CancellationBlock[]] }>
  | Readonly<{
      kind: 'unknown'
      questions: readonly [CancellationUnknown, ...CancellationUnknown[]]
      knownBlocked: readonly CancellationBlock[]
    }>
export interface CancellationPolicy {
  readonly policy: Adoption
  readonly implementation: Adoption
  judge(input: CancellationJudgmentInput): CancellationDecision
}
export type CancellationJudgmentRecord = Readonly<{
  operation: AgentOperationId
  receipt: CommandReceipt
  evidence: DurableEvidence
  policy: Adoption
  implementation: Adoption
  inputSchema: Adoption
  installation: DurableEvidence
  qualification: DurableEvidence
  candidate: AgentOperationId
  control: AgentOperationId
  route: DurableEvidence
  input: CancellationJudgmentInput
  decision: CancellationDecision
  revision: ExecutionRevision
  supersedes: AgentOperationId | null
}>

export type ExcludedPredecessor = Readonly<{
  operation: AgentOperationId
  request: DurableEvidence
  exclusion: DurableEvidence
  chain: readonly AgentOperationId[]
}>
export type MigrationRecord = Readonly<{
  operation: AgentOperationId
  receipt: CommandReceipt
  evidence: DurableEvidence
  candidate: AgentOperationId
  control: AgentOperationId
  from: Readonly<{
    route: Extract<FinishRoute, { kind: 'author' }>
    policy: Adoption
    definition: Adoption
    schema: Adoption
    beforeTerminal: DurableEvidence | null
    extensions: readonly Adoption[]
  }>
  progress: readonly LegacyF2Entry[]
  to: Readonly<{
    policy: Adoption
    implementation: Adoption
    inputSchema: Adoption
    installation: DurableEvidence
    admission: DurableEvidence
  }>
  qualification: Readonly<{
    attribution: DurableEvidence
    target: AgentExecutionId
    issuer: DurableEvidence
    check: DurableEvidence
  }>
  fence: DurableEvidence
  coverage: ResponsibilityCoverage
  obligations: readonly FinishObligation[]
  supersession: Readonly<{
    from: DurableEvidence
    to: DurableEvidence
    candidate: CandidateSupersession | null
  }>
  priorExcluded: ExcludedPredecessor | null
}>
export type LegacyInvocationReturn = Readonly<{
  operation: AgentOperationId
  receipt: CommandReceipt
  passage: PassageId
  candidate: AgentOperationId
  route: DurableEvidence
  input: DurableEvidence
  mode: ExtensionInvocationMode
  implementation: Adoption
  source: DurableEvidence
  result: ExtensionInvocationResult
  received: DurableEvidence
  custody: DurableEvidence
  revision: ExecutionRevision
}>
export type ToolIntentKey = Readonly<{
  intent: AgentOperationId
  action: ActionId
  position: ConsumerRef
}>
export type ToolAssociationRecord = Readonly<{
  operation: AgentOperationId
  receipt: CommandReceipt
  intent: ToolIntentKey
  request: DurableEvidence
  source: DurableEvidence
  association:
    | Readonly<{ kind: 'no-proven-reference' }>
    | Readonly<{ kind: 'commit-unknown'; reference: T.ToolInvocationRef }>
    | Readonly<{ kind: 'accepted'; reference: T.ToolInvocationRef; receipt: DurableEvidence }>
  obligation: FinishObligation
  priorExcluded: ExcludedPredecessor | null
  revision: ExecutionRevision
}>
export type CardReconciliationRecord = Readonly<{
  operation: AgentOperationId
  receipt: CommandReceipt
  passage: PassageId
  round: CardRoundId
  candidate: AgentOperationId
  route: DurableEvidence
  original: DurableEvidence
  obligation: Extract<FinishObligation, { kind: 'card-round' }>
  revision: ExecutionRevision
}>
export type ExecutionSettlement = Readonly<{
  candidate: FinishCandidate | null
  route: FinishRoute | null
  currentJudgment: AgentOperationId | null
  candidates: readonly FinishCandidate[]
  routes: readonly FinishRoute[]
  supersessions: readonly CandidateSupersession[]
  migrations: readonly MigrationRecord[]
  judgments: readonly CancellationJudgmentRecord[]
  cardReconciliations: readonly CardReconciliationRecord[]
  legacyReturns: readonly LegacyInvocationReturn[]
  toolAssociations: readonly ToolAssociationRecord[]
}>

type CancelAuthorization = Extract<FinishAuthorization, { kind: 'cancel' }>
export type SettlementRequest<P> = ExecutionMutation<P> &
  (
    | Readonly<{
        kind: 'establish-cancellation'
        authorization: CancelAuthorization
        expected: ExecutionRevision
        installation: DurableEvidence
        predecessor: AgentOperationId | null
      }>
    | Readonly<{
        kind: 'migrate-cancellation'
        authorization: CancelAuthorization
        expected: ExecutionRevision
        candidate: AgentOperationId
        originalRoute: DurableEvidence
        installation: DurableEvidence
        priorExcluded: ExcludedPredecessor | null
      }>
    | Readonly<{
        kind: 'judge-cancellation'
        authorization: CancelAuthorization
        expected: ExecutionRevision
        candidate: AgentOperationId
        route: DurableEvidence
        installation: DurableEvidence
      }>
    | Readonly<{
        kind: 'record-card-reconciliation'
        passage: PassageId
        round: CardRoundId
        candidate: AgentOperationId
        route: DurableEvidence
        original: DurableEvidence
      }>
    | Readonly<{
        kind: 'record-legacy-return'
        passage: PassageId
        candidate: AgentOperationId
        route: DurableEvidence
        request: DurableEvidence
        source: DurableEvidence
      }>
    | Readonly<{
        kind: 'record-tool-association'
        intent: ToolIntentKey
        request: DurableEvidence
        source: DurableEvidence
        priorExcluded: ExcludedPredecessor | null
      }>
  )
export type SettlementResult =
  | Readonly<{
      kind: 'establish-cancellation'
      receipt: CommandReceipt
      candidate: FinishCandidate
      route: Extract<FinishRoute, { kind: 'cancellation' }>
      supersession: CandidateSupersession | null
    }>
  | Readonly<{
      kind: 'migrate-cancellation'
      receipt: CommandReceipt
      migration: MigrationRecord
      route: Extract<FinishRoute, { kind: 'cancellation' }>
    }>
  | Readonly<{
      kind: 'judge-cancellation'
      receipt: CommandReceipt
      judgment: CancellationJudgmentRecord
    }>
  | Readonly<{
      kind: 'record-card-reconciliation'
      receipt: CommandReceipt
      reconciliation: CardReconciliationRecord
    }>
  | Readonly<{
      kind: 'record-legacy-return'
      receipt: CommandReceipt
      legacyReturn: LegacyInvocationReturn
    }>
  | Readonly<{
      kind: 'record-tool-association'
      receipt: CommandReceipt
      association: ToolAssociationRecord
    }>
