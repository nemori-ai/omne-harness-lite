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
  TodoItemId,
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
import type { SessionEntriesChannel } from './interpretation-values.ts'

/**
 * The interpreter of this member: the adoption that every snapshot and entry schema names.
 * Revision 3 records verified initial adoption and the bound initialization plan. Revision 4 keeps
 * that content and stores each repeated value once (SPEC「条目的存储形式」).
 */
export const SESSION_INTERPRETER: Adoption = Object.freeze({
  owner: '@omne-harness/session-contract',
  name: 'session-log',
  revision: '4',
  digest: SESSION_RELEASE_DIGEST,
})

/** The initialization item of one required identity (SE01 → `tasks.initialization`). */
export type InitializationItem = Omit<
  Extract<RecoveryTask, { kind: 'initialization' }>,
  'kind' | 'originalOperation' | 'state' | 'diagnostic'
>

export type SessionEntry =
  | Readonly<{
      kind: 'session.permission-assigned'
      declaration: Extract<DeclarationChange, { kind: 'permission-assignment' }>
      previousRevision: string
      revision: string
      authority: DurableEvidence
    }>
  | Readonly<{ kind: 'session.todo-added'; item: TodoItemId; text: string }>
  | Readonly<{ kind: 'session.todo-completed' | 'session.todo-removed'; item: TodoItemId }>
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
  /** The progress row of one entries interpretation commit (docs/same-log-pure.md「entries 通道的解释提交」). */
  | Readonly<{
      kind: 'entries.interpreted'
      run: RunId
      execution: string
      channel: SessionEntriesChannel
      after: string
      through: string
      boundary: Readonly<{ revision: string; executionEvidence: DurableEvidence; count: string }>
      interpreted: readonly Readonly<{ ordinal: string; key: string }>[]
    }>

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

/**
 * What the stored form of revision 4 names instead of repeating (SPEC「条目的存储形式」). Both
 * targets are earlier or same-batch entries of the same session, which the log only appends.
 */
export type EntryReferences = Readonly<{
  /** The verified initial adoption of the SE01 of this session (the snapshot keeps it). */
  created?: InitialAdoption | null
  /** The residents that the SE36 entries of the batch admitted: the holders of each first shape. */
  residents?: readonly ResidentTool[]
}>

/** A `fact.source` that equals the origin source of its entry. */
const FROM_ORIGIN = '=origin.source'
/** An initial SE08 adoption that equals the SE01 initial adoption without its candidate. */
const FROM_CREATED = '=session.created.initialAdoption'
/** An SE01 `input` that equals the create command which the same SE01 records. */
const FROM_COMMAND = '=session.created.command'
/** An SE01 resident shape: SE36 of the same batch holds it; capability, version and admitted match. */
const FROM_RESIDENT = '=session.tool-resident-admitted'

const FACT_KINDS: ReadonlySet<string> = new Set([
  'call.execution-fact',
  'account.linked',
  'control.progress',
])
/** The kinds whose stored form may hold a marker. */
const REFERRING_KINDS: ReadonlySet<string> = new Set([
  ...FACT_KINDS,
  'session.created',
  'session.adoption',
])

/**
 * The entry envelope of one decoded entry: the catalog kind, this member's schema, the origin. The
 * payload is the stored form: a value that the origin, the SE01 of the session or an SE36 of the
 * batch already holds is named by a marker. `references.created` lets an SE08 name the SE01.
 */
export function encodeEntry(
  entry: SessionEntry,
  origin: HistoryEntry['origin'],
  references: EntryReferences = {},
): EncodedEntry {
  const { kind, ...body } = entry
  const plain: Record<string, unknown> = { ...body }
  if (kind === 'session.created') {
    plain['tenant'] = tenantText(entry.tenant)
    plain['creation'] = { ...entry.creation, workspace: workspaceText(entry.creation.workspace) }
    plain['initialAdoption'] = {
      ...entry.initialAdoption,
      newResidents: entry.initialAdoption.newResidents.map(resident => ({
        ...resident,
        shape: FROM_RESIDENT,
      })),
    }
    if (sameTree(commandOf(plain), entry.input)) plain['input'] = FROM_COMMAND
  }
  if (kind === 'call.bound')
    plain['kind'] =
      'registration' in entry
        ? entry.registration.kind === 'tool-intent'
          ? 'tool'
          : entry.registration.binding.producer.kind
        : entry.binding.producer.kind
  if (kind === 'session.workspace-changed') plain['workspace'] = workspaceText(entry.workspace)
  if (
    kind === 'session.adoption' &&
    entry.initialization !== undefined &&
    references.created != null &&
    sameAdoption(entry.initialization.adoption, references.created)
  )
    plain['initialization'] = { ...entry.initialization, adoption: FROM_CREATED }
  if (FACT_KINDS.has(kind) && 'fact' in entry && entry.fact !== null && 'source' in entry.fact)
    if (sameEvidence(entry.fact.source, origin.source))
      plain['fact'] = { ...entry.fact, source: FROM_ORIGIN }
  return { kind, schema: SESSION_INTERPRETER, payload: toJsonValue(plain), origin }
}

/** The create command input that an SE01 records, from its stored fields (tenant text included). */
function commandOf(plain: Readonly<Record<string, unknown>>): JsonValue {
  return toJsonValue({
    tenant: plain['tenant'],
    session: plain['session'],
    operation: plain['operation'],
    creation: plain['creation'],
  })
}

/** Exact equality of two json-text trees: kinds, lexemes, keys and their order. */
function sameTree(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'null':
      return true
    case 'boolean':
    case 'string':
      return left.value === (right as typeof left).value
    case 'number':
      return left.lexeme === (right as typeof left).lexeme
    case 'array': {
      const items = (right as typeof left).items
      return (
        left.items.length === items.length &&
        left.items.every((item, index) => sameTree(item, items[index]!))
      )
    }
    case 'object': {
      const entries = (right as typeof left).entries
      return (
        left.entries.length === entries.length &&
        left.entries.every(
          (item, index) =>
            item.key === entries[index]!.key && sameTree(item.value, entries[index]!.value),
        )
      )
    }
  }
}

const sameKeys = (left: object, right: object): boolean => {
  const a = Object.keys(left)
  const b = Object.keys(right)
  return a.length === b.length && a.every((key, index) => key === b[index])
}

/** The four evidence texts and their key order are the same. */
function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  if (left === right) return true
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest &&
    sameKeys(left, right)
  )
}

/**
 * The adoption is the SE01 initial adoption without its candidate: the same members, in the same
 * order, each the same object. A copy with equal content is stored in full, never guessed equal.
 */
function sameAdoption(adoption: InitializationAdoption, created: InitialAdoption): boolean {
  const keys = Object.keys(adoption)
  const expected = Object.keys(created).filter(key => key !== 'candidate')
  return (
    keys.length === expected.length &&
    keys.every(
      (key, index) =>
        key === expected[index] &&
        (adoption as Record<string, unknown>)[key] === (created as Record<string, unknown>)[key],
    )
  )
}

/** The SE01 initial adoption without its candidate, in its member order. */
function withoutCandidate(created: InitialAdoption): InitializationAdoption {
  const { candidate: _candidate, ...adoption } = created
  return adoption
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
  'session.todo-added',
  'session.todo-completed',
  'session.todo-removed',
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
  'session.permission-assigned',
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
  'entries.interpreted',
])

/** The row of a decode: its kind and stored payload; the schema and origin when the caller has them. */
export type StoredEntry = Pick<HistoryEntry, 'kind' | 'payload'> &
  Partial<Pick<HistoryEntry, 'schema' | 'origin'>>

/**
 * The decoded entry of one log row. A kind this interpreter does not know is `unknown`, so the
 * reducer quarantines instead of skipping (SL12). A payload that is not an object, or a creation
 * whose tenant or workspace text does not parse or that lacks its workspace attachment, is
 * `malformed`. A row whose schema names another revision of this interpreter is `malformed`: its
 * bytes are not read in the revision 4 form. A marker whose target is absent or does not match is
 * `malformed` too; `references` gives the targets (`decodeEntries` gives them for a batch).
 */
export function decodeEntry(entry: StoredEntry, references: EntryReferences = {}): DecodedEntry {
  if (!KNOWN_KINDS.has(entry.kind)) return { unknown: entry.kind }
  const schema = entry.schema
  if (
    schema !== undefined &&
    schema.revision !== SESSION_INTERPRETER.revision &&
    schema.name === SESSION_INTERPRETER.name &&
    schema.owner === SESSION_INTERPRETER.owner
  )
    return {
      malformed: `${entry.kind}: stored by session-log revision ${schema.revision}; this interpreter reads only revision ${SESSION_INTERPRETER.revision}`,
    }
  if (entry.payload.kind !== 'object')
    return { malformed: `${entry.kind}: the payload is not an object` }
  const payload = fromJsonValue(entry.payload) as Record<string, unknown>
  if (REFERRING_KINDS.has(entry.kind)) {
    const resolved = resolveStored(entry.kind, payload, entry.origin, references)
    if (resolved !== null) return { malformed: resolved }
  }
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

/**
 * The decoded entries of one committed batch, in order. The SE36 entries of the batch are the
 * shape holders an SE01 names; an SE01 of the batch is the creation a later SE08 names, else
 * `created` (the initial adoption of the snapshot before the batch).
 */
export function decodeEntries(
  rows: readonly StoredEntry[],
  created: InitialAdoption | null,
): DecodedEntry[] {
  const out: (DecodedEntry | undefined)[] = rows.map(() => undefined)
  const residents: ResidentTool[] = []
  rows.forEach((row, index) => {
    if (row.kind !== 'session.tool-resident-admitted') return
    const decoded = decodeEntry(row)
    out[index] = decoded
    if ('ok' in decoded && decoded.ok.kind === 'session.tool-resident-admitted')
      residents.push(decoded.ok.resident)
  })
  let current = created
  return rows.map((row, index) => {
    const known = out[index]
    if (known !== undefined) return known
    const decoded = decodeEntry(row, { created: current, residents })
    if ('ok' in decoded && decoded.ok.kind === 'session.created')
      current = decoded.ok.initialAdoption
    return decoded
  })
}

/**
 * The history rows with every marker replaced by the value it names, so a reader sees the payload
 * that the full form holds. `created` is the initial adoption of the session (the snapshot keeps
 * it); only an SE01 or an initial SE08 needs it. Without it such a row answers `missing`, so a
 * caller reads the snapshot only for a page that holds one. A row that does not resolve answers
 * `malformed`.
 */
export function expandHistoryEntries(
  rows: readonly HistoryEntry[],
  created: InitialAdoption | null,
):
  | Readonly<{ ok: readonly HistoryEntry[] }>
  | Readonly<{ missing: 'created' }>
  | Readonly<{ malformed: string }> {
  let out: HistoryEntry[] | null = null
  for (const [index, row] of rows.entries()) {
    const needs = storedReferences(row)
    if (needs === 'none') continue
    if (needs === 'created' && created === null) return { missing: 'created' }
    const payload = fromJsonValue(row.payload) as Record<string, unknown>
    const resolved = resolveStored(row.kind, payload, row.origin, {
      created,
      residents: created?.newResidents ?? [],
    })
    if (resolved !== null) return { malformed: resolved }
    out ??= [...rows]
    out[index] = { ...row, payload: toJsonValue(payload) }
  }
  return { ok: out ?? rows }
}

/** Which targets a stored row names: none, only itself or its origin, or the SE01 of the session. */
function storedReferences(row: HistoryEntry): 'none' | 'origin' | 'created' {
  if (row.kind === 'session.created') {
    const residents = memberOf(memberOf(row.payload, 'initialAdoption'), 'newResidents')
    return residents?.kind === 'array' && residents.items.length > 0 ? 'created' : 'origin'
  }
  if (row.kind === 'session.adoption')
    return memberOf(memberOf(row.payload, 'initialization'), 'adoption')?.kind === 'string'
      ? 'created'
      : 'none'
  if (FACT_KINDS.has(row.kind))
    return memberOf(memberOf(row.payload, 'fact'), 'source')?.kind === 'string' ? 'origin' : 'none'
  return 'none'
}

function memberOf(tree: JsonValue | undefined, key: string): JsonValue | undefined {
  return tree?.kind === 'object' ? tree.entries.find(entry => entry.key === key)?.value : undefined
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Replaces each marker of the plain stored payload with the value it names, in place and in the
 * member order of the full form. Null when it resolves, else the diagnostic of the malformed row.
 */
function resolveStored(
  kind: string,
  payload: Record<string, unknown>,
  origin: HistoryEntry['origin'] | undefined,
  references: EntryReferences,
): string | null {
  if (kind === 'session.created') {
    if (payload['input'] === FROM_COMMAND) payload['input'] = commandOf(payload)
    else if (!isObject(payload['input']))
      return 'session.created: the input is not a json-text tree'
    const adoption = payload['initialAdoption']
    if (!isObject(adoption) || !Array.isArray(adoption['newResidents']))
      return 'session.created: the initial adoption has no resident list'
    const residents = references.residents ?? []
    const named: unknown[] = []
    for (const item of adoption['newResidents'] as unknown[]) {
      if (!isObject(item) || item['shape'] !== FROM_RESIDENT)
        return 'session.created: a new resident does not name its SE36 shape holder'
      const holder = residents.find(resident => resident.capability === item['capability'])
      if (
        holder === undefined ||
        holder.version !== item['version'] ||
        !isObject(item['admitted']) ||
        !sameEvidence(holder.admitted, item['admitted'] as DurableEvidence)
      )
        return `session.created: no SE36 of the batch admits ${String(item['capability'])} with the same version and asset digest`
      named.push({ ...item, shape: holder.shape })
    }
    payload['initialAdoption'] = { ...adoption, newResidents: named }
    return null
  }
  if (kind === 'session.adoption') {
    const initialization = payload['initialization']
    if (!isObject(initialization) || typeof initialization['adoption'] !== 'string') return null
    if (initialization['adoption'] !== FROM_CREATED)
      return 'session.adoption: the adoption marker is not known'
    if (references.created == null)
      return 'session.adoption: the adoption names the SE01 of the session, which is not read'
    payload['initialization'] = {
      ...initialization,
      adoption: withoutCandidate(references.created),
    }
    return null
  }
  if (FACT_KINDS.has(kind)) {
    const fact = payload['fact']
    if (!isObject(fact) || typeof fact['source'] !== 'string') return null
    if (fact['source'] !== FROM_ORIGIN) return `${kind}: the fact source marker is not known`
    if (origin === undefined) return `${kind}: the fact source names the origin, which is not read`
    payload['fact'] = { ...fact, source: origin.source }
  }
  return null
}
