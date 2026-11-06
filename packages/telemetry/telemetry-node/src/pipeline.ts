import type { Admission, CloseReport, DropReason } from '@omne-harness/telemetry-contract'
import type { TelemetryBudgets, TelemetryClock } from './options.ts'
import type { Outlet, TransportResult } from './outlet.ts'
import type { TelemetryRecord } from './record.ts'

export type Dropped = Extract<Admission, { kind: 'dropped' }>

type Queued = Readonly<{ record: TelemetryRecord; bytes: number }>

/** What the emitters see of the pipeline. */
export type Pipeline = Readonly<{
  accepting(): boolean
  /** Admits one formed record into the bounded queue, or drops it. */
  admit(record: TelemetryRecord): Admission
  drop(reason: DropReason): Dropped
  /** Takes one place among the open segments; false when they are all taken. */
  openSegment(): boolean
  closeSegment(): void
  close(deadlineMs: number): Promise<CloseReport>
}>

const ADMITTED: Admission = Object.freeze({ kind: 'admitted' })
const DROPPED = new Map<DropReason, Dropped>(
  (['disabled', 'sampled', 'invalid', 'policy', 'capacity', 'expired', 'closed'] as const).map(
    reason => [reason, Object.freeze({ kind: 'dropped', reason })],
  ),
)

function dropped(reason: DropReason): Dropped {
  // The map holds every DropReason.
  return DROPPED.get(reason) as Dropped
}

function byteSize(record: TelemetryRecord): number {
  return Buffer.byteLength(JSON.stringify(record), 'utf8')
}

/**
 * The bounded queue between admission and the outlet, and the counts that do not pass through it.
 * Admission is synchronous; the drain runs on a later turn of the event loop, so a caller never
 * waits for the outlet.
 */
export function createPipeline(
  input: Readonly<{
    generation: string
    budgets: TelemetryBudgets
    clock: TelemetryClock
    outlet: Outlet
    summary: (line: string) => void
  }>,
): Pipeline {
  const { generation, budgets, clock, outlet } = input
  const droppedBy = new Map<DropReason, number>()
  let queue: Queued[] = []
  let queueBytes = 0
  let admitted = 0
  let outputErrors = 0
  let openSegments = 0
  let reachedSink = false
  let drainScheduled = false
  let lastSummaryAt: number | undefined
  let closing: Promise<CloseReport> | undefined

  function summaryLine(): string {
    const drops = [...droppedBy].map(([reason, count]) => ` dropped.${reason}=${count}`).join('')
    return (
      `telemetry generation=${generation} admitted=${admitted} queued=${queue.length}` +
      ` openSegments=${openSegments} outputErrors=${outputErrors}${drops}`
    )
  }

  /** At most one summary line per interval; it never passes through the queue. */
  function noteTrouble(): void {
    if (closing !== undefined) return
    const now = clock.monotonicMs()
    if (lastSummaryAt !== undefined && now - lastSummaryAt < budgets.summaryIntervalMs) return
    lastSummaryAt = now
    try {
      input.summary(summaryLine())
    } catch {
      // The last local path failed too; the counts stay in the close report.
    }
  }

  function drop(reason: DropReason): Dropped {
    droppedBy.set(reason, (droppedBy.get(reason) ?? 0) + 1)
    noteTrouble()
    return dropped(reason)
  }

  /** Each record is written on its own: one failure does not take the rest of the batch with it. */
  function deliver(item: Queued): void {
    if (outlet.write(item.record)) {
      reachedSink = true
      return
    }
    outputErrors += 1
    noteTrouble()
  }

  /** Writes the queue in order until it is empty or the deadline has come. */
  function drain(deadlineAt?: number): void {
    const batch = queue
    queue = []
    queueBytes = 0
    for (const [index, item] of batch.entries()) {
      if (deadlineAt !== undefined && clock.monotonicMs() >= deadlineAt) {
        queue = batch.slice(index)
        queueBytes = queue.reduce((total, rest) => total + rest.bytes, 0)
        return
      }
      deliver(item)
    }
  }

  function scheduleDrain(): void {
    if (drainScheduled) return
    drainScheduled = true
    setImmediate(() => {
      drainScheduled = false
      if (closing === undefined) drain()
    })
  }

  function admit(record: TelemetryRecord): Admission {
    if (closing !== undefined) return drop('closed')
    const bytes = byteSize(record)
    if (bytes > budgets.maxRecordBytes) return drop('invalid')
    if (queue.length >= budgets.maxQueueItems || queueBytes + bytes > budgets.maxQueueBytes)
      return drop('capacity')
    queue.push({ record, bytes })
    queueBytes += bytes
    admitted += 1
    scheduleDrain()
    return ADMITTED
  }

  function report(pending: number, transport: TransportResult): CloseReport {
    const flush = pending > 0 ? 'deadline' : outputErrors > 0 ? 'failed' : 'completed-to-boundary'
    const lost = [...droppedBy.values()].reduce((total, count) => total + count, outputErrors)
    return Object.freeze({
      generation,
      admission: 'closed',
      admitted,
      dropped: lost,
      droppedBy: Object.freeze(Object.fromEntries(droppedBy)),
      pending,
      flush,
      boundary: flush === 'completed-to-boundary' || reachedSink ? 'local-sink' : 'none',
      transport,
    })
  }

  async function finish(deadlineAt: number): Promise<CloseReport> {
    const pending = queue.length
    queue = []
    queueBytes = 0
    if (pending > 0) {
      // The deadline has passed: the transport is ended without waiting, and is never `closed`.
      outlet.abandon()
      return report(pending, 'unconfirmed')
    }
    return report(0, await outlet.close(Math.max(0, deadlineAt - clock.monotonicMs())))
  }

  function close(deadlineMs: number): Promise<CloseReport> {
    if (closing !== undefined) return closing
    const wait = Number.isFinite(deadlineMs) && deadlineMs > 0 ? deadlineMs : 0
    const deadlineAt = clock.monotonicMs() + wait
    // Admission stops first, then the queue drains to the local sink.
    closing = Promise.resolve().then(() => finish(deadlineAt))
    drain(deadlineAt)
    return closing
  }

  return Object.freeze({
    accepting: () => closing === undefined,
    admit,
    drop,
    openSegment() {
      if (openSegments >= budgets.maxOpenSegments) return false
      openSegments += 1
      return true
    },
    closeSegment() {
      openSegments -= 1
    },
    close,
  })
}
