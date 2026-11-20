import { type Target, targetProcesses } from './desktop.ts'

const TARGETS: readonly Target[] = ['unpackaged', 'packaged', 'release']

/** Refuses to start beside a running app of this checkout: the teardown could not tell them apart. */
export default function globalSetup(): () => void {
  for (const target of TARGETS) {
    const running = targetProcesses(target)
    if (running.length > 0)
      throw new Error(`the ${target} app is running (pids ${running.join(', ')}); quit it first`)
  }
  // Every app started must be gone afterwards, with its renderer, GPU and utility processes.
  return () => {
    const left = TARGETS.flatMap(target => targetProcesses(target))
    if (left.length === 0) return
    for (const pid of left)
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // Gone in the meantime.
      }
    throw new Error(`Electron processes outlived the e2e run and were killed: ${left.join(', ')}`)
  }
}
