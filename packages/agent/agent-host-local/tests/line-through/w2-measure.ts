// The counting and the measurement events of the wave 2 joint world (C-JOINT, J6).
//
// Counts are taken where the product calls out, never from what a test expects: the storage the
// plugins share, the history source the request context reads, the two receivers and the doubles of
// the Model and the Tool. A counter belongs to the round that is open when the call happens; a call
// outside a round is counted into no round. The measurement events (R2-D17) are what the
// `measure?` observers of Session, Context and Agent give; this file only records them with one
// monotonic clock and does not judge them.
import type { Outcome } from '@omne-harness/operation-result'
import type { HistoryPage, SessionHistory } from '@omne-harness/session-contract'
import type { ReadResult, SqlStorage } from '@omne-harness/sql-contract'

/** The counts of one round (J6 table). `null` is a count whose source is not built into the world yet. */
export type RoundCount = Readonly<{
  round: number
  historyReadCalls: number
  historyRows: number
  /**
   * The model view reads of the AD-04 read path (a page size above 1) and the reads of the
   * qualification probes (the page size 1 that resolveHistory and the admission check use). The two
   * add up to `historyReadCalls` and `historyRows` less the reads of the history entries face.
   */
  ad04ReadCalls: number
  ad04ReadRows: number
  probeReadCalls: number
  probeReadRows: number
  /** Rows of the model-view projection that the history face handed out in this round. */
  projectedRows: number
  /**
   * The two counts above for the AD-04 read path alone (the probes left out): the rows its reads handed
   * out in this round, and those of them that an earlier AD-04 read had handed out.
   */
  ad04ProjectedRows: number
  ad04StableRecompute: number
  /** Rows handed out in this round that an earlier round had handed out: re-reads of the stable part. */
  stableRecompute: number
  storageCommits: Readonly<Record<string, number>>
  storageCommitTotal: number
  /** Commits the storage answered with anything but `committed`: retries of a conflict. */
  storageRollbacks: number
  /** The most commands one storage commit of the round carried. */
  maxCommandsPerCommit: number
  /** The size in bytes of the largest commit request of the round, as JSON text. */
  maxCommitBytes: number
  storageReads: Readonly<Record<string, number>>
  storageReadRows: Readonly<Record<string, number>>
  /**
   * The size in bytes (JSON text) of the largest single read of each handler that carries records or
   * the Session snapshot, and the bytes of all committed requests. They grow with the rounds by
   * design of the Session snapshot and the Agent records, so they belong to the curve, not to the
   * equality of the rounds of J6.
   */
  maxReadBytes: Readonly<Record<string, number>>
  storageCommitBytes: number
  /** `commitLog` calls of AD-02 that Session accepted. */
  ad02Commits: number | null
  /** `commitLog` calls of AD-02 that Session refused (a conflict on the head: AD-02 reads again). */
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

/** The handlers whose read size the curve of J6 follows: the Session snapshot and the Agent records. */
function sizedHandler(handler: string): boolean {
  return handler === 'session.work' || handler.startsWith('execution-record.')
}

/** The rows of a read output: the members that are arrays, summed. */
function rowsOf(result: ReadResult): number {
  if (result.kind !== 'read') return 0
  const { output } = result as { output: unknown }
  if (typeof output !== 'object' || output === null) return 0
  return Object.values(output).reduce<number>(
    (sum, member) => sum + (Array.isArray(member) ? member.length : 0),
    0,
  )
}

export type RoundCounters = ReturnType<typeof createRoundCounters>

/** The per-round counters. `begin` opens a round, `end` closes it and keeps its counts. */
export function createRoundCounters() {
  const rounds: RoundCount[] = []
  /** The reads the storage refused, with the handler and the answer: a long run names its limit here. */
  const refusedReads: { handler: string; answer: unknown }[] = []
  let open: Open | null = null
  // The rows the history face has handed out in all earlier rounds, the rows of the projection of
  // this round, and the rows of this round that were handed out before.
  const seen = new Set<string>()
  const ad04Seen = new Set<string>()
  let projected = 0
  let rereads = 0
  let ad04Projected = 0
  let ad04Rereads = 0

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
    refusedReads,
    begin(round: number): void {
      if (open !== null) throw new Error(`round ${open.round} is still open`)
      open = fresh(round)
      projected = 0
      rereads = 0
      ad04Projected = 0
      ad04Rereads = 0
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
      return count
    },
    /** One storage commit: counted once for each participant that has a command in it. */
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
    /** The commits of the AD-02 plugin, once the world has it. */
    ad02Commit(accepted: boolean): void {
      inRound(current => {
        if (accepted) current.ad02Commits = (current.ad02Commits ?? 0) + 1
        else current.ad02Refused += 1
      })
    },
    /**
     * The history face of Session, with every read and every row it hands out counted. A row that an
     * earlier round already handed out and that comes back is a re-read of the stable part.
     */
    observeHistory(history: SessionHistory<unknown>): SessionHistory<unknown> {
      const handOut = (ids: readonly string[], projection: boolean, probe = false): void => {
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
          for (const id of ids) {
            if (ad04Seen.has(id)) ad04Rereads += 1
            else ad04Seen.add(id)
          }
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
          const rows = 'ok' in answer && answer.ok.kind === 'page' ? answer.ok.rows : []
          handOut(
            rows.map(row => `row:${row.entry}`),
            true,
            input.pageBytes <= 1,
          )
          return answer
        },
      }
    },
  }
  return counters
}

/** The storage the world shares, with each commit and each read counted. */
export function countingStorage(storage: SqlStorage, counters: RoundCounters): SqlStorage {
  return {
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
      counters.read(
        request.handler,
        rowsOf(result),
        sizedHandler(request.handler) ? JSON.stringify(result).length : 0,
      )
      return result
    },
  }
}

// --- measurement events (R2-D17) ------------------------------------------------------------------

/** What the three measure observers hand over, as far as the recorder reads it. */
export type MeasureEvent =
  | Readonly<{
      kind: 'segment'
      segment: 'session' | 'context' | 'agent'
      phase: 'start' | 'end'
      span: number
      [field: string]: unknown
    }>
  | Readonly<{ kind: 'round-complete'; [field: string]: unknown }>

/** One recorded line of `e9-events.jsonl`. */
export type StageRecord = Readonly<{
  runId: string
  round: number
  /** The process and the clock the numbers belong to: numbers of two generations do not compare. */
  generation: string
  eventKind: 'segment' | 'round-complete' | 'model' | 'tool'
  stage: string
  start: number
  end: number
  logCount: number
  detail: Readonly<Record<string, unknown>>
}>

/** The clock generation: one per process, the origin of its `performance.now()`. */
export function clockGeneration(): string {
  return `${process.pid}@${performance.timeOrigin}`
}

export type StageRecorder = ReturnType<typeof recordStage>

/**
 * Records the events of the three segments and the round-complete fact under one clock. `logCount`
 * reads how many commits the log has seen at the call. A segment becomes one record when its end
 * arrives; a start without an end stays in `open`.
 */
export function recordStage(options: Readonly<{ logCount: () => number }>) {
  const records: StageRecord[] = []
  const open = new Map<number, { start: number; event: MeasureEvent; round: number; run: string }>()
  let round = 0
  let runId = ''
  const generation = clockGeneration()

  return {
    records,
    open,
    /** The round the next events belong to. */
    beginRound(next: number, run: string): void {
      round = next
      runId = run
    },
    /** The observer to hand to Session, Context and Agent. */
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
    /** The record of one Model or Tool double call. */
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

/**
 * The criterion of S3 item 3 on the counts of the rounds from the second on: the model view reads
 * of the AD-04 read path depend on the rows the round added, not on the length of the history. For
 * each round after the first it lists what breaks that: a round that reads more calls or more rows
 * than the one before it, or than `rows(added)`, the rows the read path needs for `added` new rows.
 * An empty list is a pass.
 */
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
