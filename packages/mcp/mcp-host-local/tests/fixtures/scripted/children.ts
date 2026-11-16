import type { ChildProcess } from 'node:child_process'

const alive = new Map<ChildProcess, () => void>()

export function track(child: ChildProcess, kill: () => void = () => child.kill('SIGKILL')): void {
  alive.set(child, kill)
  child.once('exit', () => alive.delete(child))
}

export async function leftover(): Promise<readonly number[]> {
  const pids = [...alive.keys()].flatMap(child => (child.pid === undefined ? [] : [child.pid]))
  for (const [child, kill] of alive) {
    try {
      kill()
    } catch {}
    await new Promise<void>(resolve => child.once('exit', () => resolve()))
  }
  alive.clear()
  return pids
}
