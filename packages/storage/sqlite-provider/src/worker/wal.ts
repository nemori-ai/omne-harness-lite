// WAL maintenance inside the write Worker (SPEC 12.3). `tick` runs between two physical
// transactions, never inside one. It never changes `synchronous`, and it never waits for a reader:
// the restart checkpoint runs with a zero busy timeout, so a reader that has not ended makes it
// fail at once and the next tick tries again. A write request or a query therefore waits for one
// checkpoint call at most, not for a reader.
import { statSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import type { WalState, WorkerEnv } from './protocol.ts'

export type WalEnv = Pick<
  WorkerEnv,
  | 'file'
  | 'lockWaitMs'
  | 'checkpointIntervalMs'
  | 'checkpointWalBytes'
  | 'walReadPauseBytes'
  | 'walWriteStopBytes'
>

export type TickReport = Readonly<{ ran: 'PASSIVE' | 'TRUNCATE' | null }>

/** Checkpoints in a row without progress that SPEC 12.3 asks for before a state change. */
const STALLED_CHECKPOINTS = 2
const WAL_FRAME_HEADER_BYTES = 24

type CheckpointRow = { busy: number; log: number; checkpointed: number }

export class WalMaintainer {
  state: WalState = 'normal'
  private lastAt: number
  private lastBackfilled = -1
  private stalled = 0
  /** File size at the last checkpoint run. A size trigger needs growth beyond it. */
  private lastFileBytes: number
  private frameBytes = 0
  private readonly env: WalEnv
  private readonly db: () => DatabaseSync | null
  private readonly emit: (state: WalState) => void
  private readonly now: () => number

  constructor(
    env: WalEnv,
    db: () => DatabaseSync | null,
    emit: (state: WalState) => void,
    now: () => number = Date.now,
  ) {
    this.env = env
    this.db = db
    this.emit = emit
    this.now = now
    this.lastAt = now()
    this.lastFileBytes = this.walBytes()
  }

  /** The WAL that no checkpoint has written back yet. The file keeps its length after a reset. */
  private pendingBytes(db: DatabaseSync, row: CheckpointRow | null, fileBytes: number): number {
    if (row === null) return fileBytes
    if (this.frameBytes === 0) {
      const page = db.prepare('pragma page_size').get() as { page_size: number }
      this.frameBytes = page.page_size + WAL_FRAME_HEADER_BYTES
    }
    return Math.max(0, row.log - row.checkpointed) * this.frameBytes
  }

  private walBytes(): number {
    try {
      return statSync(`${this.env.file}-wal`).size
    } catch {
      return 0
    }
  }

  /** The checkpoint of this tick. null: it failed or was blocked, which counts as no progress. */
  private checkpoint(db: DatabaseSync, mode: 'PASSIVE' | 'TRUNCATE'): CheckpointRow | null {
    const restart = mode === 'TRUNCATE'
    try {
      if (restart) db.exec('pragma busy_timeout = 0')
      return db.prepare(`pragma wal_checkpoint(${mode})`).get() as CheckpointRow
    } catch {
      return null
    } finally {
      if (restart) {
        try {
          db.exec(`pragma busy_timeout = ${String(this.env.lockWaitMs)}`)
        } catch {
          // The connection is unusable. The next request reports what it can prove.
        }
      }
    }
  }

  tick(): TickReport {
    const db = this.db()
    if (db === null || db.isTransaction) return { ran: null }
    const { checkpointIntervalMs, checkpointWalBytes } = this.env
    const at = this.now()
    const fileBytes = this.walBytes()
    const grown = fileBytes > checkpointWalBytes && fileBytes > this.lastFileBytes
    if (at - this.lastAt < checkpointIntervalMs && !grown) return { ran: null }
    this.lastAt = at
    const mode = this.state === 'normal' ? 'PASSIVE' : 'TRUNCATE'
    const row = this.checkpoint(db, mode)
    this.lastFileBytes = this.walBytes()
    const bytes = this.pendingBytes(db, row, this.lastFileBytes)
    const progressed =
      row !== null &&
      ((mode === 'TRUNCATE' && row.busy === 0) || row.checkpointed > this.lastBackfilled)
    if (row !== null) this.lastBackfilled = row.checkpointed
    if (bytes <= checkpointWalBytes || progressed) this.stalled = 0
    else this.stalled += 1
    this.settle(bytes)
    return { ran: mode }
  }

  /** SPEC 12.3 items 2 and 3. Several steps may apply at once, for example after a truncate. */
  private settle(bytes: number): void {
    const before = this.state
    const { checkpointWalBytes, walReadPauseBytes, walWriteStopBytes } = this.env
    if (this.state === 'write-stopped' && bytes < walReadPauseBytes) this.state = 'read-paused'
    if (this.state === 'read-paused' && bytes < checkpointWalBytes) this.state = 'normal'
    else if (
      this.state === 'read-paused' &&
      bytes > walWriteStopBytes &&
      this.stalled >= STALLED_CHECKPOINTS
    )
      this.state = 'write-stopped'
    else if (
      this.state === 'normal' &&
      bytes > walReadPauseBytes &&
      this.stalled >= STALLED_CHECKPOINTS
    )
      this.state = 'read-paused'
    if (this.state !== before) this.emit(this.state)
  }
}
