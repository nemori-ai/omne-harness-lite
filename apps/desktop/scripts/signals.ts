import type { ChildProcess } from 'node:child_process'

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/** Passes each signal on to the app in its own group, so its quit can finish; a third kills it. */
export function forwardSignals(
  current: () => ChildProcess | undefined,
  note: (line: string) => void,
  onSignal?: () => void,
): void {
  let received = 0
  for (const signal of SIGNALS)
    process.on(signal, () => {
      onSignal?.()
      const child = current()
      if (child === undefined) return
      const running = () => child.exitCode === null && child.signalCode === null
      received += 1
      if (process.platform === 'win32' || child.pid === undefined) {
        if (running()) child.kill()
        return
      }
      if (received >= 3 || (!running() && received >= 2)) {
        note(`${signal} again: killing the app's process group ${child.pid}`)
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
        return
      }
      if (!running())
        return note(`${signal}: the app has exited; a second signal kills its helpers`)
      if (received === 2) note(`${signal} again: passed on; a third kills the app`)
      try {
        process.kill(child.pid, signal)
      } catch {}
    })
}
