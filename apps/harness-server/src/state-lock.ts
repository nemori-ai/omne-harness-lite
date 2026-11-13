// The exclusive lock of one `serve` run on its state directory.
//
// Why it exists. After a restart, the durable records still name the runtimes of the earlier
// process as the holders of work in flight. Taking that work over is safe only when the earlier
// process is really gone: a fence keeps its late writes out of the records, and nothing keeps it
// from still sending to a model provider. So the run must be able to show that no other process
// works on the same state. This lock is that proof on one machine. It is the degenerate case of a
// lease: it never expires while the holder lives, and it ends with the holder.
//
// How. The lock is the exclusive file lock that SQLite takes on a database file in the directory
// (`locking_mode = EXCLUSIVE`): an operating-system lock on every platform SQLite supports, taken
// in one step, and released by the system when the process ends, however it ends. A second
// connection, of another process or of this one, is refused at once. No timestamp, no process id
// check and no stale file is involved.
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
    /* wall-clock: evidence-instant -- names one holding of the lock, compared with nothing */ new Date().toISOString(),
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
 * The proof that an instance this run's host does not run has no runtime anywhere: the run holds
 * the exclusive lock of its state directory, so every earlier process that worked on the same
 * records has ended, and its instances with it. `current` gives the lock of the run at each
 * judgment; without a held lock there is no proof, and nothing is judged lost.
 */
export function lostContactBy(
  current: () => StateLock | undefined,
): (instance: string) => DurableEvidence | null {
  return instance => {
    const lock = current()
    if (lock === undefined || !lock.held()) return null
    return {
      owner: '@omne-harness/harness-server',
      record: 'state-lock',
      revision: lock.since,
      digest: `instance:${instance}`,
    }
  }
}
