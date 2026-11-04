// The stored form of a Session snapshot (SPEC W1, 快照的存储形态, R2-D292): one head row in
// `sl_state` and the items of its collections in chunk rows of `sl_state_item`. A commit writes the
// head row and only the chunks whose items it added, changed or removed, so the bytes one commit
// writes do not grow with the number of items a session holds.
//
// - A collection is an array member of the snapshot, or an array member of an object member of the
//   snapshot (`workEntryIndex.calls`). The head keeps an empty array in its place, so the head still
//   tells a present collection from an absent one, and the member order of the head stays.
// - A chunk row holds a run of consecutive items of one collection as a JSON array, at most
//   `CHUNK_BYTES` of text unless one item is larger. It is keyed by the collection path and a
//   sequence number; the chunks of one path in sequence order are the array in its order. A chunk
//   whose items all stay, in order and side by side, is not written again. A new chunk takes a
//   number between its kept neighbours; when there is no room, or the path has too many small
//   chunks, the whole path is written again. An append writes the new item and, like the carry of
//   a binary counter, now and then the small chunks before it.
// - An object member whose text (collections left out) is over `MEMBER_BYTES` is a member row of
//   its own (path `=member`), written only when its text changes; the head keeps `{"$row":true}`
//   in its place. So the head row stays small (`initialization` alone is several KB).
// - The head carries a token of the stored content in its member `$items`: the digest of the
//   previous token, the head and the chunk changes of the write. So equal head text gives an equal
//   snapshot, whatever the path that led to it. A write of chunk rows outside this module must
//   write a new head.
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, sha256 } from '../codec.ts'
import { big, oneRow, rowsOf, text, type Executor } from './support.ts'

/** The text one chunk row holds before the next item starts a new chunk. */
export const CHUNK_BYTES = 16 * 1024
/** The most chunk rows one snapshot may have; more is a failure of the read, never a shorter read. */
export const MAX_STATE_CHUNKS = 100_000
/** The small chunks a path may keep beyond twice its full ones before it is written again. */
const SMALL_CHUNKS = 16
/** The gap a fresh sequence number leaves, so that later chunks in the middle find room. */
const STEP = 1024
/** The member of the head text that holds the token of the stored content. */
const TOKEN = '$items'
/** The text of an object member over which the member is a row of its own. */
export const MEMBER_BYTES = 1024
/** The place of a member row in the head. */
const MEMBER_ROW = '$row'

/** One chunk row of a path: its sequence number, item count and text length. */
type Chunk = Readonly<{ seq: number; count: number; length: number }>
/** The chunks of one collection path, in array order. */
type PathLayout = readonly Chunk[]

/** How a snapshot is stored: its head text and token, and the chunks of each collection path. */
export type StateLayout = Readonly<{
  head: string
  token: string
  paths: ReadonlyMap<string, PathLayout>
  /** The members stored as rows of their own, with their row text. */
  members: ReadonlyMap<string, string>
  /** The head text length plus the text lengths of all chunks: the stored size of the snapshot. */
  bytes: number
}>

/** A snapshot with the layout it is stored in. */
export type StoredState = Readonly<{ snapshot: WorkSnapshot; layout: StateLayout }>

/**
 * The layout of each snapshot object that this module read or wrote, so that a commit on it writes
 * only what changed. A snapshot without a layout (it did not come from these rows) is written whole.
 */
const layouts = new WeakMap<object, StateLayout>()

/** The stored state of a snapshot that this module read or wrote, or null. */
export function storedOf(snapshot: WorkSnapshot): StoredState | null {
  const layout = layouts.get(snapshot)
  return layout === undefined ? null : { snapshot, layout }
}

/** Freezes a value and every object and array in it; a value that is frozen already is skipped. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const member of Object.values(value)) deepFreeze(member)
  return Object.freeze(value)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  // A minted identity is a value, not a container of collections.
  (value as { name?: unknown }).name !== 'TenantId' &&
  (value as { name?: unknown }).name !== 'WorkspaceId'

/** The collection paths of a snapshot, as `member` or `member.inner`. */
function collectionPaths(snapshot: WorkSnapshot | null): string[] {
  if (snapshot === null) return []
  const paths: string[] = []
  for (const [member, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) paths.push(member)
    else if (isPlainObject(value))
      for (const [inner, nested] of Object.entries(value))
        if (Array.isArray(nested)) paths.push(`${member}.${inner}`)
  }
  return paths
}

function arrayAt(snapshot: object | null, path: string): readonly unknown[] | undefined {
  if (snapshot === null) return undefined
  const [member, inner] = path.split('.') as [string, string | undefined]
  const value = (snapshot as Record<string, unknown>)[member]
  if (inner === undefined) return Array.isArray(value) ? value : undefined
  if (!isPlainObject(value)) return undefined
  const nested = value[inner]
  return Array.isArray(nested) ? nested : undefined
}

/** The head of a snapshot: every collection replaced by an empty array. */
function headOf(snapshot: WorkSnapshot): Record<string, unknown> {
  const head: Record<string, unknown> = {}
  for (const [member, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) head[member] = []
    else if (isPlainObject(value)) {
      const copy: Record<string, unknown> = {}
      for (const [inner, nested] of Object.entries(value))
        copy[inner] = Array.isArray(nested) ? [] : nested
      head[member] = copy
    } else head[member] = value
  }
  return head
}

const itemText = (item: unknown): string => JSON.stringify(encodeValue(item))

/**
 * Reads the stored snapshot of a session when its head row covers `tail`, else `behind`. A chunk
 * of a collection the head does not have, or more chunks than the bound, throws.
 */
export function readState(
  port: Executor,
  tenant: string,
  session: string,
  tail: bigint,
): StoredState | 'behind' {
  const row = oneRow(
    port,
    'SELECT snapshot, covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (row === undefined || row['snapshot'] === null || big(row['covered']) !== tail) return 'behind'
  return assemble(port, tenant, session, text(row['snapshot']))
}

/**
 * One top-level member of a stored snapshot, in its stored JSON form, from the head text or, for a
 * member that is a row of its own, by one primary-key read of that row. Collections inside it are
 * empty: a reader that needs them reads the whole snapshot.
 */
export function readMember(
  port: Executor,
  tenant: string,
  session: string,
  head: string,
  member: string,
): JsonValue | undefined {
  const value = (JSON.parse(head) as Record<string, JsonValue>)[member]
  if ((value as Record<string, JsonValue> | null | undefined)?.[MEMBER_ROW] !== true) return value
  const row = oneRow(
    port,
    'SELECT value FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? AND seq = 0 LIMIT 1',
    [tenant, session, `=${member}`],
  )
  if (row === undefined) throw new Error(`the member ${member} without its row`)
  return JSON.parse(text(row['value'])) as JsonValue
}

/** The snapshot of a head text and the chunk rows of the session. */
export function assemble(
  port: Executor,
  tenant: string,
  session: string,
  head: string,
): StoredState {
  const parsed = JSON.parse(head) as Record<string, JsonValue>
  const token = typeof parsed[TOKEN] === 'string' ? parsed[TOKEN] : ''
  delete parsed[TOKEN]
  const snapshot = decodeValue(parsed) as Record<string, unknown>
  const rows = rowsOf(
    port,
    'SELECT path, seq, value FROM sl_state_item WHERE tenant = ? AND session = ? ORDER BY path, seq LIMIT ?',
    [tenant, session, BigInt(MAX_STATE_CHUNKS + 1)],
  )
  if (rows.length > MAX_STATE_CHUNKS) throw new Error('the snapshot chunks exceed the read bound')
  const paths = new Map<string, Chunk[]>()
  const members = new Map<string, string>()
  let bytes = head.length
  for (const row of rows) {
    const path = text(row['path'])
    if (path.startsWith('=')) {
      // Member rows sort before the chunk rows, so the collections inside a member find it.
      const member = path.slice(1)
      const held = snapshot[member] as Record<string, unknown> | undefined
      if (held?.[MEMBER_ROW] !== true)
        throw new Error(`a member row of ${member} without its place`)
      const value = text(row['value'])
      snapshot[member] = decodeValue(JSON.parse(value) as JsonValue)
      members.set(member, value)
      bytes += value.length
      continue
    }
    const target = arrayAt(snapshot, path) as unknown[] | undefined
    if (target === undefined) throw new Error(`a snapshot chunk of ${path} without its collection`)
    const value = text(row['value'])
    const items = JSON.parse(value) as JsonValue
    if (!Array.isArray(items) || items.length === 0)
      throw new Error(`a snapshot chunk of ${path} that is not a list of items`)
    for (const item of items) target.push(decodeValue(item))
    let chunks = paths.get(path)
    if (chunks === undefined) {
      chunks = []
      paths.set(path, chunks)
    }
    chunks.push({ seq: Number(big(row['seq'])), count: items.length, length: value.length })
    bytes += value.length
  }
  for (const [member, value] of Object.entries(snapshot))
    if ((value as Record<string, unknown> | null)?.[MEMBER_ROW] === true)
      throw new Error(`the member ${member} without its row`)
  const layout: StateLayout = { head, token, paths, members, bytes }
  layouts.set(snapshot, layout)
  return { snapshot: snapshot as WorkSnapshot, layout }
}

/**
 * For each item of `next`, the index of the same item of `previous`, taken in increasing order so
 * that the kept items keep their relative order. The same item is the same object or an equal
 * primitive; failing that, the next unmatched item of `previous` when its text is equal (a reduce
 * that copies an unchanged item). Only the items in a stored chunk (`stored`) can be kept.
 */
function matchItems(
  previous: readonly unknown[],
  stored: number,
  next: readonly unknown[],
  textOf: (index: number) => string,
): (number | null)[] {
  const positions = new Map<unknown, number[]>()
  for (let index = 0; index < stored; index += 1) {
    const item = previous[index]
    const list = positions.get(item)
    if (list === undefined) positions.set(item, [index])
    else list.push(index)
  }
  const matched: (number | null)[] = []
  let last = -1
  for (const [at, item] of next.entries()) {
    const list = positions.get(item)
    while (list !== undefined && list.length > 0 && (list[0] as number) <= last) list.shift()
    let index = list?.shift()
    if (
      index === undefined &&
      last + 1 < stored &&
      typeof item === 'object' &&
      item !== null &&
      itemText(previous[last + 1]) === textOf(at)
    )
      index = last + 1
    if (index === undefined) matched.push(null)
    else {
      matched.push(index)
      last = index
    }
  }
  return matched
}

type Change = readonly [path: string, seq: number, value: string | null]

/** A part of the new array: a stored chunk that stays, or a run of items to write. */
type Segment =
  | Readonly<{ kind: 'kept'; chunk: Chunk; at: number }>
  | { kind: 'run'; from: number; to: number }

/**
 * The segments of the new array: the chunks whose items all stay in place, and the runs between.
 * A run takes in the kept chunk before it while that chunk is at most twice the run and the two fit
 * in `CHUNK_BYTES`, like the carry of a binary counter: an append then writes the new item and now
 * and then a few small chunks before it, never a full chunk, and a path keeps few small chunks.
 */
function segmentsOf(
  chunks: PathLayout,
  matched: readonly (number | null)[],
  textOf: (index: number) => string,
): Segment[] {
  // The new index of each kept item of the previous array.
  const placed = new Map<number, number>()
  matched.forEach((index, at) => {
    if (index !== null) placed.set(index, at)
  })
  const kept = new Map<number, Chunk>()
  let start = 0
  for (const chunk of chunks) {
    const first = placed.get(start)
    let whole = first !== undefined
    for (let offset = 1; whole && offset < chunk.count; offset += 1)
      whole = placed.get(start + offset) === (first as number) + offset
    if (whole) kept.set(first as number, chunk)
    start += chunk.count
  }
  const segments: Segment[] = []
  let at = 0
  while (at < matched.length) {
    const chunk = kept.get(at)
    if (chunk !== undefined) {
      segments.push({ kind: 'kept', chunk, at })
      at += chunk.count
      continue
    }
    const last = segments[segments.length - 1]
    if (last?.kind === 'run') last.to = at + 1
    else segments.push({ kind: 'run', from: at, to: at + 1 })
    at += 1
  }
  for (let index = 0; index < segments.length; index += 1) {
    const run = segments[index] as Segment
    if (run.kind !== 'run') continue
    let length = 1
    for (let item = run.from; item < run.to; item += 1) length += textOf(item).length + 1
    for (;;) {
      const before = segments[index - 1]
      if (before?.kind === 'run') {
        // Two runs side by side (a chunk between them was taken in) become one run.
        run.from = before.from
        for (let item = before.from; item < before.to; item += 1) length += textOf(item).length + 1
        segments.splice(index - 1, 1)
        index -= 1
        continue
      }
      if (
        before?.kind !== 'kept' ||
        before.chunk.length > 2 * length ||
        before.chunk.length + length > CHUNK_BYTES
      )
        break
      run.from = before.at
      length += before.chunk.length
      segments.splice(index - 1, 1)
      index -= 1
    }
  }
  return segments
}

/** The chunk texts of a run of items: greedy, at most `CHUNK_BYTES` unless one item is larger. */
function pack(
  textOf: (index: number) => string,
  from: number,
  to: number,
): Readonly<{ text: string; count: number }>[] {
  const out: { text: string; count: number }[] = []
  let texts: string[] = []
  let length = 2
  for (let index = from; index < to; index += 1) {
    const item = textOf(index)
    if (texts.length > 0 && length + 1 + item.length > CHUNK_BYTES) {
      out.push({ text: `[${texts.join(',')}]`, count: texts.length })
      texts = []
      length = 2
    }
    length += (texts.length > 0 ? 1 : 0) + item.length
    texts.push(item)
  }
  if (texts.length > 0) out.push({ text: `[${texts.join(',')}]`, count: texts.length })
  return out
}

/** The item texts of an array, each encoded once. */
function textsOf(items: readonly unknown[]): (index: number) => string {
  const texts = new Map<number, string>()
  return index => {
    let text = texts.get(index)
    if (text === undefined) {
      text = itemText(items[index])
      texts.set(index, text)
    }
    return text
  }
}

/** The whole path in fresh chunks. */
function rewritePath(path: string, chunks: PathLayout, after: readonly unknown[]) {
  const changes: Change[] = chunks.map(chunk => [path, chunk.seq, null] as const)
  const written: Chunk[] = []
  pack(textsOf(after), 0, after.length).forEach((part, index) => {
    changes.push([path, index * STEP, part.text])
    written.push({ seq: index * STEP, count: part.count, length: part.text.length })
  })
  return { changes, chunks: written }
}

/** The chunk writes of one path, and its new chunks. */
function diffPath(
  path: string,
  previous: readonly unknown[] | undefined,
  chunks: PathLayout,
  next: readonly unknown[] | undefined,
): Readonly<{ changes: Change[]; chunks: Chunk[] }> {
  const before = previous ?? []
  const after = next ?? []
  const stored = chunks.reduce((sum, chunk) => sum + chunk.count, 0)
  // Items that are not all in chunks (a head that still holds them inline): the path is written whole.
  if (stored !== before.length) return rewritePath(path, chunks, after)
  const textOf = textsOf(after)
  const segments = segmentsOf(chunks, matchItems(before, stored, after, textOf), textOf)
  const kept = new Set(segments.flatMap(item => (item.kind === 'kept' ? [item.chunk.seq] : [])))
  const changes: Change[] = chunks
    .filter(chunk => !kept.has(chunk.seq))
    .map(chunk => [path, chunk.seq, null] as const)
  const written: Chunk[] = []
  for (const [index, segment] of segments.entries()) {
    if (segment.kind === 'kept') {
      written.push(segment.chunk)
      continue
    }
    const parts = pack(textOf, segment.from, segment.to)
    const low = written.length === 0 ? -STEP : (written[written.length - 1] as Chunk).seq
    const following = segments[index + 1]
    const high = following?.kind === 'kept' ? following.chunk.seq : Infinity
    if (high !== Infinity && high - low - 1 < parts.length) return rewritePath(path, chunks, after)
    parts.forEach((part, k) => {
      const seq =
        high === Infinity
          ? low + (k + 1) * STEP
          : low + Math.floor(((high - low) * (k + 1)) / (parts.length + 1))
      changes.push([path, seq, part.text])
      written.push({ seq, count: part.count, length: part.text.length })
    })
  }
  // Too many small chunks (changes in the middle leave them): the path is written again, packed.
  const total = written.reduce((sum, chunk) => sum + chunk.length, 0)
  if (written.length > 2 * Math.ceil(total / CHUNK_BYTES) + SMALL_CHUNKS)
    return rewritePath(path, chunks, after)
  return { changes, chunks: written }
}

/**
 * Writes the snapshot of a session: the chunk rows that differ from `before`, then the head row.
 * `before` is the snapshot the commit was judged on, or null for a new session. When this module
 * holds no layout of it, every chunk row of the session is written again. Returns the stored state.
 */
export function writeState(
  port: Executor,
  key: Readonly<{ tenant: string; session: string; covered: bigint }>,
  before: WorkSnapshot | null,
  snapshot: WorkSnapshot,
): StoredState {
  const { tenant, session, covered } = key
  const previous = before === null ? null : storedOf(before)
  if (before !== null && previous === null)
    port.execute('DELETE FROM sl_state_item WHERE tenant = ? AND session = ?', [tenant, session])
  const encoded = encodeValue(headOf(snapshot)) as Record<string, JsonValue>
  // The large object members: a row of their own, written when their text changes.
  const members = new Map<string, string>()
  const memberChanges: Change[] = []
  for (const [member, value] of Object.entries(encoded)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const was = previous?.layout.members.get(member)
    const same =
      was !== undefined &&
      (previous?.snapshot as Record<string, unknown> | undefined)?.[member] ===
        (snapshot as Record<string, unknown>)[member]
    const row = same ? was : JSON.stringify(value)
    if (row.length > MEMBER_BYTES) {
      members.set(member, row)
      encoded[member] = { [MEMBER_ROW]: true }
      if (row !== was) memberChanges.push([`=${member}`, 0, row])
    }
  }
  for (const member of previous?.layout.members.keys() ?? [])
    if (!members.has(member)) memberChanges.push([`=${member}`, 0, null])
  const paths = new Set([
    ...collectionPaths(previous?.snapshot ?? null),
    ...collectionPaths(snapshot),
  ])
  const changes: Change[] = memberChanges.filter(([, , value]) => value === null)
  for (const [path, , value] of memberChanges)
    if (value !== null && previous?.layout.members.has(path.slice(1)) === true)
      changes.push([path, 0, null])
  changes.push(...memberChanges.filter(([, , value]) => value !== null))
  const written = new Map<string, PathLayout>()
  let bytes = [...members.values()].reduce((sum, row) => sum + row.length, 0)
  for (const path of [...paths].sort()) {
    const was = arrayAt(previous?.snapshot ?? null, path)
    const now = arrayAt(snapshot, path)
    const held = previous?.layout.paths.get(path) ?? []
    const stored = held.reduce((sum, chunk) => sum + chunk.count, 0)
    const diff: Readonly<{ changes: readonly Change[]; chunks: PathLayout }> =
      was !== undefined && was === now && stored === was.length
        ? { changes: [], chunks: held }
        : diffPath(path, was, held, now)
    changes.push(...diff.changes)
    if (now !== undefined && diff.chunks.length > 0) {
      written.set(path, diff.chunks)
      bytes += diff.chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    }
  }
  // Removals first: a new chunk may take the number of a removed one.
  for (const [path, seq, value] of changes)
    if (value === null)
      port.execute(
        'DELETE FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? AND seq = ?',
        [tenant, session, path, BigInt(seq)],
      )
  for (const [path, seq, value] of changes)
    if (value !== null)
      port.execute(
        'INSERT INTO sl_state_item (tenant, session, path, seq, value) VALUES (?, ?, ?, ?, ?)',
        [tenant, session, path, BigInt(seq), value],
      )
  const token = sha256(JSON.stringify([previous?.layout.token ?? '', encoded, changes]))
  const head = JSON.stringify({ ...encoded, [TOKEN]: token })
  bytes += head.length
  port.execute(
    'INSERT OR REPLACE INTO sl_state (tenant, session, snapshot, covered) VALUES (?, ?, ?, ?)',
    [tenant, session, head, covered],
  )
  const layout: StateLayout = { head, token, paths: written, members, bytes }
  layouts.set(snapshot, layout)
  return { snapshot, layout }
}
