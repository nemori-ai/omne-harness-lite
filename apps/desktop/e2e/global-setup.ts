import { deadline } from '../scripts/release-launch.ts'
import { SCREEN_LOCKED_REASON, screenLock } from '../scripts/session-state.ts'
import { type Target, targetProcesses } from './desktop.ts'

const TARGETS: readonly Target[] = ['unpackaged', 'packaged']

/** Refuses to start beside a running app of this checkout, or on a locked macOS screen. */
export default function globalSetup(): () => Promise<void> {
  const lock = screenLock()
  if ('locked' in lock && lock.locked)
    throw new Error(`e2e: not run: ${SCREEN_LOCKED_REASON}; unlock the screen and run again`)
  for (const target of TARGETS) {
    const running = targetProcesses(target)
    if (running.length > 0)
      throw new Error(`the ${target} app is running (pids ${running.join(', ')}); quit it first`)
  }
  // An instance matched by path may be one started by hand: each fixture stops what it launched.
  return async () => {
    let left = TARGETS.flatMap(target => targetProcesses(target))
    const expired = deadline(5_000)
    while (left.length > 0 && !expired()) {
      await new Promise(done => setTimeout(done, 100))
      left = TARGETS.flatMap(target => targetProcesses(target))
    }
    if (left.length > 0)
      throw new Error(`Electron processes still running after the e2e run: ${left.join(', ')}`)
  }
}
