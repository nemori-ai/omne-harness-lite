import { readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { watchFalls, type Fall } from '@omne-harness/assembly-cordis'

/** Where a process that went down leaves what brought it down, for the next one to read once. */
export const PROCESS_FALL_FILE = 'process-fall.json'
/** The name under which a run reads the fall of the process before it; null when that one did not fall. */
export const LAST_FALL_KEY = 'harness-server.lastFall'

export type { Fall }

/** The fall the last process left in this state directory; reading it takes it away. */
export function takeLastFall(stateRoot: string): Fall | null {
  const path = join(stateRoot, PROCESS_FALL_FILE)
  try {
    const kept = JSON.parse(readFileSync(path, 'utf8')) as Partial<Fall> | null
    rmSync(path, { force: true })
    if (kept === null || typeof kept.error !== 'string') return null
    return { who: typeof kept.who === 'string' ? kept.who : null, error: kept.error }
  } catch {
    return null
  }
}

/** For the serve process alone: an exception nobody caught is kept with whom it is traced to, and the process leaves with 1. */
export function watchProcessFalls(stateRoot: string): () => void {
  return watchFalls({
    record(fall) {
      const traced = fall.who === null ? 'traced to nobody' : `traced to ${fall.who}`
      writeSync(2, `serve: uncaught: ${fall.error.split('\n')[0] ?? ''}; ${traced}\n`)
      try {
        writeFileSync(join(stateRoot, PROCESS_FALL_FILE), JSON.stringify(fall), { mode: 0o600 })
      } catch {
        writeSync(2, 'serve: the fall was not kept\n')
      }
    },
    exit: code => process.exit(code),
  })
}
