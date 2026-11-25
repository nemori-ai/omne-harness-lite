import type { SavedModelSelection } from './control-values.ts'
import type { SessionPermissions } from './permission-values.ts'
import type { AuthorizationContext, AuthorizationExpression } from './authorizations.ts'
import type { PermissionDefinitionRef, PermissionRule } from '@omne-harness/permissions'
import type { TodoItem } from './todos.ts'
import type { BackgroundCallRecord, StopInitiator } from './background-calls.ts'
import type { SessionWorkEntryIndex } from './work-entry-values.ts'
import type { JsonValue } from '@omne-harness/json-text'
import type { CompactionMessage, Message } from '@omne-harness/message'
import type { TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type { SessionHistoryIndex } from './history-values.ts'
import type { SessionCallRecord, SessionCallWait } from './call-values.ts'
import type { SessionEntriesProgress } from './interpretation-values.ts'
import type {
  Adoption,
  AdvanceRef,
  AttemptId,
  ConsumerRef,
  ConsumptionId,
  DurableEvidence,
  InputId,
  ResidentKey,
  BatchId,
  RunId,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'

import type { InputSourceName } from './input-sources.ts'
export type ResidentTool = Readonly<{
  capability: string
  version: string
  shape: JsonValue
  admitted: DurableEvidence
  definition?: JsonValue
}>
export type ResidentSegment = Readonly<{
  key: string
  text: string
  sources: readonly ResidentSegmentSource[]
}>
export type ResidentSegmentSource = Readonly<{ category: string; name: string; digest: string }>
export type AdoptionNote = Readonly<{ kind: 'kept' | 'waiting'; reason: string }>
export type SessionFrozen = Readonly<{
  cause: 'tool-shape-lost'
  capability: string
  evidence: DurableEvidence
  commit: DurableEvidence
}>
export type ExecutionRef = Readonly<{
  execution: string
  revision: string | null
  evidence: DurableEvidence | null
  readThrough: string
}>
export type Participation = Readonly<{
  execution: string
  operation: string
  joint: 'message' | 'context-transition' | 'custody' | 'processed' | 'delivered'
  written: string
  handover: DurableEvidence
}>
export type ProducerRef =
  | Readonly<{ kind: 'model'; call: string }>
  | Readonly<{ kind: 'tool'; call: string }>
export type CallBinding = Readonly<{
  producer: ProducerRef
  action: string
  consumer: ConsumerRef
  request: DurableEvidence
  initiatingAttempt: AttemptId | null
}>
export type ProducedResult = Readonly<{
  producer: ProducerRef
  version: string
  delivery: string | null
  source: DurableEvidence
}>
export type ResultConsumption = Readonly<{
  result: ProducedResult
  custody: DurableEvidence | null
  completion: DurableEvidence | null
  release: 'pending' | 'confirmed'
}>
export type WorkspaceDirectoryVisit = Readonly<{
  batch?: string
  workspace: string
  instance: string
  generation: string
  directories: readonly string[]
}>
export type Consumption = Readonly<{
  id: ConsumptionId
  binding: CallBinding
  results: readonly ResultConsumption[]
  delivered?: DurableEvidence
}>
export type InputBatch = Readonly<{
  id: BatchId
  watermark: DurableEvidence
  ordered: readonly InputId[]
}>
export type RunFailure =
  | Readonly<{ kind: 'node-failed'; node: string; category: string; failureKind: string }>
  | Readonly<{ kind: 'model-refused'; failure: string }>
  | Readonly<{
      kind: 'no-reply'
      cause: string | null
      upstreamStatus: string | null
      diagnostic: string | null
    }>
  | Readonly<{ kind: 'cannot-fit'; reason: string }>
  | Readonly<{
      kind:
        | 'request-rejected'
        | 'compaction-invalid'
        | 'compaction-failed'
        | 'message-rejected'
        | 'extension-stop'
        | 'guard'
    }>
export type RunEnd = Readonly<{
  conclusion: 'complete' | 'fail' | 'cancelled'
  failure: RunFailure | null
}>
export type RunTerminal = Readonly<{
  run: RunId
  outcome: 'completed' | 'failed' | 'cancelled'
  evidence: DurableEvidence
}>
export type RunState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'active'
      run: RunId
      adoption: Adoption
      first: InputId
      advance: AdvanceRef | null
      ordinal: string
      execution: ExecutionRef
      revision: SessionRevision
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
export type Waiting =
  | Readonly<{ kind: 'producer'; binding: CallBinding; position: string }>
  | Readonly<{
      kind: 'extension-batch'
      passage: string
      position: string
      members: readonly Readonly<{
        action: string
        card: DurableEvidence
        decision: DurableEvidence | null
      }>[]
    }>
  | Readonly<{
      kind: 'extension-passage'
      passage: string
      position: string
      members: readonly Readonly<{ card: DurableEvidence; decision: DurableEvidence | null }>[]
    }>
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type BackgroundDisposition =
  | Readonly<{ kind: 'input'; input: InputId }>
  | Readonly<{ kind: 'kept'; reason: 'archived' | 'frozen' }>
export type ControlTarget =
  | Readonly<{ kind: 'run'; run: RunId }>
  | Readonly<{ kind: 'producer'; producer: ProducerRef }>
  | Readonly<{ kind: 'session' }>
export type RoutedInput =
  | Readonly<{
      kind: 'ordinary'
      input: InputId
      message: Message
      origin: DurableEvidence
      source: InputSourceName
      wake?: boolean
      afterRun?: true
    }>
  | Readonly<{
      kind: 'card-decision'
      card: DurableEvidence
      decision: DurableEvidence
      destination: DurableEvidence
    }>
  | Readonly<{
      kind: 'business'
      owner: string
      input: DurableEvidence
      destination: DurableEvidence
    }>
/** An archive that follows the archive of the parent: the parent and the control of the parent it follows. */
export type ArchiveCascade = Readonly<{ parent: SessionId; control: SessionOperationId }>
export type Control =
  | Readonly<{ kind: 'cancel-run'; run: RunId; urgency: 'graceful' | 'force' }>
  | Readonly<{
      kind: 'stop-call'
      producer: ProducerRef
      /** Who asked; Session derives it from the caller class, never from the input. */
      initiator?: StopInitiator
      reason?: string | null
    }>
  | Readonly<{ kind: 'background-tool'; producer: Extract<ProducerRef, { kind: 'tool' }> }>
  | Readonly<{ kind: 'archive'; cascade?: ArchiveCascade }>
  | Readonly<{ kind: 'unarchive' }>
  | Readonly<{ kind: 'retry-run'; run: RunId }>
export type ControlIntent =
  | Readonly<{ kind: 'control'; value: Control }>
  | Readonly<{
      kind: 'interrupt'
      run: RunId
      urgent: Extract<RoutedInput, { kind: 'ordinary' }>
      decision: DurableEvidence
    }>
  | Readonly<{ kind: 'auto-archive'; idleEvidence: DurableEvidence }>
export type ControlProgress = Readonly<{
  operation: SessionOperationId
  target: ControlTarget
  intent: ControlIntent
  state: 'committed' | 'propagating' | 'reconciled'
  pending: readonly ProducerRef[]
  pendingUnassociatedWaiting?: readonly SessionCallWait[]
}>
export type ScopeReleaseDisposition =
  | 'released'
  | 'pending'
  | 'unsupported'
  | 'unavailable'
  | 'not-authorized'
export type RecoveryTask =
  | Readonly<{
      kind: 'initialization'
      item: string
      owner: string
      protocol: Adoption
      input: JsonValue
      originalOperation: SessionOperationId
      state: 'pending' | 'unknown' | 'failed'
      diagnostic: string | null
    }>
  | Readonly<{
      kind: 'cascade'
      child: SessionId
      parentControl: SessionOperationId
      childOperation: SessionOperationId
      intent: Extract<Control, { kind: 'archive' }>
      basis: DurableEvidence
      state: 'pending' | 'unknown' | 'denied'
    }>
  | Readonly<{
      kind: 'routed-input'
      originalOperation: SessionOperationId
      value: Exclude<RoutedInput, { kind: 'ordinary' }>
      state: 'pending' | 'unknown'
    }>
  | Readonly<{
      kind: 'scope-release'
      archive: SessionOperationId
      scope: string
      state: 'pending' | 'unknown'
      last: readonly ScopeReleaseDisposition[]
    }>
export type BoundedClose =
  | Readonly<{ kind: 'uninterpretable'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'admission-rejected'; input: InputId; rejection: DurableEvidence }>
  | Readonly<{
      kind: 'drive-refused'
      failure: 'invalid' | 'unsupported'
      field: string | null
      reason: string | null
      input: InputId | null
    }>
export type ModelProvenance = Readonly<{ owner: string; key: string; blocks: readonly string[] }>

export type DerivedMessage =
  | Readonly<{
      kind: 'model-projection'
      epoch: string
      restoreOriginals?: true
      blocks: readonly string[]
      source: DurableEvidence
    }>
  | Readonly<{ kind: 'compaction'; message: CompactionMessage; epoch: string }>
  | Readonly<{
      kind: 'context-reminder'
      message: Message
      source: DurableEvidence
      provenance?: readonly ModelProvenance[]
    }>

export type Modes = Readonly<{
  permission: 'never' | 'auto_permission' | 'bypass-permissions'
  environment: Adoption
  collaboration: 'co-work' | 'auto-drive'
}>
export type WorkspaceAttachment = Readonly<{ instance: string; basis: string }>
export type SessionCreation = Readonly<{
  definition: Readonly<{ name: string; candidate: Adoption }>
  execution: Adoption
  requiredIdentities: readonly Readonly<{ capability: string; name: string }>[]
  purpose: string
  workspace: WorkspaceId | null
  workspaceAttachment: WorkspaceAttachment | null
  modes:
    | Readonly<{ kind: 'explicit'; value: Modes }>
    | Readonly<{ kind: 'tenant-default'; source: Adoption }>
  initial: Extract<RoutedInput, { kind: 'ordinary' }> | null
  entryContract: Adoption
  initialModelSelection?: SavedModelSelection
  residentAdoption?: ResidentAdoption
  initialization?: InitializationSources
  relation?: Relation
  attendance?: Attendance
  fork?: import('./fork.ts').SessionFork
}>
export type InitializationSource = Readonly<{
  item: string
  owner: string
  protocol: Adoption
}> &
  (
    | Readonly<{
        kind: 'context-registration'
        input: Omit<
          Extract<DeclarationChange, { kind: 'context-registration' }>,
          'kind' | 'registration'
        >
      }>
    | Readonly<{ kind: 'workspace-load' }>
    | Readonly<{ kind: 'execution-adoption' }>
  )
export type InitializationSources = Readonly<{
  sources: readonly InitializationSource[]
  results: readonly InitializationResult[]
}>
export type InitializationResult = Readonly<{
  item: string
  owner: string
  result:
    | Readonly<{ kind: 'ready'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'failed'; diagnostic: string; recovery: DurableEvidence }>
}>
export type ContextMaterial = Readonly<{ schema: Adoption; value: JsonValue }>
export type DeclarationChange =
  | Readonly<{
      kind: 'permission-assignment'
      capabilityId: string
      enforcementKey: string
      definition: PermissionDefinitionRef
      rule: PermissionRule | null
      expectedRevision: string
      authorization: DurableEvidence
    }>
  | Readonly<{
      kind: 'authorization-expression'
      expression: AuthorizationExpression
      authorization: DurableEvidence
    }>
  | Readonly<{
      kind: 'permission-mode'
      value: Modes['permission']
      expectedRevision: string
      authorization: DurableEvidence
    }>
  | Readonly<{
      kind: 'collaboration-mode'
      value: Modes['collaboration']
      authorization: DurableEvidence
    }>
  | Readonly<{
      kind: 'environment-mode'
      value: Adoption
      authorization: DurableEvidence
      setting: DurableEvidence
    }>
  | Readonly<{
      kind: 'workspace'
      value: WorkspaceId | null
      workspaceAttachment: WorkspaceAttachment | null
      basis: DurableEvidence
    }>
  | (Readonly<{ kind: 'model' }> & SavedModelSelection)
  | Readonly<{ kind: 'declaration'; item: string; value: JsonValue | null; basis: DurableEvidence }>
  | Readonly<{
      kind: 'context-registration'
      registration: DurableEvidence
      need: ContextMaterial
      binding: ContextMaterial
      parameters: ContextMaterial
    }>
  | Readonly<{
      kind: 'context-step-commit'
      basis: DurableEvidence
      updates: readonly Readonly<{ block: string; value: ContextMaterial }>[]
    }>
  | Readonly<{
      kind: 'recovery-input'
      item: string
      value: DurableEvidence
      basis: DurableEvidence
    }>
export type Relation =
  | Readonly<{ kind: 'main' }>
  | Readonly<{ kind: 'child'; parent: SessionId; basis: DurableEvidence }>
  | Readonly<{ kind: 'handoff'; origin: SessionId; basis: DurableEvidence }>
export type Attendance = 'attended' | 'unattended'
export type SessionTree = Readonly<{ root: SessionId; depth: number }>
export type ClockSample = Readonly<{ at: string; protocol: Adoption; source: DurableEvidence }>
export type IdleCoverage = Readonly<{
  own: DurableEvidence
  relations: DurableEvidence
  children: readonly Readonly<{ session: SessionId; work: DurableEvidence }>[]
  calls: readonly Readonly<{ producer: ProducerRef; state: DurableEvidence }>[]
  completeScope: DurableEvidence
}>
export type IdleObservation =
  | Readonly<{
      kind: 'interval'
      started: string
      through: ClockSample
      elapsedMs: string
      coverage: IdleCoverage
      source: DurableEvidence
    }>
  | Readonly<{
      kind: 'interrupted'
      at: ClockSample
      cause: DurableEvidence
      source: DurableEvidence
    }>
  | Readonly<{ kind: 'unknown'; at: ClockSample; scope: DurableEvidence; source: DurableEvidence }>
export type AutoArchivePolicy =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'enabled'; idleMs: string }>
export type FreezeVerdict = Readonly<{
  cause: 'tool-shape-lost'
  capability: string
  evidence: DurableEvidence
}>

export type WorkSnapshot = Readonly<{
  workEntryIndex?: SessionWorkEntryIndex
  session: SessionId
  tenant: TenantId
  revision: SessionRevision
  interpreter: Adoption
  source: DurableEvidence
  lifecycle: 'initializing' | 'dormant' | 'active' | 'frozen' | 'archived'
  frozen: SessionFrozen | null
  residents: readonly ResidentTool[]
  definition: Readonly<{ name: string; adopted: Adoption }>
  execution: Adoption
  declarations: DurableEvidence
  permissions: SessionPermissions
  /** The authorizations a person expressed in this session that are in force now. */
  authorizations: AuthorizationContext
  revisions: Readonly<{ workspace: string; declarations: string }>
  run: RunState
  pending: readonly InputId[]
  handed: readonly InputId[]
  waiting: readonly Waiting[]
  consumptions: readonly Consumption[]
  controls: readonly ControlProgress[]
  unresolved: readonly SessionOperationId[]
  creation: SessionCreation
  tasks: readonly RecoveryTask[]
  idle: Readonly<{ observation: IdleObservation; commit: DurableEvidence }> | null
  todos?: readonly TodoItem[]
  executions?: readonly RunExecution[]
  residentKeys?: ResidentAdoption['keys']
  segments?: readonly ResidentSegment[]
  relation?: Relation
  tree?: SessionTree
  attendance?: Attendance
  resident?: boolean
  children?: readonly SessionId[]
  autoArchive?: AutoArchivePolicy
  taken?: readonly InputId[]
  unanswered?: readonly InputId[]
  awaitingPerson?: true
  backgroundPlaceholders?: readonly ConsumptionId[]
  /** The calls in the background, with their short numbers; the last number given so far. */
  backgroundCalls?: readonly BackgroundCallRecord[]
  backgroundOrdinal?: number
  uncountedInputs?: readonly InputId[]
  /** Pending inputs that cannot start a Run on their own; they go in with the next batch. */
  quietInputs?: readonly InputId[]
  deferredInputs?: readonly Readonly<{ input: InputId; run: RunId | null }>[]
  /** Inputs delivered to the model view since the last assistant message. */
  deliveredTail?: readonly InputId[]
  releasedScopes?: readonly Readonly<{ task: SessionOperationId; scope: string }>[]
  contextScopes?: readonly ContextScopeBinding[]
  contextRecords?: readonly Readonly<{ scope: string; declaration: DeclarationChange }>[]
  workspaceVisit?: WorkspaceDirectoryVisit
  workspaceBackgroundVisits?: readonly Readonly<{
    consumption: ConsumptionId
    visit: WorkspaceDirectoryVisit
    input?: InputId
  }>[]
  changes?: readonly DeclarationChange[]
  initialization?: InitializationState
  historyIndex?: SessionHistoryIndex
  callRegistrations?: readonly SessionCallRecord[]
  callWaits?: readonly SessionCallWait[]
  unansweredCalls?: readonly string[]
  entriesProgress?: readonly SessionEntriesProgress[]
}>

export type SessionWaiting = Readonly<{
  run: RunId
  pending: number
  execution: string | null
}>

export type ResidentAdoption = Readonly<{
  residents: readonly ResidentTool[]
  keys: readonly Readonly<{ capability: string; key: ResidentKey }>[]
  segments?: readonly ResidentSegment[]
}>
export type RunExecution = Readonly<{
  run: RunId
  execution: ExecutionRef
  terminal: RunTerminal | null
}>
export type ContextScopeBinding = Readonly<{
  generation: string
  scope: string
  operation: SessionOperationId
  ended: DurableEvidence | null
}>

export type InitializationPlanItem = Readonly<{
  kind: 'identity' | InitializationSource['kind']
  owner: string
  item: string
  protocol: Adoption
  originalInput: JsonValue
}>

export type InitializationRegistration = Readonly<{
  scope: string
  tenant: string
  key: string
  commit: string
  basedOn: number
  revision: number
  creating: true
  required: true
  need: ContextMaterial
  binding: ContextMaterial
  parameters: ContextMaterial
}>

export type InitializationRequirement = Readonly<{
  kind:
    | 'entry-contract'
    | 'identity'
    | 'context-registration'
    | 'workspace-load'
    | 'execution-preparation'
  key: string
  requirement: DurableEvidence
  resolution:
    | Readonly<{ kind: 'satisfied'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'planned'; owner: string; item: string }>
}>

export type InitializationAdoption = Readonly<{
  definitionName: string
  adopted: Adoption
  source: DurableEvidence
  boundary: DurableEvidence
  inputSnapshot: ContextMaterial
  capabilities: ContextMaterial
  residentBindings: ResidentAdoption['keys']
  newResidents: ResidentAdoption['residents']
  newSegments?: readonly ResidentSegment[]
}>
export type InitialAdoption = InitializationAdoption & Readonly<{ candidate: Adoption }>
export type InitializationConsequence =
  | Readonly<{ kind: 'identity'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'workspace-load'; evidence: DurableEvidence }>
  | Readonly<{
      kind: 'context-registration'
      prepared: DurableEvidence
      decision: InitializationRegistration
    }>
  | Readonly<{
      kind: 'execution-ready'
      evidence: DurableEvidence
      adoption: InitializationAdoption | null
    }>
export type InitializationGuardResult = Readonly<{
  owner: string
  item: string
  result: InitializationResult
  consequence: InitializationConsequence | null
}>
export type InitializationGuardFacts = Readonly<{
  version: 1
  command: 'create' | 'completeInitialization'
  binding: Readonly<{ tenant: string; session: string; operation: string; createOperation: string }>
  input: JsonValue
  initialAdoption: InitialAdoption | null
  requirements: readonly InitializationRequirement[] | null
  plan: readonly InitializationPlanItem[]
  results: readonly InitializationGuardResult[]
}>
export type InitializationFactReference =
  | Readonly<{ kind: 'batch'; ordinal: number }>
  | Readonly<{ kind: 'committed'; entry: DurableEvidence }>

export type InitializationResultRecord = Readonly<{
  operation: SessionOperationId
  outcome: InitializationGuardResult
  facts: readonly InitializationFactReference[]
  entry: DurableEvidence
  revision: string
  range: Readonly<{ first: import('./identity.ts').EntryId; last: import('./identity.ts').EntryId }>
}>
export type InitializationState = Readonly<{
  protocol: 1
  createOperation: SessionOperationId
  initialAdoption: InitialAdoption
  input: JsonValue
  requirements: readonly InitializationRequirement[]
  plan: readonly InitializationPlanItem[]
  results: readonly InitializationResultRecord[]
  registrations: readonly Readonly<{
    plan: InitializationPlanItem
    prepared: DurableEvidence
    decision: InitializationRegistration
    entry: DurableEvidence
  }>[]
}>
