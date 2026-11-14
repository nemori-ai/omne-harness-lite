import type { Outcome } from '@omne-harness/operation-result'
import type { HistoryPage, SessionHistory } from '@omne-harness/session-contract'
import type { ReadRequest, ReadResult, SqlStorage } from '@omne-harness/sql-contract'

export type RoundCount = Readonly<{
  round: number
  historyReadCalls: number
  historyRows: number
  ad04ReadCalls: number
  ad04ReadRows: number
  probeReadCalls: number
  probeReadRows: number
  projectedRows: number
  ad04ProjectedRows: number
  ad04StableRecompute: number
  stableRecompute: number
  storageCommits: Readonly<Record<string, number>>
  storageCommitTotal: number
  storageRollbacks: number
  maxCommandsPerCommit: number
  maxCommitBytes: number
  storageReads: Readonly<Record<string, number>>
  storageReadRows: Readonly<Record<string, number>>
  maxReadBytes: Readonly<Record<string, number>>
  storageCommitBytes: number
  ad02Commits: number | null
  ad02Refused: number
  modelReceives: number
  toolReceives: number
  modelRequests: number
  toolInvokes: number
}>

type Open = {
  round: number
  historyReadCalls: number
  historyRows: number
  ad04ReadCalls: number
  ad04ReadRows: number
  probeReadCalls: number
  probeReadRows: number
  storageCommits: Record<string, number>
  storageCommitTotal: number
  storageRollbacks: number
  maxCommandsPerCommit: number
  maxCommitBytes: number
  storageReads: Record<string, number>
  storageReadRows: Record<string, number>
  maxReadBytes: Record<string, number>
  storageCommitBytes: number
  ad02Commits: number | null
  ad02Refused: number
  modelReceives: number
  toolReceives: number
  modelRequests: number
  toolInvokes: number
}

function bump(table: Record<string, number>, key: string, by = 1): void {
  table[key] = (table[key] ?? 0) + by
}

function sizedHandler(handler: string): boolean {
  return handler === 'session.work' || handler.startsWith('execution-record.')
}

function rowsOf(result: ReadResult): number {
  if (result.kind !== 'read') return 0
  const { output } = result as { output: unknown }
  if (typeof output !== 'object' || output === null) return 0
  return Object.values(output).reduce<number>(
    (sum, member) => sum + (Array.isArray(member) ? member.length : 0),
    0,
  )
}

export type Ad04Read = Readonly<{ upper: bigint; rows: readonly bigint[] }>

export type Ad04RoundRows = Readonly<{
  round: number
  reads: readonly Ad04Read[]
  rereads: readonly bigint[]
}>

export type PartsRead = Readonly<{
  since: string | null
  after: string | null
  names: readonly string[] | null
  parts: readonly Readonly<{ part: string; text: number }>[]
  next: string | null
}>

export type PartsRoundReads = Readonly<{ round: number; reads: readonly PartsRead[] }>

export type RoundCounters = ReturnType<typeof createRoundCounters>

export function createRoundCounters() {
  const rounds: RoundCount[] = []
  const ad04Rows: Ad04RoundRows[] = []
  const partsRounds: PartsRoundReads[] = []
  const refusedReads: { handler: string; answer: unknown }[] = []
  let open: Open | null = null
  const seen = new Set<string>()
  const ad04Seen = new Set<string>()
  let projected = 0
  let rereads = 0
  let ad04Projected = 0
  let ad04Rereads = 0
  let ad04Reads: Ad04Read[] = []
  let ad04Again: bigint[] = []
  let partsReads: PartsRead[] = []

  const fresh = (round: number): Open => ({
    round,
    historyReadCalls: 0,
    historyRows: 0,
    ad04ReadCalls: 0,
    ad04ReadRows: 0,
    probeReadCalls: 0,
    probeReadRows: 0,
    storageCommits: {},
    storageCommitTotal: 0,
    storageRollbacks: 0,
    maxCommandsPerCommit: 0,
    maxCommitBytes: 0,
    storageReads: {},
    storageReadRows: {},
    maxReadBytes: {},
    storageCommitBytes: 0,
    ad02Commits: null,
    ad02Refused: 0,
    modelReceives: 0,
    toolReceives: 0,
    modelRequests: 0,
    toolInvokes: 0,
  })
  const inRound = (change: (current: Open) => void) => {
    if (open !== null) change(open)
  }

  const counters = {
    rounds,
    ad04Rows,
    partsRounds,
    refusedReads,
    begin(round: number): void {
      if (open !== null) throw new Error(`round ${open.round} is still open`)
      open = fresh(round)
      projected = 0
      rereads = 0
      ad04Projected = 0
      ad04Rereads = 0
      ad04Reads = []
      ad04Again = []
      partsReads = []
    },
    end(): RoundCount {
      if (open === null) throw new Error('no round is open')
      const current = open
      open = null
      const count: RoundCount = {
        ...current,
        projectedRows: projected,
        stableRecompute: rereads,
        ad04ProjectedRows: ad04Projected,
        ad04StableRecompute: ad04Rereads,
      }
      rounds.push(count)
      ad04Rows.push({ round: current.round, reads: ad04Reads, rereads: ad04Again })
      partsRounds.push({ round: current.round, reads: partsReads })
      return count
    },
    commit(
      participants: readonly string[],
      committed: boolean,
      commands = participants.length,
      bytes = 0,
    ): void {
      inRound(current => {
        current.maxCommandsPerCommit = Math.max(current.maxCommandsPerCommit, commands)
        current.maxCommitBytes = Math.max(current.maxCommitBytes, bytes)
        if (!committed) {
          current.storageRollbacks += 1
          return
        }
        current.storageCommitTotal += 1
        current.storageCommitBytes += bytes
        for (const participant of new Set(participants)) bump(current.storageCommits, participant)
      })
    },
    partsRead(read: PartsRead): void {
      if (open !== null) partsReads.push(read)
    },
    read(handler: string, rows: number, bytes = 0): void {
      inRound(current => {
        bump(current.storageReads, handler)
        bump(current.storageReadRows, handler, rows)
        current.maxReadBytes[handler] = Math.max(current.maxReadBytes[handler] ?? 0, bytes)
      })
    },
    receive(kind: 'model' | 'tool'): void {
      inRound(current => {
        if (kind === 'model') current.modelReceives += 1
        else current.toolReceives += 1
      })
    },
    modelRequest(): void {
      inRound(current => (current.modelRequests += 1))
    },
    toolInvoke(): void {
      inRound(current => (current.toolInvokes += 1))
    },
    ad02Commit(accepted: boolean): void {
      inRound(current => {
        if (accepted) current.ad02Commits = (current.ad02Commits ?? 0) + 1
        else current.ad02Refused += 1
      })
    },
    observeHistory(history: SessionHistory<unknown>): SessionHistory<unknown> {
      const handOut = (
        ids: readonly string[],
        projection: boolean,
        probe = false,
        view?: Ad04Read,
      ): void => {
        inRound(current => {
          current.historyReadCalls += 1
          current.historyRows += ids.length
          if (projection && probe) {
            current.probeReadCalls += 1
            current.probeReadRows += ids.length
          } else if (projection) {
            current.ad04ReadCalls += 1
            current.ad04ReadRows += ids.length
          }
        })
        if (open === null) return
        if (projection) projected += ids.length
        for (const id of ids) {
          if (seen.has(id)) rereads += 1
          else seen.add(id)
        }
        if (projection && !probe) {
          ad04Projected += ids.length
          if (view !== undefined) ad04Reads.push(view)
          ids.forEach((id, at) => {
            if (!ad04Seen.has(id)) {
              ad04Seen.add(id)
              return
            }
            ad04Rereads += 1
            const seq = view?.rows[at]
            if (seq !== undefined) ad04Again.push(seq)
          })
        }
      }
      const entries = (answer: Outcome<HistoryPage, unknown>): Outcome<HistoryPage, unknown> => {
        handOut('ok' in answer ? answer.ok.entries.map(item => `entry:${item.id}`) : [], false)
        return answer
      }
      return {
        begin: async input => entries(await history.begin(input)) as never,
        next: async input => entries(await history.next(input)) as never,
        since: async input => entries(await history.since(input)) as never,
        readModelView: async input => {
          const answer = await history.readModelView(input)
          const page = 'ok' in answer && answer.ok.kind === 'page' ? answer.ok : undefined
          const rows = page?.rows ?? []
          handOut(
            rows.map(row => `row:${row.entry}`),
            true,
            input.pageBytes <= 1,
            page && { upper: BigInt(page.basis.upper), rows: rows.map(row => BigInt(row.seq)) },
          )
          return answer
        },
      }
    },
  }
  return counters
}

export const PARTS_HANDLER = 'execution-record.parts'

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null)

function partsReadOf(request: ReadRequest, result: ReadResult): PartsRead {
  const input = (request.input ?? {}) as Record<string, unknown>
  const output = (result as { output?: unknown }).output as
    | { parts?: readonly { part: string; state: unknown }[]; next?: unknown }
    | undefined
  return {
    since: textOrNull(input['since']),
    after: textOrNull(input['after']),
    names: Array.isArray(input['parts']) ? (input['parts'] as string[]) : null,
    parts: (output?.parts ?? []).map(({ part, state }) => ({
      part,
      text: state === null ? 0 : JSON.stringify(state).length,
    })),
    next: textOrNull(output?.next),
  }
}

export function countingStorage(storage: SqlStorage, counters: RoundCounters): SqlStorage {
  return {
    database: storage.database,
    registerCombination: input => storage.registerCombination(input),
    query: identity => storage.query(identity),
    commit: async (request, options) => {
      const result = await storage.commit(request, options)
      counters.commit(
        request.commands.map(command => command.participant),
        result.kind === 'committed',
        request.commands.length,
        JSON.stringify(request).length,
      )
      return result
    },
    read: async (request, options) => {
      const result = await storage.read(request, options)
      if (result.kind !== 'read')
        counters.refusedReads.push({ handler: request.handler, answer: result })
      else if (request.handler === PARTS_HANDLER) counters.partsRead(partsReadOf(request, result))
      counters.read(
        request.handler,
        rowsOf(result),
        sizedHandler(request.handler) ? JSON.stringify(result).length : 0,
      )
      return result
    },
  }
}

export type MeasureEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'session' | 'context' | 'agent'
      phase: 'start' | 'end'
      span: number
      [field: string]: unknown
    }>
  | Readonly<{ kind: 'round-complete'; [field: string]: unknown }>

export type StageRecord = Readonly<{
  runId: string
  round: number
  generation: string
  eventKind: 'segment' | 'round-complete' | 'model' | 'tool'
  stage: string
  start: number
  end: number
  logCount: number
  detail: Readonly<Record<string, unknown>>
}>

export function clockGeneration(): string {
  return `${process.pid}@${performance.timeOrigin}`
}

export type StageRecorder = ReturnType<typeof recordStage>

export function recordStage(options: Readonly<{ logCount: () => number }>) {
  const records: StageRecord[] = []
  const open = new Map<number, { start: number; event: MeasureEvent; round: number; run: string }>()
  let round = 0
  let runId = ''
  const generation = clockGeneration()

  return {
    records,
    open,
    beginRound(next: number, run: string): void {
      round = next
      runId = run
    },
    observe(event: MeasureEvent): void {
      const at = performance.now()
      if (event.kind === 'round-complete') {
        records.push({
          runId,
          round,
          generation,
          eventKind: 'round-complete',
          stage: 'session',
          start: at,
          end: at,
          logCount: options.logCount(),
          detail: event,
        })
        return
      }
      if (event.phase === 'start') {
        open.set(event.span, { start: at, event, round, run: runId })
        return
      }
      const began = open.get(event.span)
      if (began === undefined) return
      open.delete(event.span)
      records.push({
        runId: began.run,
        round: began.round,
        generation,
        eventKind: 'segment',
        stage: event.segment,
        start: began.start,
        end: at,
        logCount: options.logCount(),
        detail: { ...began.event, ...event },
      })
    },
    stub(input: {
      kind: 'model' | 'tool'
      provider: string
      invocationId: string
      definedDelay: number
      actualStart: number
      actualEnd: number
    }): void {
      records.push({
        runId,
        round,
        generation,
        eventKind: input.kind,
        stage: input.kind,
        start: input.actualStart,
        end: input.actualEnd,
        logCount: options.logCount(),
        detail: {
          provider: input.provider,
          invocationId: input.invocationId,
          definedDelay: input.definedDelay,
          actualStart: input.actualStart,
          actualEnd: input.actualEnd,
        },
      })
    },
    lines(): string {
      return records.map(record => JSON.stringify(record)).join('\n') + '\n'
    },
  }
}

export function historyReadGrowth(
  rounds: readonly RoundCount[],
  added: number,
  rowsFor: (added: number) => number,
  calls: number,
): string[] {
  const broken: string[] = []
  const later = rounds.slice(1)
  for (const count of later) {
    if (count.ad04ReadCalls !== calls)
      broken.push(`round ${count.round}: ${count.ad04ReadCalls} AD-04 reads, ${calls} expected`)
    if (count.ad04ReadRows !== rowsFor(added))
      broken.push(
        `round ${count.round}: ${count.ad04ReadRows} AD-04 rows, ${rowsFor(added)} expected`,
      )
  }
  const [first, ...rest] = later
  for (const count of rest)
    if (first !== undefined && count.ad04ReadRows > first.ad04ReadRows)
      broken.push(
        `round ${count.round}: reads ${count.ad04ReadRows} rows, round ${first.round} read ${first.ad04ReadRows}`,
      )
  return broken
}

const ascending = (rows: Iterable<bigint>): bigint[] =>
  [...new Set(rows)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))

const upperOf = (round: Ad04RoundRows | undefined): bigint =>
  (round?.reads ?? []).reduce((top, read) => (read.upper > top ? read.upper : top), 0n)

export function ad04RowsOf(
  rows: readonly Ad04RoundRows[],
  round: number,
): Readonly<{ added: bigint[]; boundary: bigint; read: bigint[]; reread: bigint[] }> {
  const at = rows.findIndex(item => item.round === round)
  const current = rows[at]
  const boundary = upperOf(rows[at - 1])
  const added: bigint[] = []
  for (let row = boundary + 1n; row <= upperOf(current); row++) added.push(row)
  return {
    added,
    boundary,
    read: ascending((current?.reads ?? []).flatMap(read => read.rows)),
    reread: ascending(current?.rereads ?? []),
  }
}

export const PART_PAGE_TEXT = 256 * 1024
export const PART_PAGE_ROWS = 64

export function partPages(texts: readonly number[]): number {
  let pages = 1
  let used = 0
  let held = 0
  for (const text of texts) {
    if (held === PART_PAGE_ROWS || (held > 0 && used + text > PART_PAGE_TEXT)) {
      pages += 1
      used = 0
      held = 0
    }
    used += text
    held += 1
  }
  return pages
}

export function catchUpsOf(round: PartsRoundReads | undefined): number[][] {
  const catchUps: Map<string, number>[] = []
  for (const read of round?.reads ?? []) {
    if (read.since === null) continue
    if (read.after === null || catchUps.length === 0) catchUps.push(new Map())
    const parts = catchUps.at(-1)!
    for (const { part, text } of read.parts) if (!parts.has(part)) parts.set(part, text)
  }
  return catchUps.map(parts =>
    [...parts.entries()].sort(([left], [right]) => (left < right ? -1 : 1)).map(([, text]) => text),
  )
}

export function partsReadsOf(round: PartsRoundReads | undefined): {
  whole: number
  catchUpPages: number
} {
  return {
    whole: (round?.reads ?? []).filter(read => read.since === null).length,
    catchUpPages: catchUpsOf(round).reduce((sum, texts) => sum + partPages(texts), 0),
  }
}

export function partsTextOf(round: PartsRoundReads | undefined): number {
  return (round?.reads ?? []).reduce(
    (sum, read) => sum + read.parts.reduce((total, part) => total + part.text, 0),
    0,
  )
}
