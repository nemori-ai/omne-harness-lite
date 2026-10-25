// The one encoding of commands into log entries and back (SPEC「领域服务与归约」: "命令到条目的编码只
// 此一份"). The `kind` short names follow the event catalog (docs/object-model/session-log-events.md);
// the SE numbers are navigation only. `decide` encodes with `encodeEntry`; `reduce` decodes with
// `decodeEntry`. A payload is plain JSON: the tenant travels as its legal-identity text, and
// every other value as it is.
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
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
  InputBatch,
  Participation,
  RecoveryTask,
  RunTerminal,
  SessionCreation,
} from './values.ts'
import type { EntryClass, HistoryEntry } from './faces.ts'
import type { EncodedEntry } from './judgments.ts'

/** The interpreter of this member: the adoption that every snapshot and entry schema names. */
export const SESSION_INTERPRETER: Adoption = Object.freeze({
  owner: '@omne-harness/session-contract',
  name: 'session-log',
  revision: '1',
  digest: 'sha256:session-log-1',
})

/** The initialization item of one required identity (SE01 → `tasks.initialization`). */
export type InitializationItem = Omit<
  Extract<RecoveryTask, { kind: 'initialization' }>,
  'kind' | 'originalOperation' | 'state' | 'diagnostic'
>

/** The decoded entries that `reduce` interprets, one per `kind` the first path writes. */
export type SessionEntry =
  | Readonly<{
      kind: 'session.created'
      tenant: TenantId
      session: SessionId
      operation: SessionOperationId
      creation: SessionCreation
      items: readonly InitializationItem[]
    }>
  | Readonly<{ kind: 'session.initialization-item'; result: InitializationResult }>
  | Readonly<{ kind: 'session.adoption'; adopted: Adoption }>
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
      kind: 'run.batch-taken'
      run: RunId
      execution: string
      sequence: string | null
      source: DurableEvidence
      batch: InputBatch
    }>
  | Readonly<{
      kind: 'run.terminal'
      terminal: RunTerminal
      sequence: string | null
      cause: DurableEvidence | null
      disposition: DurableEvidence | null
      bounded: BoundedClose | null
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

/** The entry envelope of one decoded entry: the catalog kind, this member's schema, the origin. */
export function encodeEntry(entry: SessionEntry, origin: HistoryEntry['origin']): EncodedEntry {
  const { kind, ...body } = entry
  const plain: Record<string, unknown> = { ...body }
  if (kind === 'session.created') plain['tenant'] = tenantText(entry.tenant)
  return { kind, schema: SESSION_INTERPRETER, payload: toJsonValue(plain), origin }
}

function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant of the creation was not minted by legal-identity')
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
  'run.batch-taken',
  'run.terminal',
])

/**
 * The decoded entry of one log row. A kind this interpreter does not know is `unknown`, so the
 * reducer quarantines instead of skipping (SL12). A payload that is not an object, or a creation
 * whose tenant text does not parse, is `malformed`.
 */
export function decodeEntry(entry: Pick<HistoryEntry, 'kind' | 'payload'>): DecodedEntry {
  if (!KNOWN_KINDS.has(entry.kind)) return { unknown: entry.kind }
  if (entry.payload.kind !== 'object') return { malformed: `${entry.kind}: the payload is not an object` }
  const payload = fromJsonValue(entry.payload) as Record<string, unknown>
  if (entry.kind === 'session.created') {
    const text = payload['tenant']
    const parsed = typeof text === 'string' ? tenantCodec.parse(text) : undefined
    if (parsed === undefined || !parsed.ok)
      return { malformed: 'session.created: the tenant text does not parse' }
    return { ok: { ...payload, kind: entry.kind, tenant: parsed.value } as unknown as SessionEntry }
  }
  return { ok: { ...payload, kind: entry.kind } as unknown as SessionEntry }
}
