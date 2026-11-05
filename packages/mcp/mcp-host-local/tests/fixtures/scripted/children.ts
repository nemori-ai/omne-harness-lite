// The registry of the child processes a test spawned, so that a test can prove it left none.
import type { ChildProcess } from 'node:child_process'

const alive = new Set<ChildProcess>()

export function track(child: ChildProcess): void {
  alive.add(child)
  child.once('exit', () => alive.delete(child))
}

/** The pids still alive. A test fails on a non-empty list and kills them. */
export async function leftover(): Promise<readonly number[]> {
  const pids = [...alive].flatMap(child => (child.pid === undefined ? [] : [child.pid]))
  for (const child of alive) {
    child.kill('SIGKILL')
    await new Promise<void>(resolve => child.once('exit', () => resolve()))
  }
  alive.clear()
  return pids
}
