import type { ExecutionObserver, ExecutionRead } from '@omne-harness-lite/tool-execution-runtime'

/** The subscription belongs to this observer. It never owns the execution's abort signal. */
export function createExecutionObserver(input: {
  readonly read: () => Promise<ExecutionRead>
  readonly frames: ExecutionObserver['frames']
  readonly subscribe: (wake: () => void) => () => void
  readonly isOpen: () => boolean
  readonly onRelease?: () => void
}): ExecutionObserver {
  let released = false
  const pending = new Set<() => void>()
  const active = () => !released && input.isOpen()
  const stopped = (): Extract<ExecutionRead, { kind: 'rejected' }> => ({
    kind: 'rejected',
    reason: 'ownerStopped',
  })
  async function observe<T>(operation: () => Promise<T>): Promise<T | ReturnType<typeof stopped>> {
    if (!active()) return stopped()
    let cancel!: () => void
    const cancelled = new Promise<ReturnType<typeof stopped>>(resolve => {
      cancel = () => resolve(stopped())
    })
    pending.add(cancel)
    try {
      const result = await Promise.race([operation(), cancelled])
      return active() ? result : stopped()
    } finally {
      pending.delete(cancel)
    }
  }
  const read = async (): Promise<ExecutionRead> => {
    return observe(input.read)
  }
  return Object.freeze({
    read,
    async waitForEnd(): Promise<ExecutionRead> {
      while (active()) {
        let wake!: () => void
        const changed = new Promise<void>(resolve => {
          wake = resolve
        })
        pending.add(wake)
        const unsubscribe = input.subscribe(wake)
        try {
          // Subscribe first, so a terminal append during read cannot lose the wake.
          const result = await read()
          if (result.kind === 'rejected' || result.snapshot.state.phase === 'ended') return result
          await changed
        } finally {
          unsubscribe()
          pending.delete(wake)
        }
      }
      return stopped()
    },
    async frames() {
      return observe(input.frames)
    },
    release() {
      if (released) return
      released = true
      for (const wake of pending) wake()
      input.onRelease?.()
    },
  } satisfies ExecutionObserver)
}
