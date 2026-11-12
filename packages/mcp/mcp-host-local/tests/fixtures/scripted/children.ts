// The registry of the child processes a test spawned, so that a test can prove it left none.
import type { ChildProcess } from 'node:child_process'

const alive = new Map<ChildProcess, () => void>()

/** Registers a child; `kill` ends it and its group when it is left over (default: SIGKILL). */
export function track(child: ChildProcess, kill: () => void = () => child.kill('SIGKILL')): void {
  alive.set(child, kill)
  child.once('exit', () => alive.delete(child))
}

/** The pids still alive. A test fails on a non-empty list and kills them. */
export async function leftover(): Promise<readonly number[]> {
  const pids = [...alive.keys()].flatMap(child => (child.pid === undefined ? [] : [child.pid]))
  for (const [child, kill] of alive) {
    try {
      kill()
    } catch {
      // Already gone.
    }
    await new Promise<void>(resolve => child.once('exit', () => resolve()))
  }
  alive.clear()
  return pids
}
