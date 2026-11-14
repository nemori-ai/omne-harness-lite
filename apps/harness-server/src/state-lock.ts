// The lock is an operating-system file lock (SQLite `locking_mode = EXCLUSIVE`): released however the
// process ends, so no timestamp, process id or stale file may stand in for it.
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DurableEvidence } from '@omne-harness/agent-contract'

export const STATE_LOCK_FILE = 'serve.lock'

export type StateLock = Readonly<{
  since: string
  held(): boolean
  release(): void
}>

export function acquireStateLock(
  stateRoot: string,
  now: () => string = () =>
    /* wall-clock: observation-time -- names one holding of the lock, compared with nothing */ new Date().toISOString(),
): Readonly<{ kind: 'held'; lock: StateLock }> | Readonly<{ kind: 'in-use' }> {
  const database = new DatabaseSync(join(stateRoot, STATE_LOCK_FILE), { timeout: 0 })
  try {
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

function busy(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { errcode?: unknown }).errcode
  return typeof code === 'number' && ((code & 0xff) === 5 || (code & 0xff) === 6)
}

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
