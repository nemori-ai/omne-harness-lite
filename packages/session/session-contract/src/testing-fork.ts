import {
  forkPointAfterRows,
  ownPositionAfter,
  type ForkFacts,
  type ForkPoint,
  type SessionFork,
} from './fork.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ForkPointRead,
  HistoryEntry,
  HistoryPage,
  ModelViewRow,
  SessionFailure,
} from './faces.ts'
import type { EntryId, SessionId, SessionRevision } from './identity.ts'
import type { EncodedEntry } from './judgments.ts'
import { compactionReads, type MaterializedModelView } from './model-view.ts'
import type { SessionCommand } from './ports.ts'
import { encodeCursor, type Cursor } from './testing-history-cursor.ts'
import { TESTING_OWNER } from './testing-values.ts'
import { decodeEntry, SESSION_INTERPRETER } from './entries.ts'
import type { WorkSnapshot } from './values.ts'

// The fork of the memory transaction double: a forked store holds the rows of its prefix as its
// first epoch and the entries of the source chain behind them, which no reduction ever reads.

/** `prefix` names the entries of the rows it started from, in their order; `owners` the session of each. */
export type MemoryFork = Readonly<{
  fork: SessionFork
  inherited: readonly HistoryEntry[]
  prefix: readonly string[]
  owners: ReadonlyMap<string, SessionId>
}>

type Held = Readonly<{
  snapshot: WorkSnapshot
  modelView: MaterializedModelView
  entries: readonly HistoryEntry[]
  fork?: MemoryFork
}>

export function chainOf(store: Pick<Held, 'entries' | 'fork'>): readonly HistoryEntry[] {
  return store.fork === undefined ? store.entries : [...store.fork.inherited, ...store.entries]
}

function tailOf(store: Pick<Held, 'entries' | 'fork'>): bigint {
  return ownPositionAfter(store.entries.at(-1)?.id ?? null, store.fork?.fork.point ?? null) - 1n
}

export function entryIdAt(store: Pick<Held, 'entries' | 'fork'>, index: number): EntryId {
  return String(tailOf(store) + 1n + BigInt(index)) as EntryId
}

function rowsOfEpoch(source: Held, key: string, epoch: string): readonly ModelViewRow[] | null {
  if (!epoch.startsWith(`${key}/`)) return null
  const name = epoch.slice(key.length + 1)
  const view = source.modelView
  return name === view.epoch ? view.rows : (view.past?.get(name) ?? null)
}

const prefixOf = (source: Held, key: string, point: ForkPoint): readonly ModelViewRow[] =>
  rowsOfEpoch(source, key, point.epoch)?.slice(0, Number(point.upper) || 0) ?? []

function memoryForkFacts(source: Held, key: string, point: ForkPoint): ForkFacts {
  const rows = rowsOfEpoch(source, key, point.epoch)
  const prefix = prefixOf(source, key, point)
  const floor = prefix.reduce((most, row) => {
    const at = BigInt(row.entry)
    return at > most ? at : most
  }, 0n)
  return {
    rows: rows === null ? null : String(rows.length),
    next: rows?.[prefix.length]?.message.role ?? null,
    current: point.epoch === `${key}/${source.modelView.epoch}`,
    running: source.snapshot.run.kind === 'active',
    floor: String(floor),
    tail: String(tailOf(source)),
  }
}

export type ForkStart = Readonly<{
  facts: ForkFacts
  modelView: MaterializedModelView
  fork: MemoryFork
}>
type KeyOf = (tenant: TenantId, session: SessionId) => Outcome<string, SessionFailure>

/** What a create with a source starts its session from; nothing when there is no source to read. */
export function startOf(
  stores: ReadonlyMap<string, Held>,
  keyOf: KeyOf,
  command: SessionCommand,
  readable: boolean,
): ForkStart | undefined {
  const fork = command.kind === 'create' ? command.input.creation.fork : undefined
  if (fork === undefined || !readable) return undefined
  const key = keyOf(command.input.tenant, fork.source)
  const source = 'failure' in key ? undefined : stores.get(key.ok)
  if ('failure' in key || source === undefined) return undefined
  const rows = prefixOf(source, key.ok, fork.point)
  const named = new Set(rows.map(row => String(row.entry)))
  const inherited = chainOf(source).filter((entry, index) => index === 0 || named.has(entry.id))
  const owners = new Map(
    inherited.map(entry => [entry.id, source.fork?.owners.get(entry.id) ?? fork.source]),
  )
  return {
    facts: memoryForkFacts(source, key.ok, fork.point),
    modelView: { epoch: 'epoch:0', rows },
    fork: { fork, inherited, prefix: rows.map(row => String(row.entry)), owners },
  }
}

export const reads = (start: ForkStart | undefined): Readonly<{ fork?: ForkFacts }> =>
  start === undefined ? {} : { fork: start.facts }

export const kept = (
  store: Pick<Held, 'fork'> | undefined,
  start?: ForkStart,
): Readonly<{ fork?: MemoryFork }> => {
  const fork = store?.fork ?? start?.fork
  return fork === undefined ? {} : { fork }
}

export function numbered(
  store: Pick<Held, 'entries' | 'fork'> | undefined,
  start: ForkStart | undefined,
  revision: SessionRevision,
  entries: readonly EncodedEntry[],
): HistoryEntry[] {
  const held = store ?? { entries: [], ...kept(undefined, start) }
  return entries.map((entry, index) => ({ ...entry, id: entryIdAt(held, index), revision }))
}

export const compactionOf = (store: Held, through: string) =>
  compactionReads(chainOf(store), store.snapshot, through, store.fork?.inherited.length)

export const chained = <S extends Held>(store: S) => ({
  ...store,
  entries: chainOf(store),
  inherited: store.fork?.inherited.length ?? 0,
})

export function pointRead(
  store: Outcome<Held, SessionFailure>,
  key: Outcome<string, SessionFailure>,
): Outcome<ForkPointRead, SessionFailure> {
  if ('failure' in store) return fail(store.failure)
  if ('failure' in key) return fail(key.failure)
  const view = store.ok.modelView
  const from = BigInt(store.ok.fork?.fork.point.position ?? '0')
  const own = view.rows.filter(row => BigInt(row.entry) > from)
  const newest = own.map(row => ({ seq: row.seq, role: row.message.role }))
  const tail = String(tailOf(store.ok))
  const point = forkPointAfterRows(`${key.ok}/${view.epoch}`, newest, tail)
  return succeed(point === null ? { kind: 'none' } : { kind: 'point', point })
}

type HistoryAsk = Readonly<{ inherited?: true; from: unknown; direction: string }>

export function inheritedRefusal(input: HistoryAsk): SessionFailure | null {
  if (input.inherited !== true || (input.from === null && input.direction === 'forward'))
    return null
  return { kind: 'invalid', field: 'inherited', reason: 'only forward from the start' }
}

/** The next page of the prefix: the entries of one source session. Null: the read goes on in the own log. */
export function prefixPage(store: Held, cursor: Cursor, issued: Set<string>): HistoryPage | null {
  const { fork } = store
  if (fork === undefined) return null
  const kindOf = (entry: HistoryEntry): string => {
    const decoded = decodeEntry(entry)
    return 'ok' in decoded && 'message' in decoded.ok ? `message.${decoded.ok.message.role}` : ''
  }
  const wanted = fork.prefix
    .map(id => fork.inherited.find(entry => entry.id === id))
    .filter(entry => entry !== undefined)
    .filter(entry => cursor.kinds.length === 0 || cursor.kinds.includes(kindOf(entry)))
  const groups: { from: SessionId; entries: HistoryEntry[] }[] = []
  for (const entry of wanted) {
    const from = fork.owners.get(entry.id) ?? fork.fork.source
    const last = groups.at(-1)
    if (last?.from === from) last.entries.push(entry)
    else groups.push({ from, entries: [entry] })
  }
  const given = cursor.inherited ?? 0
  const group = groups[given]
  if (group === undefined) return null
  const token = encodeCursor({ ...cursor, inherited: given + 1 })
  issued.add(token)
  return {
    source: TESTING_OWNER,
    interpreter: SESSION_INTERPRETER,
    upper: store.snapshot.revision,
    entries: group.entries,
    from: group.from,
    scannedThrough: '0',
    next: token,
    exhausted: false,
    annotations: [],
  }
}
