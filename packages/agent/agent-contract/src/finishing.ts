// Finishing types of the Agent contract (SPEC "条件终结", "取消判断与路线", "终结责任清单" and
// "commitSettlement 的变体"): the candidate content a commit fixes, the candidate and route records
// the Journal keeps, the issued obligations, the settlement projection of the snapshot, the trusted
// cancellation judgment with its installation, and the six settlement variants. Types, and the one
// pure rule that derives an obligation's category from its kind. `FinishIntent`, the projection of
// the current candidate, lives in execution.ts next to the execution state that carries it.
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

// ------------------------------------------------------------------------------------------
// The candidate and its route (SPEC "候选与路线")

/**
 * The business content of an ordinary candidate, written by the F1 commit in `JournalCommit.finish`
 * (SPEC "条件终结" 1). The checkpoint of the candidate is the `checkpoint` of the same commit, so it
 * is not repeated here. `origin` resolves to the evaluation that proposed the candidate and
 * `conditions` to the condition facts that evaluation read; both are fixed records of their owners.
 */
export type FinishCandidateContent = Readonly<{
  origin: DurableEvidence
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: DurableEvidence
  conditions: DurableEvidence
}>
/**
 * One candidate record of the Journal. `candidate` is the first F1 operation of an ordinary
 * candidate and the establishing operation of a cancellation candidate. The content never changes
 * after it is established; a changed premise establishes a new candidate with a supersession link.
 */
export type FinishCandidate = Readonly<{
  candidate: AgentOperationId
  origin: DurableEvidence
  conclusion: AgentConclusion
  failure: FailureCandidate | null
  inputWatermark: DurableEvidence
  checkpoint: AgentCheckpoint
  conditions: DurableEvidence
}>
/**
 * One entry of the legacy before-terminal plan that a migration fixes (SPEC "MigrationRecord"
 * progress row): either an extension that never started, with the evidence that excludes its
 * original and any late start, or the complete original Passage with its immutable version.
 */
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
/**
 * The route of a candidate to its before-terminal judgment. The author route carries the proof of
 * the before-terminal passage once the commit that completes it holds; the cancellation route is
 * immutable and points at its installation, with the operation that created it natively or by
 * migration.
 */
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
/** The link from a superseded candidate to the candidate that replaced it (SPEC "旧记录的选择"). */
export type CandidateSupersession = Readonly<{
  from: AgentOperationId
  to: AgentOperationId
  /** The cancel control when a complete or failed candidate was replaced by a cancelled one; null otherwise. */
  control: AgentOperationId | null
  revision: ExecutionRevision
  route: FinishRoute
}>

// ------------------------------------------------------------------------------------------
// The obligations (SPEC "终结责任清单")

/** The closed reasons of a `pending` disposition. Each names what the owner still owes. */
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
/** The closed actions a `RecoveryContinuation` names. None is an arbitrary command or a callback. */
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
/**
 * The original public operation one continuation runs (SPEC "终结责任清单", RecoveryContinuation):
 * its complete parameters, a stable record that holds them under its exact schema, or, when that
 * record does not resolve, the original key with the source that is missing. A continuation is
 * never an arbitrary command or a callback.
 */
export type ContinuationRequest<Parameters> =
  | Readonly<{ kind: 'parameters'; value: Parameters }>
  | Readonly<{ kind: 'record'; schema: Adoption; record: DurableEvidence }>
  | Readonly<{ kind: 'unresolved'; key: string; missing: DurableEvidence }>
/**
 * The common members of every continuation: the action, the request of the original public
 * operation, the owner now responsible, the custodian that accepted the material when one has,
 * and the public operation whose qualification the continuation uses.
 */
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
/** The material branch of a `recordHandoff` request (SPEC "准入结果保管"). */
export type HandoffRecordMaterial =
  | Readonly<{ kind: 'source-bound-request' }>
  | Readonly<{ kind: 'observed-operation'; originalCall: DurableEvidence }>
/**
 * The one continuation that completes an obligation, one closed variant per action (SPEC
 * "终结责任清单", RecoveryContinuation). The four handoff actions carry the parameters and the
 * qualification of the SPEC handoff table; `original-invoke-recovery` only locates the complete
 * original request, it is not an unconditional invoke; `tool-association-retain` carries the fixed
 * trusted return source and the original registration request.
 */
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
/** One unknown of a judgment: who owns the fact, which obligation it concerns, where it is queried and why it is unknown. */
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
/** The four dispositions of one obligation (SPEC "ObligationDisposition"). */
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
/** The five categories of the SPEC "条件终结" table; the kind of an obligation fixes its category. */
export type ObligationCategory = 'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
/**
 * The common head of every obligation: its kind, the original identity key the SPEC table names,
 * the fixed source and version, the consumer position when one applies, and the disposition. The
 * key is text built from the existing identities, never a fresh random id. The category is not a
 * member: the SPEC table fixes it per kind.
 */
type ObligationHead<K extends string> = Readonly<{
  kind: K
  key: string
  source: DurableEvidence
  version: DurableEvidence
  position: ConsumerRef | null
  disposition: ObligationDisposition
}>
/**
 * The closed union of obligations (SPEC "终结责任清单" table). The `control` item carries only its
 * head and key: its required content is the named gap U-9 of the open questions page, so no provider
 * can claim it from one chosen content.
 */
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
        /** The original record the result of the operation belongs to; null while it is not committed. */
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
        /** The existing interrupt requests of this call: the operations of its interrupt or background controls. */
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
        /** The stable invalidate operation of the round with its fixed reason; null while none was issued. */
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
        /** The basis on which the custodian accepted the material; null while nobody has. */
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
/**
 * The category of one obligation kind, as the SPEC "终结责任清单" table fixes it. The category is
 * not a member of the public head; a Journal and a policy derive it from the kind.
 */
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
/** One facet of the responsibility coverage: its owner, fixed version and complete read evidence. */
export type CoverageFacet = Readonly<{
  owner: string
  version: DurableEvidence
  read: DurableEvidence
}>
/** The coverage of the responsibility closure of one execution (SPEC "ResponsibilityCoverage"). */
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
/** The read-only terminal condition of one external participant of a coordinated binding. */
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
/** The participant facts of the binding (SPEC "TerminalParticipantFacts"). */
export type TerminalParticipantFacts =
  | Readonly<{ kind: 'standalone'; basis: DurableEvidence }>
  | Readonly<{
      kind: 'coordinated'
      association: DurableEvidence
      participants: readonly TerminalParticipantFact[]
    }>
/**
 * The obligations that one `prepareFinish` issued (SPEC "终结责任清单"): bound to the tenant and
 * execution of its operation, the candidate and its fixed content, the complete items with their
 * dispositions, and the coverage. `evidence` is what `FinishIntent.obligations` points at. The list
 * is immutable; dispositions advance in later records of their own.
 */
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

// ------------------------------------------------------------------------------------------
// The trusted cancellation judgment (SPEC "取消判断与路线")

/** The immutable installation that governance issued for the cancellation policy (SPEC "安装记录与资格"). */
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
/** The authoritative input the Journal builds for one judgment (SPEC "判断输入、判据与记录"). */
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
/** One blocked reason of a judgment: the category, the key, the pending reason, the source and the continuation. */
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
/** The pure judgment implementation that governance installs; it is not an author invoke. */
export interface CancellationPolicy {
  readonly policy: Adoption
  readonly implementation: Adoption
  judge(input: CancellationJudgmentInput): CancellationDecision
}
/** The immutable record of one judgment; a newer one points at it through `supersedes`. */
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

// ------------------------------------------------------------------------------------------
// The settlement records (SPEC "commitSettlement 的变体")

/** The excluded predecessor of a migration or an association request, with its chain back to root. */
export type ExcludedPredecessor = Readonly<{
  operation: AgentOperationId
  request: DurableEvidence
  exclusion: DurableEvidence
  chain: readonly AgentOperationId[]
}>
/** The record of one policy switch of a cancelled candidate (SPEC "MigrationRecord" table). */
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
/** The late return of an author invocation that started before the cancellation fence (SPEC "迟到的作者调用返回"). */
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
/** The stable key of one Tool call obligation (SPEC "commitSettlement 的变体", Tool paragraph). */
export type ToolIntentKey = Readonly<{
  intent: AgentOperationId
  action: ActionId
  position: ConsumerRef
}>
/** The association record of one Tool return a trusted host kept (SPEC "record-tool-association"). */
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
/** The responsibility of one card round as a reconciliation recorded it. */
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
/**
 * The settlement projection of a snapshot at one revision (SPEC "ExecutionSnapshot.settlement"):
 * the current candidate and route, the chain of surviving candidates, the migration, judgment,
 * card, legacy-return and association records, and the current judgment pointer.
 */
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

// ------------------------------------------------------------------------------------------
// The six variants of commitSettlement

type CancelAuthorization = Extract<FinishAuthorization, { kind: 'cancel' }>
/**
 * The request of `commitSettlement`, one closed variant per kind. The candidate, migration and
 * judgment variants carry `expected` and the cancel authorization; the custody variants carry
 * neither. No variant carries a checkpoint, effects, events, a CallerCommit or a state.
 */
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
/** The complete success result of each variant; the same operation answers it again. */
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
