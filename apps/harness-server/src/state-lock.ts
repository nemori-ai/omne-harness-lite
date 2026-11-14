// The lock is an operating-system file lock (SQLite `locking_mode = EXCLUSIVE`): released however the
// process ends, so no timestamp, process id or stale file may stand in for it.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DurableEvidence } from '@omne-harness/agent-contract'

/** The file of the lock inside the state directory. Its content is not read by anyone. */
export const STATE_LOCK_FILE = 'serve.lock'

export type StateLock = Readonly<{
  /** The instant the lock was taken, as ISO text. It names this holding of the lock. */
  since: string
  /** False after `release`. */
  held(): boolean
  /** Gives the lock up. Idempotent. */
  release(): void
}>

/**
 * Takes the lock on `stateRoot`. `in-use`: another holder has it. Any other failure to open or
 * lock the file is thrown: the directory is not usable.
 */
export function acquireStateLock(
  stateRoot: string,
  now: () => string = () =>
    /* wall-clock: observation-time -- names one holding of the lock, compared with nothing */ new Date().toISOString(),
): Readonly<{ kind: 'held'; lock: StateLock }> | Readonly<{ kind: 'in-use' }> {
  const database = new DatabaseSync(join(stateRoot, STATE_LOCK_FILE), { timeout: 0 })
  try {
    // The exclusive mode takes the file lock at the first write and keeps it until the close.
    database.exec('PRAGMA locking_mode = EXCLUSIVE')
    database.exec('CREATE TABLE IF NOT EXISTS holder (since TEXT NOT NULL)')
    database.exec('DELETE FROM holder')
    const since = now()
    database.prepare('INSERT INTO holder (since) VALUES (?)').run(since)
    let held = true
    return {
      kind: 'held',
      lock: {
        since,
        held: () => held,
        release() {
          if (!held) return
          held = false
          database.close()
        },
      },
    }
  } catch (error) {
    database.close()
    if (busy(error)) return { kind: 'in-use' }
    throw error
  }
}

/** SQLITE_BUSY (5) and SQLITE_LOCKED (6), with their extended codes: another connection holds the file. */
function busy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { errcode?: unknown }).errcode
  return typeof code === 'number' && ((code & 0xff) === 5 || (code & 0xff) === 6)
}

/**
 * The proof that an instance this run's host does not run, or a call it does not drive, has no
 * runtime anywhere: the run holds the exclusive lock of its state directory, so every earlier
 * process that worked on the same records has ended, and its instances and drives with it.
 * `subject` says which of the two the judged identity is. `current` gives the lock of the run at
 * each judgment; without a held lock there is no proof, and nothing is judged lost.
 */
export function lostContactBy(
  current: () => StateLock | undefined,
  subject: 'instance' | 'call',
): (id: string) => DurableEvidence | null {
  return id => {
    const lock = current()
    if (lock === undefined || !lock.held()) return null
    return {
      owner: '@omne-harness/harness-server',
      record: 'state-lock',
      revision: lock.since,
      digest: `${subject}:${id}`,
    }
  }
}
