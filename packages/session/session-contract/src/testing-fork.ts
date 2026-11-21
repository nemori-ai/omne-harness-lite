import {
  forkPointAfterRows,
  ownPositionAfter,
  type ForkFacts,
  type ForkPoint,
  type SessionFork,
} from './fork.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ForkPointRead, HistoryEntry, ModelViewRow, SessionFailure } from './faces.ts'
import type { EntryId, SessionId, SessionRevision } from './identity.ts'
import type { EncodedEntry } from './judgments.ts'
import { compactionReads, type MaterializedModelView } from './model-view.ts'
import type { SessionCommand } from './ports.ts'
import type { WorkSnapshot } from './values.ts'

// The fork of the memory transaction double: a forked store holds the rows of its prefix as its
// first epoch and the entries of the source chain behind them, which no reduction ever reads.

export type MemoryFork = Readonly<{ fork: SessionFork; inherited: readonly HistoryEntry[] }>

type Held = Readonly<{
  snapshot: WorkSnapshot
  modelView: MaterializedModelView
  entries: readonly HistoryEntry[]
  fork?: MemoryFork
}>

/** The entries a reference of the session may name: those behind its prefix, then its own. */
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
  return {
    facts: memoryForkFacts(source, key.ok, fork.point),
    modelView: { epoch: 'epoch:0', rows },
    fork: { fork, inherited },
  }
}

export const reads = (start: ForkStart | undefined): Readonly<{ fork?: ForkFacts }> =>
  start === undefined ? {} : { fork: start.facts }

/** The fork a store keeps: the one it has, or the one its create starts it from. */
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
