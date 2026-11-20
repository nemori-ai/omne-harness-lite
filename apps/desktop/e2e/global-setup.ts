import { SCREEN_LOCKED_REASON, screenLock } from '../scripts/session-state.ts'
import { type Target, targetProcesses } from './desktop.ts'

const TARGETS: readonly Target[] = ['unpackaged', 'packaged']

/** Refuses to start beside a running app of this checkout, or on a locked macOS screen. */
export default function globalSetup(): () => void {
  const lock = screenLock()
  if ('locked' in lock && lock.locked)
    throw new Error(`e2e: not run: ${SCREEN_LOCKED_REASON}; unlock the screen and run again`)
  for (const target of TARGETS) {
    const running = targetProcesses(target)
    if (running.length > 0)
      throw new Error(`the ${target} app is running (pids ${running.join(', ')}); quit it first`)
  }
  return () => {
    const left = TARGETS.flatMap(target => targetProcesses(target))
    if (left.length === 0) return
    for (const pid of left)
      try {
        process.kill(pid, 'SIGKILL')
      } catch {}
    throw new Error(`Electron processes outlived the e2e run and were killed: ${left.join(', ')}`)
  }
}
