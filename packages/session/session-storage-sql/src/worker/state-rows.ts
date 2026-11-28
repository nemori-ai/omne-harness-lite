// Equal head text must mean equal chunk rows: a write of chunk rows outside this module must write a new head.
import type {
  CompactionCommitState,
  RunExecution,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import type { JsonValue } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue, sha256 } from '../codec.ts'
import { packText } from '@omne-harness/sql-contract/worker'
import { big, oneRow, packed, rowsOf, text, type Executor } from './support.ts'

export const CHUNK_BYTES = 16 * 1024
export const MAX_STATE_CHUNKS = 100_000
const SMALL_CHUNKS = 16
const STEP = 1024
const TOKEN = '$items'
export const MEMBER_BYTES = 1024
const MEMBER_ROW = '$row'

type Chunk = Readonly<{ seq: number; count: number; length: number }>
type PathLayout = readonly Chunk[]

export type StateLayout = Readonly<{
  head: string
  token: string
  paths: ReadonlyMap<string, PathLayout>
  members: ReadonlyMap<string, string>
  bytes: number
}>

export type StoredState = Readonly<{ snapshot: WorkSnapshot; layout: StateLayout }>

const layouts = new WeakMap<object, StateLayout>()

export function storedOf(snapshot: WorkSnapshot): StoredState | null {
  const layout = layouts.get(snapshot)
  return layout === undefined ? null : { snapshot, layout }
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const member of Object.values(value)) deepFreeze(member)
  return Object.freeze(value)
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  (value as { name?: unknown }).name !== 'TenantId' &&
  (value as { name?: unknown }).name !== 'WorkspaceId'

// The compaction commit reads and writes these members from the head alone, so their arrays stay in it.
const WHOLE_MEMBERS: ReadonlySet<string> = new Set(['run'])

function collectionPaths(snapshot: WorkSnapshot | null): string[] {
  if (snapshot === null) return []
  const paths: string[] = []
  for (const [member, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) paths.push(member)
    else if (isPlainObject(value) && !WHOLE_MEMBERS.has(member))
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

function headOf(snapshot: WorkSnapshot): Record<string, unknown> {
  const head: Record<string, unknown> = {}
  for (const [member, value] of Object.entries(snapshot)) {
    if (Array.isArray(value)) head[member] = []
    else if (isPlainObject(value) && !WHOLE_MEMBERS.has(member)) {
      const copy: Record<string, unknown> = {}
      for (const [inner, nested] of Object.entries(value))
        copy[inner] = Array.isArray(nested) ? [] : nested
      head[member] = copy
    } else head[member] = value
  }
  return head
}

const itemText = (item: unknown): string => JSON.stringify(encodeValue(item))

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
  return JSON.parse(packed(row['value'])) as JsonValue
}

export type CompactionStoredState = Readonly<{
  head: string
  state: CompactionCommitState
  execution: Readonly<{ seq: bigint; values: readonly RunExecution[] }> | null
}>

export function readCompactionState(
  port: Executor,
  tenant: string,
  session: string,
  tail: bigint,
): CompactionStoredState | 'behind' {
  const row = oneRow(
    port,
    'SELECT snapshot, covered FROM sl_state WHERE tenant = ? AND session = ? LIMIT 1',
    [tenant, session],
  )
  if (row === undefined || row['snapshot'] === null || big(row['covered']) !== tail) return 'behind'
  const head = text(row['snapshot'])
  const fields = [
    'tenant',
    'session',
    'lifecycle',
    'run',
    'revision',
    'source',
    'interpreter',
  ] as const
  const values: Record<string, JsonValue> = {}
  for (const name of fields) {
    const value = readMember(port, tenant, session, head, name)
    if (value === undefined) throw new Error(`missing compaction state member ${name}`)
    values[name] = value
  }
  const state = decodeValue(values) as CompactionCommitState
  if (state.run.kind !== 'active') return { head, state, execution: null }
  const last = oneRow(
    port,
    'SELECT seq, value FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? ORDER BY seq DESC LIMIT 1',
    [tenant, session, 'executions'],
  )
  if (last === undefined) throw new Error('the active Run has no execution state')
  const executions = decodeValue(
    JSON.parse(packed(last['value'])) as JsonValue,
  ) as readonly RunExecution[]
  if (!Array.isArray(executions) || executions.length === 0)
    throw new Error('the last execution state chunk is empty')
  return { head, state, execution: { seq: big(last['seq']), values: executions } }
}

export function writeCompactionState(
  port: Executor,
  key: Readonly<{ tenant: string; session: string; covered: bigint }>,
  previous: CompactionStoredState,
  next: Readonly<{ state: CompactionCommitState; execution: RunExecution }>,
): void {
  const { tenant, session, covered } = key
  if (previous.execution === null) throw new Error('compaction has no current execution')
  const head = JSON.parse(previous.head) as Record<string, JsonValue>
  const changed: unknown[] = []
  for (const name of ['run', 'revision', 'source'] as const) {
    const value = encodeValue(next.state[name])
    const wasRow = (head[name] as Record<string, JsonValue> | null)?.[MEMBER_ROW] === true
    const textValue = JSON.stringify(value)
    const isRow = typeof value === 'object' && value !== null && textValue.length > MEMBER_BYTES
    if (wasRow && !isRow)
      port.execute(
        'DELETE FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? AND seq = 0',
        [tenant, session, `=${name}`],
      )
    if (isRow)
      port.execute(
        'INSERT OR REPLACE INTO sl_state_item (tenant, session, path, seq, value) VALUES (?, ?, ?, 0, ?)',
        [tenant, session, `=${name}`, packText(textValue)],
      )
    head[name] = isRow ? { [MEMBER_ROW]: true } : value
    changed.push([name, value])
  }
  const executions = [...previous.execution.values.slice(0, -1), next.execution]
  const parts = pack(textsOf(executions), 0, executions.length)
  port.execute(
    'DELETE FROM sl_state_item WHERE tenant = ? AND session = ? AND path = ? AND seq = ?',
    [tenant, session, 'executions', previous.execution.seq],
  )
  for (const [index, part] of parts.entries())
    port.execute(
      'INSERT INTO sl_state_item (tenant, session, path, seq, value) VALUES (?, ?, ?, ?, ?)',
      [
        tenant,
        session,
        'executions',
        previous.execution.seq + BigInt(index * STEP),
        packText(part.text),
      ],
    )
  head[TOKEN] = sha256(
    JSON.stringify([head[TOKEN], changed, previous.execution.seq.toString(), parts]),
  )
  port.execute('UPDATE sl_state SET snapshot = ?, covered = ? WHERE tenant = ? AND session = ?', [
    JSON.stringify(head),
    covered,
    tenant,
    session,
  ])
}

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
      const value = packed(row['value'])
      snapshot[member] = decodeValue(JSON.parse(value) as JsonValue)
      members.set(member, value)
      bytes += value.length
      continue
    }
    const target = arrayAt(snapshot, path) as unknown[] | undefined
    if (target === undefined) throw new Error(`a snapshot chunk of ${path} without its collection`)
    const value = packed(row['value'])
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

type Segment =
  | Readonly<{ kind: 'kept'; chunk: Chunk; at: number }>
  | { kind: 'run'; from: number; to: number }

function segmentsOf(
  chunks: PathLayout,
  matched: readonly (number | null)[],
  textOf: (index: number) => string,
): Segment[] {
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

function rewritePath(path: string, chunks: PathLayout, after: readonly unknown[]) {
  const changes: Change[] = chunks.map(chunk => [path, chunk.seq, null] as const)
  const written: Chunk[] = []
  pack(textsOf(after), 0, after.length).forEach((part, index) => {
    changes.push([path, index * STEP, part.text])
    written.push({ seq: index * STEP, count: part.count, length: part.text.length })
  })
  return { changes, chunks: written }
}

function diffPath(
  path: string,
  previous: readonly unknown[] | undefined,
  chunks: PathLayout,
  next: readonly unknown[] | undefined,
): Readonly<{ changes: Change[]; chunks: Chunk[] }> {
  const before = previous ?? []
  const after = next ?? []
  const stored = chunks.reduce((sum, chunk) => sum + chunk.count, 0)
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
  const total = written.reduce((sum, chunk) => sum + chunk.length, 0)
  if (written.length > 2 * Math.ceil(total / CHUNK_BYTES) + SMALL_CHUNKS)
    return rewritePath(path, chunks, after)
  return { changes, chunks: written }
}

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
        [tenant, session, path, BigInt(seq), packText(value)],
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
