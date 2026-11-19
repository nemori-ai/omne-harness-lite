import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type {
  EntryId,
  HistoryEntry,
  SessionId,
  SessionRevision,
} from '@omne-harness/session-contract'
import { SEARCHABLE_KINDS, documentRow, documentsOf, isSearchableKind } from './extract.ts'
import { followSession } from './follow.ts'
import type {
  CandidateRequest,
  Candidates,
  Cover,
  CoverStamp,
  HistoryIndex,
  IndexFailure,
  IndexState,
} from './index-port.ts'
import type { HistoryLogReader, LogPage, LogRange, LoggedSession } from './log-port.ts'
import { planAdmits } from './plan.ts'
import { createJudge, matchEntry, type CompiledQuery, type SearchQuery } from './query.ts'
import { headsOf, sameStamp } from './search-memo.ts'
import { inWindow } from './search-run.ts'

// Testing only: doubles for the two ports of the history search, and the scan it is checked against.

export type TestBlock = Readonly<{ text: string; toModel?: boolean; kind?: string }>
export type TestMessage = Readonly<{ kind: string; blocks: readonly TestBlock[] }>

export function tree(plain: unknown): HistoryEntry['payload'] {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(tree) }
  const entries = Object.entries(plain as Record<string, unknown>)
  return { kind: 'object', entries: entries.map(([key, value]) => ({ key, value: tree(value) })) }
}

export function testEntry(message: TestMessage, id: string, revision: string): HistoryEntry {
  const body = {
    id: `msg_${id.padStart(22, '0')}`,
    role: message.kind.replace(/^message\./u, ''),
    blocks: message.blocks.map((block, at) => ({
      kind: block.kind ?? 'text',
      id: `b${String(at)}`,
      visibility: { toHuman: true, toModel: block.toModel ?? true },
      text: block.text,
    })),
  }
  return {
    id,
    revision,
    kind: message.kind,
    schema: { name: 'test', revision: '1' },
    payload: tree({ message: body }),
    origin: { owner: 'test', via: null, source: { owner: 'test', record: 'r', revision: '1' } },
  } as unknown as HistoryEntry
}

type Commit = Readonly<{ revision: bigint; at: number | null; entries: readonly HistoryEntry[] }>
type Logged = { commits: Commit[]; archived: boolean; entries: number }

export type MemoryLog = Readonly<{
  reader: HistoryLogReader
  commit(session: SessionId, messages: readonly TestMessage[], at: number | null): SessionRevision
  archive(session: SessionId, archived: boolean): void
  sessions(): readonly SessionId[]
  tail(session: SessionId): SessionRevision
  scan(query: CompiledQuery): readonly string[]
  faults: { sessions: boolean; entries: boolean; points: boolean; stamps: boolean }
  reads: { entries: number; points: number; sessions: number; stamps: number }
}>

const sizeOf = (entry: HistoryEntry): number => JSON.stringify(entry.payload).length
const revisionOf = (value: bigint): SessionRevision => String(value) as SessionRevision

export function createMemoryLog(): MemoryLog {
  const logs = new Map<SessionId, Logged>()
  const faults = { sessions: false, entries: false, points: false, stamps: false }
  const reads = { entries: 0, points: 0, sessions: 0, stamps: 0 }
  const listed = (): LoggedSession[] =>
    [...logs].map(([session, log]) => ({
      session,
      tail: revisionOf(BigInt(log.commits.length)),
      archived: log.archived,
    }))
  const unavailable = () => fail('unavailable' as const)

  type Read = Readonly<{ entry: HistoryEntry; at: number | null }>
  const pageOf = (input: LogRange): LogPage<Read> | null => {
    reads.entries += 1
    const log = logs.get(input.session)
    if (faults.entries || log === undefined) return null
    const tail = revisionOf(BigInt(log.commits.length))
    const entries: Read[] = []
    let bytes = 0
    let taken = 0
    for (const commit of log.commits) {
      if (commit.revision <= BigInt(input.after)) continue
      const searchable = commit.entries.filter(entry => isSearchableKind(entry.kind))
      const size = searchable.reduce((sum, entry) => sum + sizeOf(entry), 0)
      // Whole commits only; the first one is given however large it is.
      if (taken > 0 && bytes + size > input.maxBytes)
        return { entries, through: revisionOf(commit.revision - 1n), exhausted: false, bytes }
      for (const entry of searchable) entries.push({ entry, at: commit.at })
      bytes += size
      taken += 1
    }
    return { entries, through: tail, exhausted: true, bytes }
  }

  const reader: HistoryLogReader = {
    async stamp() {
      reads.stamps += 1
      return faults.stamps ? unavailable() : succeed(headsOf(listed()))
    },
    async sessions() {
      reads.sessions += 1
      return faults.sessions ? unavailable() : succeed(listed())
    },
    async judge(input) {
      const judge = createJudge(input.spec)
      if (judge === null) return unavailable()
      const page = pageOf(input)
      if (page === null) return unavailable()
      const entries = page.entries.map(({ entry, at }) => ({
        position: entry.id,
        revision: entry.revision,
        at,
        match: judge(entry),
      }))
      return succeed({ ...page, entries })
    },
    async extract(input) {
      const page = pageOf(input)
      if (page === null) return unavailable()
      const entries = page.entries.map(({ entry, at }) => ({
        position: entry.id,
        revision: entry.revision,
        at,
        documents: documentsOf(entry),
      }))
      return succeed({ ...page, entries })
    },
    async judgeAt(input) {
      reads.points += input.points.length
      const judge = createJudge(input.spec)
      if (faults.points || judge === null) return unavailable()
      return succeed(
        input.points.map(point => {
          for (const commit of logs.get(point.session)?.commits ?? []) {
            const entry = commit.entries.find(item => item.id === point.position)
            if (entry !== undefined)
              return {
                position: entry.id,
                revision: entry.revision,
                at: commit.at,
                match: judge(entry),
              }
          }
          return null
        }),
      )
    },
  }

  return {
    reader,
    faults,
    reads,
    commit(session, messages, at) {
      const log = logs.get(session) ?? { commits: [], archived: false, entries: 0 }
      logs.set(session, log)
      const revision = BigInt(log.commits.length + 1)
      const entries = messages.map(message => {
        log.entries += 1
        return testEntry(message, String(log.entries), String(revision))
      })
      log.commits.push({ revision, at, entries })
      return revisionOf(revision)
    },
    archive(session, archived) {
      const log = logs.get(session)
      if (log !== undefined) log.archived = archived
    },
    sessions: () => [...logs.keys()],
    tail: session => revisionOf(BigInt(logs.get(session)?.commits.length ?? 0)),
    scan(query) {
      const named = query.scope.kind === 'sessions' ? query.scope.sessions : null
      const keys: string[] = []
      for (const [session, log] of logs) {
        if (named !== null && !named.includes(session)) continue
        if (query.archived !== 'all' && log.archived !== (query.archived === 'archived')) continue
        let when = 0
        for (const commit of log.commits)
          for (const entry of commit.entries) {
            if (!isSearchableKind(entry.kind)) continue
            if (commit.at !== null) when = commit.at
            if (inWindow(query.window, when) && matchEntry(query, entry) !== null)
              keys.push(`${session}#${entry.id}`)
          }
      }
      return keys
    },
  }
}

type Row = Readonly<{ doc: bigint; session: SessionId; position: EntryId; text: string }>
type Generation = { covered: Map<SessionId, Cover>; rows: Row[]; serial: bigint }

export type MemoryIndex = HistoryIndex &
  Readonly<{
    faults: {
      /** Runs while a candidate read is under way, after its snapshot was taken. */
      duringCandidates: (() => Promise<void>) | null
      /** A broken index: it reads the rows first and the covers afterwards. */
      coverAfterRows: boolean
      failing: IndexFailure | null
      broken: boolean
    }
    reads: { candidates: number; covers: number; listed: number; asked: CandidateRequest[] }
    ready(): number
    coverOf(generation: number, session: SessionId): Cover
  }>

const SERIALS = 1n << 20n
const NO_COVER: Cover = { through: '0' as SessionRevision, at: 0 }

export function createMemoryIndex(): MemoryIndex {
  const generations = new Map<number, Generation>()
  let current: number | null = null
  let building: Readonly<{ generation: number; total: number }> | null = null
  let issued = 0
  const faults: MemoryIndex['faults'] = {
    duringCandidates: null,
    coverAfterRows: false,
    failing: null,
    broken: false,
  }
  const reads: MemoryIndex['reads'] = { candidates: 0, covers: 0, listed: 0, asked: [] }
  const stampOf = (covered: ReadonlyMap<SessionId, Cover>): CoverStamp => {
    let total = 0n
    for (const cover of covered.values()) total += BigInt(cover.through)
    return { sessions: covered.size, total: total.toString() }
  }
  const coversFor = (generation: Generation, input: CandidateRequest) => {
    const stamp = stampOf(generation.covered)
    if (input.known !== null && sameStamp(input.known, stamp)) return { stamp, covered: null }
    reads.covers += 1
    return { stamp, covered: new Map(generation.covered) }
  }
  const fresh = (): number => {
    issued += 1
    generations.set(issued, { covered: new Map(), rows: [], serial: 0n })
    return issued
  }
  const rowsOf = (generation: Generation, input: CandidateRequest): Row[] => {
    const { from, to } = input.window
    const before = input.before === null ? null : BigInt(input.before)
    return generation.rows
      .filter(row => {
        const at = Number(row.doc / SERIALS)
        if (before !== null && row.doc >= before) return false
        if ((from !== null && at < from) || (to !== null && at > to)) return false
        if (input.sessions !== null && !input.sessions.includes(row.session)) return false
        return planAdmits(input.plan, row.text)
      })
      .sort((left, right) => (left.doc < right.doc ? 1 : -1))
      .slice(0, input.limit)
  }

  return {
    faults,
    reads,
    ready() {
      current = fresh()
      return current
    },
    coverOf: (generation, session) => generations.get(generation)?.covered.get(session) ?? NO_COVER,
    async state(): Promise<IndexState> {
      if (faults.broken) return { kind: 'broken', diagnostic: 'testing' }
      if (building !== null) {
        const indexed = generations.get(building.generation)?.covered.size ?? 0
        const progress = { indexed, total: building.total }
        return { kind: 'rebuilding', generation: current, building: building.generation, progress }
      }
      return current === null ? { kind: 'absent' } : { kind: 'ready', generation: current }
    },
    async candidates(input) {
      reads.candidates += 1
      reads.asked.push(input)
      const generation = generations.get(input.generation)
      if (faults.failing !== null) return fail(faults.failing)
      if (generation === undefined) return fail('generation-gone')
      let found: Candidates
      if (faults.coverAfterRows) {
        const rows = rowsOf(generation, input)
        await faults.duringCandidates?.()
        found = { ...coversFor(generation, input), rows: rows.map(shown) }
      } else {
        found = { ...coversFor(generation, input), rows: rowsOf(generation, input).map(shown) }
        await faults.duringCandidates?.()
      }
      return succeed(found)
    },
    async covers(_tenant, number) {
      reads.listed += 1
      const generation = generations.get(number)
      if (faults.failing !== null) return fail(faults.failing)
      return generation === undefined
        ? fail('generation-gone')
        : succeed(new Map(generation.covered))
    },
    async append(input) {
      const generation = generations.get(input.generation)
      if (faults.failing !== null) return fail(faults.failing)
      if (generation === undefined) return fail('generation-gone')
      const cover = generation.covered.get(input.session) ?? NO_COVER
      for (const item of input.documents) {
        if (BigInt(item.revision) <= BigInt(cover.through)) continue
        generation.serial += 1n
        generation.rows.push({
          doc: BigInt(item.at) * SERIALS + generation.serial,
          session: input.session,
          position: item.position,
          text: documentRow(item.document),
        })
      }
      if (BigInt(input.through) > BigInt(cover.through))
        generation.covered.set(input.session, { through: input.through, at: input.at })
      return succeed(null)
    },
    async beginRebuild(_tenant, total) {
      if (faults.failing !== null) return fail('unavailable')
      building ??= { generation: fresh(), total }
      return succeed({ generation: building.generation })
    },
    async adopt(_tenant, generation) {
      if (building?.generation !== generation) return fail('generation-gone')
      if (current !== null) generations.delete(current)
      current = generation
      building = null
      faults.broken = false
      return succeed(null)
    },
    async compact() {},
  }
}

const shown = (row: Row) => ({ doc: String(row.doc), session: row.session, position: row.position })

export async function indexThrough(
  deps: Readonly<{ index: HistoryIndex; log: HistoryLogReader }>,
  at: Readonly<{ tenant: TenantId; generation: number; session: SessionId }>,
  upTo: SessionRevision | null = null,
): Promise<void> {
  for (;;) {
    const covers = await deps.index.covers(at.tenant, at.generation)
    if ('failure' in covers) throw new Error(covers.failure)
    const cover = covers.ok.get(at.session) ?? NO_COVER
    if (upTo !== null && BigInt(cover.through) >= BigInt(upTo)) return
    // One byte asks for one commit at a time, so the index can be left at any revision.
    const step = await followSession(deps, { ...at, cover, maxBytes: upTo === null ? 1 << 20 : 1 })
    if ('failure' in step) throw new Error(step.failure)
    if (step.ok.exhausted) return
  }
}

/** A small deterministic generator: a failure prints its seed and reruns the same. */
export function random(seed: number) {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const below = (n: number): number => Math.floor(next() * n)
  const pick = <T>(items: readonly T[]): T => items[below(items.length)]!
  return { next, below, pick }
}

export const ALPHABET = [
  ...'abAB',
  ...'sSſkKK',
  ...'受理预算中文',
  ...'σςΣ',
  ' ',
  '\n',
  '😀',
  '\u0001',
  '\u0002',
  '\u0003',
  'u',
  'm',
  '1',
] as const

export function randomText(rng: ReturnType<typeof random>, max: number): string {
  let text = ''
  for (let n = rng.below(max + 1); n > 0; n -= 1) text += rng.pick(ALPHABET)
  return text
}

export type Rng = ReturnType<typeof random>

const RANDOM_KINDS = [...SEARCHABLE_KINDS, 'message.delivered', 'run.started'] as const
const RANDOM_PATTERNS = ['a+b', '[ab]{2}', '受.', 'k|s', '\\s', '^a', 'B$', '(a|b)(A|B)', '.']

export function randomCommit(
  log: MemoryLog,
  rng: Rng,
  clock: { at: number },
  sessions: readonly SessionId[],
): void {
  const messages = Array.from({ length: 1 + rng.below(3) }, () => ({
    kind: rng.pick(RANDOM_KINDS),
    blocks: Array.from({ length: rng.below(4) }, () => ({
      text: randomText(rng, 12),
      toModel: rng.below(3) > 0,
    })),
  }))
  clock.at += rng.below(3) * 50
  log.commit(rng.pick(sessions), messages, rng.below(4) === 0 ? null : clock.at)
}

export function randomQuery(rng: Rng, top: number, sessions: readonly SessionId[]): SearchQuery {
  const word = () => {
    let text = ''
    for (let n = 1 + rng.below(4); n > 0; n -= 1) text += rng.pick(ALPHABET)
    return text
  }
  const caseSensitive = rng.below(2) === 0
  const content: SearchQuery['content'] =
    rng.below(3) === 0
      ? { kind: 'regex', pattern: rng.pick(RANDOM_PATTERNS), caseSensitive }
      : { kind: 'literals', all: rng.below(4) === 0 ? [word(), word()] : [word()], caseSensitive }
  const from = rng.below(4) === 0 ? rng.below(top + 1) : null
  return {
    content,
    kinds: SEARCHABLE_KINDS.filter(() => rng.below(3) === 0),
    from,
    to: rng.below(4) === 0 ? (from ?? 0) + rng.below(top + 1) : null,
    modelReadable: rng.below(3) === 0 ? 'only' : 'any',
    archived: rng.pick(['all', 'all', 'archived', 'unarchived'] as const),
    scope:
      rng.below(4) === 0
        ? { kind: 'sessions', sessions: sessions.filter(() => rng.below(2) === 0) }
        : { kind: 'tenant' },
  }
}
