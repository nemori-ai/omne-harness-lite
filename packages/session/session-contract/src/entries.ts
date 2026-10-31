// The one encoding of commands into log entries and back (SPEC「领域服务与归约」: "命令到条目的编码只
// 此一份"). The `kind` short names follow the event catalog (docs/object-model/session-log-events.md);
// the SE numbers are navigation only. `decide` encodes with `encodeEntry`; `reduce` decodes with
// `decodeEntry`. A payload is plain JSON: the tenant and the workspace of the creation travel as
// their legal-identity text, and every other value as it is.
import type { JsonValue } from '@omne-harness/json-text'
import {
  tenantCodec,
  workspaceCodec,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import type { Message } from '@omne-harness/message'
import type {
  Adoption,
  AgentInstanceRef,
  AttemptId,
  ConsumptionId,
  DurableEvidence,
  InputId,
  RunId,
  SessionId,
  SessionOperationId,
} from './identity.ts'
import type {
  BoundedClose,
  InitializationResult,
  Participation,
  RecoveryTask,
  RunTerminal,
  SessionCreation,
  ResidentAdoption,
  ResidentTool,
  DeclarationChange,
  Relation,
  AutoArchivePolicy,
  IdleObservation,
  ControlProgress,
  ContextScopeBinding,
  CallBinding,
  ProducedResult,
  InputBatch,
  Waiting,
  ExecutionRef,
} from './values.ts'
import type { EntryClass, HistoryEntry } from './faces.ts'
import type { EncodedEntry } from './judgments.ts'
import type {
  InitialAdoption,
  InitializationAdoption,
  InitializationGuardResult,
  InitializationFactReference,
  InitializationPlanItem,
  InitializationRequirement,
  InitializationRegistration,
} from './values.ts'
import { SESSION_RELEASE_DIGEST } from './release-digests.ts'
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts'

/**
 * The interpreter of this member: the adoption that every snapshot and entry schema names.
 * Revision 3 records verified initial adoption and the bound initialization plan.
 */
export const SESSION_INTERPRETER: Adoption = Object.freeze({
  owner: '@omne-harness/session-contract',
  name: 'session-log',
  revision: '3',
  digest: SESSION_RELEASE_DIGEST,
})

/** The initialization item of one required identity (SE01 → `tasks.initialization`). */
export type InitializationItem = Omit<
  Extract<RecoveryTask, { kind: 'initialization' }>,
  'kind' | 'originalOperation' | 'state' | 'diagnostic'
>

export type SessionEntry =
  | Readonly<{
      kind: 'session.created'
      tenant: TenantId
      session: SessionId
      operation: SessionOperationId
      creation: SessionCreation
      items: readonly InitializationItem[]
      initializationProtocol: 1
      initialAdoption: InitialAdoption
      requirements: readonly InitializationRequirement[]
      plan: readonly InitializationPlanItem[]
      input: JsonValue
    }>
  | Readonly<{
      kind: 'session.initialization-item'
      result: InitializationResult
      createOperation: SessionOperationId
      operation: SessionOperationId
      plan: InitializationPlanItem
      outcome: InitializationGuardResult
      facts: readonly InitializationFactReference[]
    }>
  | Readonly<{
      kind: 'session.adoption'
      adopted: Adoption
      residentKeys?: ResidentAdoption['keys']
      initialization?: Readonly<{
        createOperation: SessionOperationId
        item: Readonly<{ owner: string; item: string }> | null
        adoption: InitializationAdoption
      }>
    }>
  | Readonly<{
      kind: `message.${Message['role']}`
      message: Message
      source: DurableEvidence
      admission: DurableEvidence | null
      consumption: ConsumptionId | null
      participation: Participation | null
    }>
  | Readonly<{
      kind: 'intake.routed'
      input: InputId
      destination: 'current-run' | 'next-run'
      run: RunId | null
      origin: DurableEvidence
    }>
  | Readonly<{
      kind: 'intake.handed-over'
      input: InputId
      execution: string
      result:
        | Readonly<{ kind: 'accepted'; receipt: DurableEvidence }>
        | Readonly<{ kind: 'rejected'; reason: string; rejection: DurableEvidence }>
    }>
  | Readonly<{
      kind: 'run.started'
      run: RunId
      execution: string
      entry: EntryClass
      first: InputId
      predecessor: RunId | null
      adoption: Adoption
    }>
  | Readonly<{
      kind: 'run.attempt-started'
      run: RunId
      attempt: AttemptId
      ordinal: string
      instance: AgentInstanceRef
      reason: 'start' | 'claim' | 'reload'
    }>
  | Readonly<{
      kind: 'run.attempt-released'
      run: RunId
      attempt: AttemptId
      reason: 'ended' | 'bounded' | 'cancelled' | 'released' | 'superseded'
    }>
  | Readonly<{
      kind: 'run.terminal'
      terminal: RunTerminal
      sequence: string | null
      cause: DurableEvidence | null
      disposition: DurableEvidence | null
      bounded: BoundedClose | null
    }>
  | Readonly<{ kind: 'session.tool-resident-admitted'; resident: ResidentTool }>
  | Readonly<{
      kind:
        | 'session.mode-changed'
        | 'session.model-selected'
        | 'session.declaration-adopted'
        | 'session.context-registration-changed'
        | 'session.recovery-input-adopted'
      declaration: DeclarationChange
      scope: string | null
      initialization?: Readonly<{
        createOperation: SessionOperationId
        plan: InitializationPlanItem
        prepared: DurableEvidence
        decision: InitializationRegistration
      }>
    }>
  | Readonly<{
      kind: 'session.workspace-changed'
      workspace: WorkspaceId | null
      workspaceAttachment: SessionCreation['workspaceAttachment']
      basis: DurableEvidence
    }>
  | Readonly<{ kind: 'session.declaration-adopted'; policy: AutoArchivePolicy }>
  | Readonly<{ kind: 'session.relation' | 'session.resident'; relation: Relation }>
  | Readonly<{ kind: 'session.idle-evidence'; observation: IdleObservation | null }>
  | Readonly<{ kind: 'session.frozen'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'intake.released'; inputs: readonly InputId[] }>
  | Readonly<{ kind: 'intake.routed'; task: Extract<RecoveryTask, { kind: 'routed-input' }> }>
  | Readonly<{
      kind: 'hitl.decision'
      value: Extract<import('./values.ts').RoutedInput, { kind: 'card-decision' }>
    }>
  | Readonly<{ kind: 'run.attempt-exited'; advance: import('./identity.ts').AdvanceRef }>
  | Readonly<{ kind: 'run.batch-taken'; run: RunId; batch: InputBatch }>
  | Readonly<{
      kind: 'call.bound'
      consumption: ConsumptionId
      registration: SessionCallRegistration
      association: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'call.bound'
      consumption: ConsumptionId
      binding: CallBinding
      reference: string
      purpose: 'main' | 'action'
    }>
  | Readonly<{
      kind: 'call.execution-fact' | 'account.linked'
      fact: import('./faces.ts').ProducerFact
      consumption?: ConsumptionId
      result?: ProducedResult | null
    }>
  | Readonly<{
      kind: 'call.result-preserved'
      consumption: ConsumptionId
      result: ProducedResult
      custody: DurableEvidence
      participation: Participation | null
    }>
  | Readonly<{
      kind: 'call.result-processed'
      consumption: ConsumptionId
      result: ProducedResult
      completion: DurableEvidence
      participation: Participation | null
      position: string | null
    }>
  | Readonly<{ kind: 'extension.passage'; run: RunId; waiting: readonly Waiting[] }>
  | Readonly<{
      kind: 'extension.passage'
      run: RunId
      calls: readonly SessionCallWait[]
      other: readonly Exclude<Waiting, { kind: 'producer' }>[]
    }>
  | Readonly<{ kind: 'control.requested'; progress: ControlProgress }>
  | Readonly<{
      kind: 'control.progress'
      progress: ControlProgress | null
      fact: import('./faces.ts').ProducerFact | null
    }>
  | Readonly<{
      kind: 'session.archived'
      operation: SessionOperationId
      scope: ContextScopeBinding
      tasks: readonly RecoveryTask[]
    }>
  | Readonly<{ kind: 'session.unarchived'; scope: ContextScopeBinding }>
  | Readonly<{ kind: 'history.annotated'; targets: readonly string[]; source: DurableEvidence }>
  | Readonly<{ kind: 'history.annotated'; run: RunId; execution: ExecutionRef }>
  | Readonly<{ kind: 'history.annotated'; run: RunId; terminal: RunTerminal }>

export type SessionEntryKind = SessionEntry['kind']

/**
 * The json-text tree of a plain value: strings, finite numbers, booleans, null, arrays and plain
 * objects. `undefined` members are left out. Keys keep their order.
 */
export function toJsonValue(plain: unknown): JsonValue {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') {
    if (!Number.isFinite(plain)) throw new TypeError('a non-finite number has no JSON lexeme')
    return { kind: 'number', lexeme: String(plain) }
  }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(item => toJsonValue(item)) }
  if (typeof plain !== 'object') throw new TypeError(`a ${typeof plain} is not JSON data`)
  const entries: { key: string; value: JsonValue }[] = []
  for (const [key, value] of Object.entries(plain as Record<string, unknown>))
    if (value !== undefined) entries.push({ key, value: toJsonValue(value) })
  return { kind: 'object', entries }
}

/** The plain value of a json-text tree: the inverse of `toJsonValue`. */
export function fromJsonValue(tree: JsonValue): unknown {
  switch (tree.kind) {
    case 'null':
      return null
    case 'boolean':
    case 'string':
      return tree.value
    case 'number':
      return Number(tree.lexeme)
    case 'array':
      return tree.items.map(item => fromJsonValue(item))
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const entry of tree.entries) out[entry.key] = fromJsonValue(entry.value)
      return out
    }
  }
}

/** The entry envelope of one decoded entry: the catalog kind, this member's schema, the origin. */
export function encodeEntry(entry: SessionEntry, origin: HistoryEntry['origin']): EncodedEntry {
  const { kind, ...body } = entry
  const plain: Record<string, unknown> = { ...body }
  if (kind === 'session.created') {
    plain['tenant'] = tenantText(entry.tenant)
    plain['creation'] = { ...entry.creation, workspace: workspaceText(entry.creation.workspace) }
  }
  if (kind === 'call.bound')
    plain['kind'] =
      'registration' in entry
        ? entry.registration.kind === 'tool-intent'
          ? 'tool'
          : entry.registration.binding.producer.kind
        : entry.binding.producer.kind
  if (kind === 'session.workspace-changed') plain['workspace'] = workspaceText(entry.workspace)
  return { kind, schema: SESSION_INTERPRETER, payload: toJsonValue(plain), origin }
}

function workspaceText(workspace: WorkspaceId | null): string | null {
  if (workspace === null) return null
  const encoded = workspaceCodec.encode(workspace)
  if (!encoded.ok)
    throw new TypeError('the workspace of the creation was not minted by legal-identity')
  return encoded.value
}

/**
 * The creation of a decoded payload with its workspace text parsed back, or the diagnostic of why
 * it is malformed. The `workspaceAttachment` key must be present (null or an object), so a row of
 * revision 1, which has no such key, is refused instead of read in the new shape.
 */
function decodeCreation(
  creation: unknown,
): Readonly<{ ok: SessionCreation }> | Readonly<{ malformed: string }> {
  if (typeof creation !== 'object' || creation === null || Array.isArray(creation))
    return { malformed: 'session.created: the creation is not an object' }
  const fields = creation as Record<string, unknown>
  const attachment = fields['workspaceAttachment']
  if (attachment === undefined || typeof attachment !== 'object' || Array.isArray(attachment))
    return { malformed: 'session.created: the workspace attachment is missing or not an object' }
  const text = fields['workspace']
  if (text === null) return { ok: creation as SessionCreation }
  const parsed = typeof text === 'string' ? workspaceCodec.parse(text) : undefined
  if (parsed === undefined || !parsed.ok)
    return { malformed: 'session.created: the workspace text does not parse' }
  return { ok: { ...(creation as SessionCreation), workspace: parsed.value } }
}

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok)
    throw new TypeError('the tenant of the creation was not minted by legal-identity')
  return encoded.value
}

export type DecodedEntry =
  | Readonly<{ ok: SessionEntry }>
  | Readonly<{ unknown: string }>
  | Readonly<{ malformed: string }>

const KNOWN_KINDS: ReadonlySet<string> = new Set<SessionEntryKind>([
  'session.created',
  'session.initialization-item',
  'session.adoption',
  'message.user',
  'message.assistant',
  'message.tool',
  'message.tool_internal',
  'message.system_reminder',
  'message.compaction',
  'intake.routed',
  'intake.handed-over',
  'run.started',
  'run.attempt-started',
  'run.attempt-released',
  'run.terminal',
  'session.tool-resident-admitted',
  'session.mode-changed',
  'session.model-selected',
  'session.declaration-adopted',
  'session.context-registration-changed',
  'session.recovery-input-adopted',
  'session.workspace-changed',
  'session.relation',
  'session.resident',
  'session.idle-evidence',
  'session.frozen',
  'intake.released',
  'hitl.decision',
  'run.attempt-exited',
  'run.batch-taken',
  'call.bound',
  'call.execution-fact',
  'account.linked',
  'call.result-preserved',
  'call.result-processed',
  'extension.passage',
  'control.requested',
  'control.progress',
  'session.archived',
  'session.unarchived',
  'history.annotated',
])

/**
 * The decoded entry of one log row. A kind this interpreter does not know is `unknown`, so the
 * reducer quarantines instead of skipping (SL12). A payload that is not an object, or a creation
 * whose tenant or workspace text does not parse or that lacks its workspace attachment, is
 * `malformed`.
 */
export function decodeEntry(entry: Pick<HistoryEntry, 'kind' | 'payload'>): DecodedEntry {
  if (!KNOWN_KINDS.has(entry.kind)) return { unknown: entry.kind }
  if (entry.payload.kind !== 'object')
    return { malformed: `${entry.kind}: the payload is not an object` }
  const payload = fromJsonValue(entry.payload) as Record<string, unknown>
  if (entry.kind === 'session.created') {
    const text = payload['tenant']
    const parsed = typeof text === 'string' ? tenantCodec.parse(text) : undefined
    if (parsed === undefined || !parsed.ok)
      return { malformed: 'session.created: the tenant text does not parse' }
    const creation = decodeCreation(payload['creation'])
    if ('malformed' in creation) return creation
    return {
      ok: {
        ...payload,
        kind: entry.kind,
        tenant: parsed.value,
        creation: creation.ok,
      } as unknown as SessionEntry,
    }
  }
  if (entry.kind === 'session.workspace-changed' && payload['workspace'] !== null) {
    const text = payload['workspace']
    const parsed = typeof text === 'string' ? workspaceCodec.parse(text) : undefined
    if (parsed === undefined || !parsed.ok) return { malformed: 'workspace text does not parse' }
    payload['workspace'] = parsed.value
  }
  return { ok: { ...payload, kind: entry.kind } as unknown as SessionEntry }
}
