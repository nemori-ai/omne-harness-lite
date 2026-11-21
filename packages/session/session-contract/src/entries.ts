import type { JsonValue } from '@omne-harness/json-text'
import { canonicalText } from './operations.ts'
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
  RunEnd,
  RunTerminal,
  SessionCreation,
  ResidentAdoption,
  ResidentTool,
  DeclarationChange,
  SessionTree,
  AutoArchivePolicy,
  IdleObservation,
  ControlProgress,
  ContextScopeBinding,
  CallBinding,
  ProducedResult,
  ProducerRef,
  InputBatch,
  Waiting,
  ExecutionRef,
  BackgroundDisposition,
} from './values.ts'
import type { EntryClass, HistoryEntry } from './faces.ts'
import type { AdmittedSource } from './input-sources.ts'
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
import { member } from './payload-members.ts'
import type { SessionCallRegistration, SessionCallWait } from './call-values.ts'
import type { SessionEntriesChannel } from './interpretation-values.ts'
import type { BackgroundCallLabel, BackgroundCallSource } from './background-calls.ts'
import type { AuthorizationExpression } from './authorizations.ts'

export const SESSION_INTERPRETER: Adoption = Object.freeze({
  owner: '@omne-harness/session-contract',
  name: 'session-log',
  revision: '5',
  digest: SESSION_RELEASE_DIGEST,
})

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
  | Readonly<{
      kind: 'session.authorization-expressed'
      expression: AuthorizationExpression
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
      /** Present on a child only: what the parent stood at when the child was created. */
      tree?: SessionTree
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
      /** The message of an input, placed in the model view when a step takes the input. */
      kind: 'message.delivered'
      input: InputId
      message: Message
      source: DurableEvidence
      admission: DurableEvidence
      consumption: null
      participation: Participation
    }>
  | Readonly<{
      kind: 'intake.routed'
      input: InputId
      destination: 'current-run' | 'next-run'
      run: RunId | null
      origin: DurableEvidence
      /** The values this admission fixed; every later judgment reads them, never the declaration. */
      source: AdmittedSource
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
      end: RunEnd | null
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
  | Readonly<{ kind: 'session.resident'; resident: boolean }>
  | Readonly<{ kind: 'session.child-recorded'; child: SessionId; basis: DurableEvidence }>
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
  | Readonly<{
      kind: 'call.backgrounded'
      consumption: ConsumptionId
      producer: ProducerRef
      ordinal: number
      label: BackgroundCallLabel
      source: BackgroundCallSource
    }>
  | Readonly<{
      kind: 'call.background-settled'
      consumption: ConsumptionId
      result: string
      disposition: BackgroundDisposition
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
  | Readonly<{
      kind: 'entries.interpreted'
      run: RunId
      execution: string
      channel: SessionEntriesChannel
      after: string
      through: string
      position: string
      boundary: Readonly<{ revision: string; executionEvidence: DurableEvidence; count: string }>
      interpreted: readonly Readonly<{ ordinal: string; key: string }>[]
    }>

export type SessionEntryKind = SessionEntry['kind']

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

export type EntryReferences = Readonly<{
  created?: InitialAdoption | null
  residents?: readonly ResidentTool[]
}>

const FROM_ORIGIN = '=origin.source'
const FROM_CREATED = '=session.created.initialAdoption'
const FROM_COMMAND = '=session.created.command'
const FROM_RESIDENT = '=session.tool-resident-admitted'

const FACT_KINDS: ReadonlySet<string> = new Set([
  'call.execution-fact',
  'account.linked',
  'control.progress',
])
const REFERRING_KINDS: ReadonlySet<string> = new Set([
  ...FACT_KINDS,
  'session.created',
  'session.adoption',
])

export function encodeEntry(
  entry: SessionEntry,
  origin: HistoryEntry['origin'],
  references: EntryReferences = {},
): EncodedEntry {
  const { kind, ...body } = entry
  const plain: Record<string, unknown> = { ...body }
  if (kind === 'message.compaction') plain['message'] = JSON.parse(canonicalText(entry.message))
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

function commandOf(plain: Readonly<Record<string, unknown>>): JsonValue {
  return toJsonValue({
    tenant: plain['tenant'],
    session: plain['session'],
    operation: plain['operation'],
    creation: plain['creation'],
  })
}

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
  'message.delivered',
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
  'session.authorization-expressed',
  'session.context-registration-changed',
  'session.recovery-input-adopted',
  'session.workspace-changed',
  'session.resident',
  'session.child-recorded',
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
  'call.backgrounded',
  'call.background-settled',
  'extension.passage',
  'control.requested',
  'control.progress',
  'session.archived',
  'session.unarchived',
  'history.annotated',
  'entries.interpreted',
])

export type StoredEntry = Pick<HistoryEntry, 'kind' | 'payload'> &
  Partial<Pick<HistoryEntry, 'schema' | 'origin'>>

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

function storedReferences(row: HistoryEntry): 'none' | 'origin' | 'created' {
  if (row.kind === 'session.created') {
    const residents = member(member(row.payload, 'initialAdoption'), 'newResidents')
    return residents?.kind === 'array' && residents.items.length > 0 ? 'created' : 'origin'
  }
  if (row.kind === 'session.adoption')
    return member(member(row.payload, 'initialization'), 'adoption')?.kind === 'string'
      ? 'created'
      : 'none'
  if (FACT_KINDS.has(row.kind))
    return member(member(row.payload, 'fact'), 'source')?.kind === 'string' ? 'origin' : 'none'
  return 'none'
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

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
