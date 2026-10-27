// The values of the work snapshot and the fixed inputs of the commands (SPEC「值与结果项的约束」).
// Session keeps no continuation value: `ExecutionRef` points at the Agent's authoritative record.
import type { JsonValue } from '@omne-harness/json-text'
import type { CompactionMessage, Message } from '@omne-harness/message'
import type { TenantId, WorkspaceId } from '@omne-harness/legal-identity'
import type {
  Adoption,
  AdvanceRef,
  AttemptId,
  ConsumerRef,
  ConsumptionId,
  DurableEvidence,
  InputId,
  BatchId,
  RunId,
  SessionId,
  SessionOperationId,
  SessionRevision,
} from './identity.ts'

/** First-loaded definition of one resident tool, as Tool reported it. shape is opaque to this member. */
export type ResidentTool = Readonly<{
  capability: string
  version: string
  shape: JsonValue
  admitted: DurableEvidence
}>
export type SessionFrozen = Readonly<{
  cause: 'tool-shape-lost'
  evidence: DurableEvidence
  commit: DurableEvidence
}>
/**
 * Points at the Agent's authoritative record. revision and evidence come from the latest Agent event
 * read or the latest participated commit; both are null before the first one. readThrough is the
 * last Agent event sequence read and saved; "0" before the first event.
 */
export type ExecutionRef = Readonly<{
  execution: string
  revision: string | null
  evidence: DurableEvidence | null
  readThrough: string
}>
/** P-2 material handed over by the execution record provider when Session acts as a commit participant. */
export type Participation = Readonly<{
  execution: string
  operation: string
  joint: 'message' | 'context-transition' | 'custody' | 'processed'
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
export type Consumption = Readonly<{
  id: ConsumptionId
  binding: CallBinding
  results: readonly ResultConsumption[]
}>
/** One Agent input batch as the Agent's input-taken event reported it. Session never reselects it. */
export type InputBatch = Readonly<{
  id: BatchId
  watermark: DurableEvidence
  ordered: readonly InputId[]
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
    }>
  | Readonly<{ kind: 'terminal'; terminal: RunTerminal }>
/** passage and position are the Agent's names, saved and echoed as given. The contract has no dependency on the Agent contract, so it does not narrow them. */
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
  | Readonly<{ kind: 'dependency'; owner: string; position: string }>
export type ControlTarget =
  | Readonly<{ kind: 'run'; run: RunId }>
  | Readonly<{ kind: 'producer'; producer: ProducerRef }>
  | Readonly<{ kind: 'session' }>
export type RoutedInput =
  | Readonly<{ kind: 'ordinary'; input: InputId; message: Message; origin: DurableEvidence }>
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
export type Control =
  | Readonly<{ kind: 'cancel-run'; run: RunId; urgency: 'graceful' | 'force' }>
  | Readonly<{ kind: 'stop-call'; producer: ProducerRef }>
  | Readonly<{ kind: 'background-tool'; producer: Extract<ProducerRef, { kind: 'tool' }> }>
  | Readonly<{ kind: 'archive' }>
  | Readonly<{ kind: 'unarchive' }>
export type ControlIntent =
  | Readonly<{ kind: 'control'; value: Control }>
  | Readonly<{
      kind: 'interrupt'
      run: RunId
      urgent: Extract<RoutedInput, { kind: 'ordinary' }>
      decision: DurableEvidence
    }>
  | Readonly<{ kind: 'auto-archive'; idleEvidence: DurableEvidence }>
/** state: committed = intent saved; propagating = some producer still unconfirmed; reconciled = all confirmed. The superseded `startFence` is not here: the tool start fence is the Agent journal `start-fence` entry (#672 J03). */
export type ControlProgress = Readonly<{
  operation: SessionOperationId
  target: ControlTarget
  intent: ControlIntent
  state: 'committed' | 'propagating' | 'reconciled'
  pending: readonly ProducerRef[]
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
/** Bounded close by Session. Always ends as failed. "No record yet" and "execution ended" are not grounds. */
export type BoundedClose =
  | Readonly<{ kind: 'uninterpretable'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'admission-rejected'; input: InputId; rejection: DurableEvidence }>
export type DerivedMessage =
  | Readonly<{ kind: 'compaction'; message: CompactionMessage }>
  | Readonly<{ kind: 'context-reminder'; message: Message; source: DurableEvidence }>

export type Modes = Readonly<{
  permission: 'never' | 'auto_permission' | 'bypass-permissions'
  environment: Adoption
  collaboration: 'co-work' | 'auto-drive'
}>
/**
 * The workspace attachment: the instance axis and the version axis. The semantic owner of this
 * shape is the workspace domain (docs/domains/workspaces); both fields are non-empty text whose
 * format belongs to that domain. Once the workspace contract member is published, this type is
 * imported from there.
 */
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
      kind: 'permission-mode'
      value: Modes['permission']
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
  | Readonly<{ kind: 'model'; name: string; basis: DurableEvidence }>
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
  | Readonly<{ kind: 'main'; resident: boolean }>
  | Readonly<{ kind: 'child'; parent: SessionId; basis: DurableEvidence }>
  | Readonly<{ kind: 'handoff'; origin: SessionId; basis: DurableEvidence }>
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
/** Tool's adoption-point verdict that a resident tool cannot keep its shape. */
export type FreezeVerdict = Readonly<{ cause: 'tool-shape-lost'; evidence: DurableEvidence }>

export type WorkSnapshot = Readonly<{
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
}>
