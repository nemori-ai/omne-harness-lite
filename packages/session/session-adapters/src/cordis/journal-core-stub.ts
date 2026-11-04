// STUB (R2-D292 K-23): the durable form of the Journal core's own records while the core still keeps
// its state as `MemoryExecution` and does not produce fact batches itself. One publication appends,
// beside the facts of the fact family, one `core.*` fact per core record this write added or changed:
// a scalar of an execution, a member of its checkpoint, an element of one of its lists, an entry of
// one of its maps, or an entry of a root map. A fact holds the record with every content value
// (a message, a request, a content block) taken out into a content block of `sl_blob`; the record
// names the block by its digest. A publication therefore grows with what the step changed, never
// with the session, and the bytes of a content value are written once, as the block the fact family
// also refers to.
//
// The whole file is the K-23 bridge: when the core folds the fact family (JO-2b), the `core.*`
// facts, this codec and `restoreCore` go, and nothing else of the provider changes. Nothing here is
// a contract; no reader but the provider decodes these facts.
import { tenantCodec, workspaceCodec } from '@omne-harness/legal-identity'
import type { JsonValue } from '@omne-harness/sql-contract'
import { blobDigest } from '@omne-harness/session-storage-sql/participants'
import { canonical } from '../testing/canonical.ts'
import { emptyFinishing, type FinishingRecords } from '../testing/journal-finishing.ts'
import { emptyReceivingState } from '../testing/journal-receiving.ts'
import type { MemoryExecution, OperationRecord } from '../testing/journal.ts'
import type { CommonRoot } from '../testing/root.ts'

/** The execution text of the facts that record the root maps: no execution of the session. */
export const ROOT_EXECUTION = '*'

export const CORE_KINDS = [
  'core.scalar',
  'core.cursor',
  'core.item',
  'core.entry',
  'core.drop',
] as const
export type CoreKind = (typeof CORE_KINDS)[number]
const CORE: ReadonlySet<string> = new Set(CORE_KINDS)
export const isCoreKind = (kind: string): kind is CoreKind => CORE.has(kind)

/** One `core.*` fact as the publication writes it and the restore reads it. */
export type CoreFact =
  | Readonly<{ kind: 'core.scalar'; execution: string; name: string; value: JsonValue }>
  | Readonly<{
      kind: 'core.cursor'
      execution: string
      members: Readonly<Record<string, JsonValue>>
    }>
  | Readonly<{
      kind: 'core.item'
      execution: string
      list: string
      index: number
      value: JsonValue
    }>
  | Readonly<{
      kind: 'core.entry'
      execution: string
      map: string
      key: JsonValue
      value: JsonValue
    }>
  | Readonly<{ kind: 'core.drop'; execution: string; map: string; key: JsonValue }>

/** One content block a publication writes beside its facts. */
export type CoreBlob = Readonly<{ digest: string; media: string; payload: string }>

// ------------------------------------------------------------------------------------------
// The codec: maps, sets, minted identities and bigints have marked forms; content goes to blocks.

const MARKS = [
  '$map',
  '$set',
  '$tenant',
  '$workspace',
  '$bigint',
  '$undefined',
  '$number',
  '$blob',
] as const
const CONTENT_MEMBERS: ReadonlySet<string> = new Set(['role', 'messages', 'system'])
export const BLOB_MEDIA = 'application/json'

/**
 * The row digest of a block a fact refers to. The facts name a block by the hex digest of its
 * canonical text (`refOf`, `src/journal/facts.ts`); the `sl_blob` rows and the bridge's `$blob`
 * markers name it `sha256:<hex>` (session-storage-sql `blobDigest`). Same hash, two spellings; the
 * provider maps between them here and nowhere else.
 */
export const blobRowDigest = (ref: string): string =>
  ref.startsWith('sha256:') ? ref : `sha256:${ref}`

/** The digest a fact names for the block of row digest `row`: the inverse of `blobRowDigest`. */
export const factDigestOf = (row: string): string =>
  row.startsWith('sha256:') ? row.slice('sha256:'.length) : row

function isPlain(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

/** The blocks one encoding took out, by digest. */
export type BlobSink = Map<string, CoreBlob>

/** A reference to a block: the digest the block row has and the size of its payload. */
export const blobRef = (payload: string): Readonly<{ digest: string; size: number }> => ({
  digest: blobDigest(payload),
  size: Buffer.byteLength(payload, 'utf8'),
})

/** Takes `encoded` out into a block and answers the marker that names it. */
export function spill(encoded: JsonValue, blobs: BlobSink): JsonValue {
  const payload = canonical(encoded)
  const ref = blobRef(payload)
  if (!blobs.has(ref.digest))
    blobs.set(ref.digest, { digest: ref.digest, media: BLOB_MEDIA, payload })
  return { $blob: ref.digest, size: ref.size }
}

/** Whether a value is plain JSON: no map, set, minted identity, bigint or undefined in it. */
export function isPlainJson(value: unknown): boolean {
  if (value === null) return true
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true
    case 'number':
      return Number.isFinite(value)
    case 'object':
      break
    default:
      return false
  }
  if (Array.isArray(value)) return value.every(isPlainJson)
  if (!isPlain(value as object)) return false
  return Object.entries(value as object).every(
    ([key, member]) => !key.startsWith('$') && isPlainJson(member),
  )
}

/**
 * Takes a content value out into a block as its own canonical JSON (no mark), so the block is the
 * same bytes a history entry or a reader of the record would hold; a value that is not plain JSON
 * goes encoded.
 */
export function spillContent(value: unknown, blobs: BlobSink): JsonValue {
  return isPlainJson(value)
    ? spill(value as JsonValue, blobs)
    : spill(encodeCore(value, blobs), blobs)
}

/**
 * Encodes a core value as durable JSON. A plain object that carries a content member (`role`,
 * `messages`, `system`) is a content value: it goes whole into a block. The value under a `content`
 * member goes into a block too, and the member is kept as `$content`, so no fact body carries a
 * `content` member. `blobs` collects the blocks.
 */
export function encodeCore(value: unknown, blobs: BlobSink): JsonValue {
  if (value === null) return null
  if (value === undefined) return { $undefined: true }
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return Number.isFinite(value) ? value : { $number: String(value) }
    case 'bigint':
      return { $bigint: value.toString() }
    case 'object':
      break
    default:
      throw new TypeError(`a ${typeof value} is not durable Journal data`)
  }
  if (Array.isArray(value)) return value.map(item => encodeCore(item, blobs))
  if (value instanceof Map)
    return {
      $map: [...value].map(([key, item]) => [encodeCore(key, blobs), encodeCore(item, blobs)]),
    }
  if (value instanceof Set) return { $set: [...value].map(item => encodeCore(item, blobs)) }
  const named = (value as { name?: unknown }).name
  if (named === 'TenantId') {
    const text = tenantCodec.encode(value as never)
    if (text.ok) return { $tenant: text.value }
  }
  if (named === 'WorkspaceId') {
    const text = workspaceCodec.encode(value as never)
    if (text.ok) return { $workspace: text.value }
  }
  if (!isPlain(value)) throw new TypeError('a class instance is not durable Journal data')
  const keys = Object.keys(value)
  if (keys.some(key => CONTENT_MEMBERS.has(key))) {
    for (const key of keys)
      if (key.startsWith('$')) throw new TypeError(`the member name ${key} is reserved`)
    return spillContent(value, blobs)
  }
  const out: Record<string, JsonValue> = {}
  for (const [key, member] of Object.entries(value)) {
    if (key.startsWith('$')) throw new TypeError(`the member name ${key} is reserved`)
    if (key === 'content') out['$content'] = spillContent(member, blobs)
    else out[key] = encodeCore(member, blobs)
  }
  return out
}

/** Whether an encoded value is the marker of a block. */
export function isMarker(value: JsonValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    markOf(value as Readonly<Record<string, JsonValue>>) === '$blob'
  )
}

/** The digests the payload of a block names in turn: a block may hold the marker of another. */
export function blobsNamedIn(payload: string): Set<string> {
  try {
    return blobsNamed(JSON.parse(payload) as JsonValue)
  } catch {
    return new Set()
  }
}

function markOf(value: Readonly<Record<string, JsonValue>>): (typeof MARKS)[number] | null {
  const keys = Object.keys(value)
  const key = keys[0] as (typeof MARKS)[number]
  if (keys.length === 1 && MARKS.includes(key)) return key
  if (keys.length === 2 && keys.includes('$blob') && keys.includes('size')) return '$blob'
  return null
}

/** The digests of the blocks an encoded value names, to fetch before it decodes. */
export function blobsNamed(value: JsonValue, into: Set<string> = new Set()): Set<string> {
  if (value === null || typeof value !== 'object') return into
  if (Array.isArray(value)) {
    for (const item of value) blobsNamed(item as JsonValue, into)
    return into
  }
  const record = value as Readonly<Record<string, JsonValue>>
  if (markOf(record) === '$blob') into.add(String(record['$blob']))
  else for (const member of Object.values(record)) blobsNamed(member, into)
  return into
}

/** Decodes an encoded value; `blob` gives the payload of a block by digest, or throws. */
export function decodeCore(value: JsonValue, blob: (digest: string) => string): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(item => decodeCore(item as JsonValue, blob))
  const record = value as Readonly<Record<string, JsonValue>>
  switch (markOf(record)) {
    case '$map':
      return new Map(
        (record['$map'] as readonly (readonly JsonValue[])[]).map(([key, item]) => [
          decodeCore(key ?? null, blob),
          decodeCore(item ?? null, blob),
        ]),
      )
    case '$set':
      return new Set((record['$set'] as readonly JsonValue[]).map(item => decodeCore(item, blob)))
    case '$tenant': {
      const parsed = tenantCodec.parse(String(record['$tenant']))
      if (!parsed.ok) throw new TypeError('the tenant text does not parse')
      return parsed.value
    }
    case '$workspace': {
      const parsed = workspaceCodec.parse(String(record['$workspace']))
      if (!parsed.ok) throw new TypeError('the workspace text does not parse')
      return parsed.value
    }
    case '$bigint':
      return BigInt(String(record['$bigint']))
    case '$undefined':
      return undefined
    case '$number':
      return Number(record['$number'])
    case '$blob':
      return decodeCore(JSON.parse(blob(String(record['$blob']))) as JsonValue, blob)
    case null: {
      const out: Record<string, unknown> = {}
      for (const [key, member] of Object.entries(record))
        out[key === '$content' ? 'content' : key] = decodeCore(member, blob)
      return out
    }
  }
}

// ------------------------------------------------------------------------------------------
// What of the core is durable, and how it is keyed.

const EXECUTION_SCALARS = [
  'id',
  'tenant',
  'revision',
  'state',
  'retainedFrom',
  'acknowledged',
  'acknowledgedAt',
  'admissionLedger',
  'serial',
] as const
const EXECUTION_LISTS = [
  'attachments',
  'inputs',
  'events',
  'controls',
  'results',
  'effects',
  'observations',
  'admissions',
  'entries',
  'handoffs',
] as const
const EXECUTION_MAPS = [
  'inputRevisions',
  'resultRevisions',
  'stageReceipts',
  'observed',
  'custodyAttempts',
] as const
const FINISHING_SCALARS = ['current', 'route', 'currentJudgment', 'obligations'] as const
const FINISHING_LISTS = [
  'candidates',
  'routes',
  'supersessions',
  'migrations',
  'judgments',
  'cardReconciliations',
  'legacyReturns',
  'toolAssociations',
] as const
const FINISHING_MAPS = ['issued', 'effectOperations'] as const
const ROOT_MAPS = [
  'operations',
  'authorities',
  'eventReceipts',
  'pendingEvents',
  'callOrigins',
  'human',
  'indexedEvents',
] as const
const ROOT_LISTS = ['jointFacts'] as const
/** `executionTargets` is a projection of `targets`; it is rebuilt, never written. */
const RECEIVING_MAPS = [
  'materials',
  'deliveries',
  'aliases',
  'bindings',
  'consumerExecutions',
  'pendingBindings',
  'targets',
  'callTargets',
  'toolTargets',
] as const

const FINISHING = 'finishing.'
const RECEIVING = 'receiving.'

/** The records of the root that are durable: the executions, the root maps and the receiving maps. */
export type CoreRecords = Readonly<{
  executions: ReadonlyMap<string, MemoryExecution>
  agent: Readonly<{
    operations: ReadonlyMap<string, OperationRecord>
    jointFacts: CommonRoot['agent']['jointFacts']
    authorities: CommonRoot['agent']['authorities']
    eventReceipts: CommonRoot['agent']['eventReceipts']
    pendingEvents: CommonRoot['agent']['pendingEvents']
    callOrigins: CommonRoot['agent']['callOrigins']
    human: CommonRoot['agent']['human']
    indexedEvents: CommonRoot['agent']['indexedEvents']
  }>
  receiving: CommonRoot['receiving']
}>

/** The durable records of a root; a pending operation is a held write, not a record. */
export function coreRecordsOf(root: CommonRoot): CoreRecords {
  return {
    executions: root.agent.executions,
    agent: {
      operations: new Map(
        [...root.agent.operations].filter(([, record]) => record.kind !== 'pending'),
      ),
      jointFacts: root.agent.jointFacts,
      authorities: root.agent.authorities,
      eventReceipts: root.agent.eventReceipts,
      pendingEvents: root.agent.pendingEvents,
      callOrigins: root.agent.callOrigins,
      human: root.agent.human,
      indexedEvents: root.agent.indexedEvents,
    },
    receiving: root.receiving,
  }
}

export const emptyCoreRecords = (): CoreRecords => ({
  executions: new Map(),
  agent: {
    operations: new Map(),
    jointFacts: [],
    authorities: new Map(),
    eventReceipts: new Map(),
    pendingEvents: new Map(),
    callOrigins: new Map(),
    human: new Map(),
    indexedEvents: new Map(),
  },
  receiving: emptyReceivingState(),
})

const same = (left: unknown, right: unknown): boolean => canonical(left) === canonical(right)

type Diff = {
  facts: CoreFact[]
  blobs: BlobSink
}

/** A fact body above `limit` bytes has its value taken whole into a block. */
function bounded(fact: CoreFact, blobs: BlobSink, limit: number): CoreFact {
  if (Buffer.byteLength(JSON.stringify(fact), 'utf8') <= limit) return fact
  if (fact.kind === 'core.cursor')
    return { ...fact, members: { $spilled: spill(fact.members, blobs) } }
  if (fact.kind === 'core.drop') return fact
  return { ...fact, value: { $spilled: spill(fact.value, blobs) } }
}

function scalars<T extends object>(
  diff: Diff,
  execution: string,
  prefix: string,
  names: readonly (keyof T & string)[],
  before: T | undefined,
  after: T,
): void {
  for (const name of names)
    if (before === undefined || !same(before[name], after[name]))
      diff.facts.push({
        kind: 'core.scalar',
        execution,
        name: prefix + name,
        value: encodeCore(after[name], diff.blobs),
      })
}

function lists<T extends object>(
  diff: Diff,
  execution: string,
  prefix: string,
  names: readonly (keyof T & string)[],
  before: T | undefined,
  after: T,
): void {
  for (const name of names) {
    const was = (before?.[name] ?? []) as readonly unknown[]
    const now = after[name] as readonly unknown[]
    for (const [index, item] of now.entries())
      if (index >= was.length || was[index] !== item) {
        if (index < was.length && same(was[index], item)) continue
        diff.facts.push({
          kind: 'core.item',
          execution,
          list: prefix + name,
          index,
          value: encodeCore(item, diff.blobs),
        })
      }
  }
}

function maps<T extends object>(
  diff: Diff,
  execution: string,
  prefix: string,
  names: readonly (keyof T & string)[],
  before: T | undefined,
  after: T,
): void {
  for (const name of names) {
    const was = (before?.[name] ?? new Map()) as ReadonlyMap<unknown, unknown>
    const now = after[name] as ReadonlyMap<unknown, unknown>
    for (const [key, item] of now) {
      const known = was.get(key)
      if (known === item || (known !== undefined && same(known, item))) continue
      diff.facts.push({
        kind: 'core.entry',
        execution,
        map: prefix + name,
        key: encodeCore(key, diff.blobs),
        value: encodeCore(item, diff.blobs),
      })
    }
    for (const key of was.keys())
      if (!now.has(key))
        diff.facts.push({
          kind: 'core.drop',
          execution,
          map: prefix + name,
          key: encodeCore(key, diff.blobs),
        })
  }
}

/**
 * The `core.*` facts of one write: what `after` holds that `before` did not, record by record, with
 * the content blocks they name. A record is compared by identity first (the core replaces what it
 * changes) and by canonical text second, so an unchanged record that was copied is not written.
 */
export function coreFacts(
  before: CoreRecords,
  after: CoreRecords,
  limit: number,
): Readonly<{ facts: readonly CoreFact[]; blobs: readonly CoreBlob[] }> {
  const diff: Diff = { facts: [], blobs: new Map() }
  for (const [key, execution] of after.executions) {
    const prior = before.executions.get(key)
    if (prior === execution) continue
    const id = execution.id
    scalars(diff, id, '', EXECUTION_SCALARS, prior, execution)
    const members: Record<string, JsonValue> = {}
    for (const [name, value] of Object.entries(execution.checkpoint))
      if (prior === undefined || !same((prior.checkpoint as Record<string, unknown>)[name], value))
        members[name] = encodeCore(value, diff.blobs)
    if (prior !== undefined)
      for (const name of Object.keys(prior.checkpoint))
        if (!(name in execution.checkpoint)) members[name] = { $undefined: true }
    if (Object.keys(members).length > 0)
      diff.facts.push({ kind: 'core.cursor', execution: id, members })
    lists(diff, id, '', EXECUTION_LISTS, prior, execution)
    maps(diff, id, '', EXECUTION_MAPS, prior, execution)
    scalars(diff, id, FINISHING, FINISHING_SCALARS, prior?.finishing, execution.finishing)
    lists(diff, id, FINISHING, FINISHING_LISTS, prior?.finishing, execution.finishing)
    maps(diff, id, FINISHING, FINISHING_MAPS, prior?.finishing, execution.finishing)
  }
  maps(diff, ROOT_EXECUTION, '', ROOT_MAPS, before.agent, after.agent)
  lists(diff, ROOT_EXECUTION, '', ROOT_LISTS, before.agent, after.agent)
  maps(diff, ROOT_EXECUTION, RECEIVING, RECEIVING_MAPS, before.receiving, after.receiving)
  return {
    facts: diff.facts.map(fact => bounded(fact, diff.blobs, limit)),
    blobs: [...diff.blobs.values()],
  }
}

// ------------------------------------------------------------------------------------------
// The restore: the facts in publication order fold back into the records.

/**
 * One update of the checkpoint the fold keeps, in the order the facts made them: a member by name,
 * or a set of members spilled whole into a block (`$spilled`, a reference). The order is kept
 * because a spilled set cannot be merged with the members before it until its block is read: the
 * restore applies the updates in order, so a member set after a spill overrides the spill, and a
 * member set before it is overridden by the spill.
 */
export type CursorUpdate = readonly [name: string, value: JsonValue]

/** The encoded records of a session as the facts left them, before the blocks are resolved. */
export type CoreFold = {
  executions: Map<
    string,
    {
      scalars: Map<string, JsonValue>
      cursor: CursorUpdate[]
      lists: Map<string, JsonValue[]>
      maps: Map<string, Map<string, [JsonValue, JsonValue]>>
    }
  >
  root: { lists: Map<string, JsonValue[]>; maps: Map<string, Map<string, [JsonValue, JsonValue]>> }
}

export const emptyCoreFold = (): CoreFold => ({
  executions: new Map(),
  root: { lists: new Map(), maps: new Map() },
})

function executionFold(fold: CoreFold, execution: string) {
  let found = fold.executions.get(execution)
  if (found === undefined) {
    found = { scalars: new Map(), cursor: [], lists: new Map(), maps: new Map() }
    fold.executions.set(execution, found)
  }
  return found
}

const spilled = (value: JsonValue): JsonValue | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && '$spilled' in value
    ? (value as Record<string, JsonValue>)['$spilled']!
    : null

/** Applies one `core.*` fact to the fold; the blocks are resolved later, together. */
export function foldCore(fold: CoreFold, fact: CoreFact): void {
  const execution = fact.execution === ROOT_EXECUTION ? null : executionFold(fold, fact.execution)
  const target = execution ?? fold.root
  switch (fact.kind) {
    case 'core.scalar':
      execution?.scalars.set(fact.name, fact.value)
      break
    case 'core.cursor': {
      if (execution === null) break
      const whole = spilled(fact.members)
      if (whole !== null) {
        execution.cursor.push(['$spilled', whole])
        break
      }
      // A member set by name replaces its earlier setting by name; a spilled set before it stays,
      // in its place, so the restore applies the newer member after it.
      for (const [name, value] of Object.entries(fact.members)) {
        execution.cursor = execution.cursor.filter(([at]) => at !== name)
        execution.cursor.push([name, value])
      }
      break
    }
    case 'core.item': {
      let list = target.lists.get(fact.list)
      if (list === undefined) {
        list = []
        target.lists.set(fact.list, list)
      }
      list[fact.index] = fact.value
      break
    }
    case 'core.entry': {
      let map = target.maps.get(fact.map)
      if (map === undefined) {
        map = new Map()
        target.maps.set(fact.map, map)
      }
      map.set(canonical(fact.key), [fact.key, fact.value])
      break
    }
    case 'core.drop':
      target.maps.get(fact.map)?.delete(canonical(fact.key))
      break
  }
}

/** Every block digest the fold names: what must be fetched before `restoreCore`. */
export function coreBlobsNamed(fold: CoreFold): Set<string> {
  const digests = new Set<string>()
  const scan = (value: JsonValue) => blobsNamed(value, digests)
  const scanMaps = (maps: Map<string, Map<string, [JsonValue, JsonValue]>>) => {
    for (const map of maps.values())
      for (const [key, value] of map.values()) {
        scan(key)
        scan(value)
      }
  }
  const scanLists = (lists: Map<string, JsonValue[]>) => {
    for (const list of lists.values()) for (const item of list) scan(item ?? null)
  }
  for (const execution of fold.executions.values()) {
    for (const value of execution.scalars.values()) scan(value)
    for (const [, value] of execution.cursor) scan(value)
    scanLists(execution.lists)
    scanMaps(execution.maps)
  }
  scanLists(fold.root.lists)
  scanMaps(fold.root.maps)
  return digests
}

type Decode = (value: JsonValue) => unknown

function unspill(value: JsonValue, decode: Decode): unknown {
  const whole = spilled(value)
  return whole === null ? decode(value) : decode(whole)
}

function listOf(lists: Map<string, JsonValue[]>, name: string, decode: Decode): unknown[] {
  const list = lists.get(name) ?? []
  const out: unknown[] = []
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]
    if (item === undefined) throw new TypeError(`the list ${name} has no element ${String(index)}`)
    out.push(unspill(item, decode))
  }
  return out
}

function mapOf(
  maps: Map<string, Map<string, [JsonValue, JsonValue]>>,
  name: string,
  decode: Decode,
): Map<unknown, unknown> {
  const out = new Map<unknown, unknown>()
  for (const [key, value] of maps.get(name)?.values() ?? [])
    out.set(decode(key), unspill(value, decode))
  return out
}

function executionOf(
  found: NonNullable<ReturnType<CoreFold['executions']['get']>>,
  decode: Decode,
): MemoryExecution {
  const scalar = (name: string): unknown => {
    const value = found.scalars.get(name)
    if (value === undefined) throw new TypeError(`the execution has no ${name}`)
    return unspill(value, decode)
  }
  const checkpoint: Record<string, unknown> = {}
  const put = (name: string, decoded: unknown) => {
    if (decoded === undefined) delete checkpoint[name]
    else checkpoint[name] = decoded
  }
  for (const [name, value] of found.cursor) {
    if (name === '$spilled') {
      const members = decode(value) as Record<string, unknown>
      for (const [member, decoded] of Object.entries(members)) put(member, decoded)
    } else put(name, decode(value))
  }
  const finishing: FinishingRecords = emptyFinishing()
  for (const name of FINISHING_SCALARS)
    (finishing as Record<string, unknown>)[name] = found.scalars.has(FINISHING + name)
      ? scalar(FINISHING + name)
      : null
  for (const name of FINISHING_LISTS)
    (finishing as Record<string, unknown>)[name] = listOf(found.lists, FINISHING + name, decode)
  for (const name of FINISHING_MAPS)
    (finishing as Record<string, unknown>)[name] = mapOf(found.maps, FINISHING + name, decode)
  const execution: Record<string, unknown> = { checkpoint, finishing }
  for (const name of EXECUTION_SCALARS) execution[name] = scalar(name)
  for (const name of EXECUTION_LISTS) execution[name] = listOf(found.lists, name, decode)
  for (const name of EXECUTION_MAPS) execution[name] = mapOf(found.maps, name, decode)
  return execution as unknown as MemoryExecution
}

/**
 * The records the fold holds, decoded with the blocks `blob` gives. `executionTargets` is rebuilt
 * from `callTargets` in their order. The executions map is keyed as the core keys it.
 */
export function restoreCore(
  fold: CoreFold,
  blob: (digest: string) => string,
  executionKey: (execution: MemoryExecution) => string,
): CoreRecords {
  const decode: Decode = value => decodeCore(value, blob)
  const executions = new Map<string, MemoryExecution>()
  for (const found of fold.executions.values()) {
    const execution = executionOf(found, decode)
    executions.set(executionKey(execution), execution)
  }
  const agent = emptyCoreRecords().agent as {
    -readonly [K in keyof CoreRecords['agent']]: CoreRecords['agent'][K]
  }
  for (const name of ROOT_MAPS)
    (agent as Record<string, unknown>)[name] = mapOf(fold.root.maps, name, decode)
  for (const name of ROOT_LISTS)
    (agent as Record<string, unknown>)[name] = listOf(fold.root.lists, name, decode)
  const receiving = emptyReceivingState()
  for (const name of RECEIVING_MAPS)
    (receiving as unknown as Record<string, unknown>)[name] = mapOf(
      fold.root.maps,
      RECEIVING + name,
      decode,
    )
  for (const target of receiving.callTargets.values()) {
    const at = canonical([tenantTextOf(executions, target.execution), target.execution])
    receiving.executionTargets.set(at, [...(receiving.executionTargets.get(at) ?? []), target])
  }
  return { executions, agent, receiving }
}

function tenantTextOf(executions: ReadonlyMap<string, MemoryExecution>, id: string): string {
  for (const execution of executions.values())
    if (execution.id === id) {
      const text = tenantCodec.encode(execution.tenant)
      return text.ok ? text.value : ''
    }
  return ''
}
