/** Own admission before node:https; a destroyed Node Agent queue entry may await a socket. */
export function connectionAdmission(maximum: number) {
  interface Waiter {
    grant: () => void
    cancel: () => void
  }
  const waiting: Waiter[] = []
  let active = 0,
    closed = false
  function drain(): void {
    while (!closed && active < maximum && waiting.length) waiting.shift()?.grant()
  }
  return {
    acquire(signal: AbortSignal): Promise<(() => void) | undefined> {
      if (closed || signal.aborted) return Promise.resolve(undefined)
      return new Promise(resolve => {
        const waiter: Waiter = {
          grant: () => {
            signal.removeEventListener('abort', waiter.cancel)
            active++
            let released = false
            resolve(() => {
              if (!released) {
                released = true
                active--
                drain()
              }
            })
          },
          cancel: () => {
            const index = waiting.indexOf(waiter)
            if (index >= 0) waiting.splice(index, 1)
            signal.removeEventListener('abort', waiter.cancel)
            resolve(undefined)
          },
        }
        waiting.push(waiter)
        signal.addEventListener('abort', waiter.cancel, { once: true })
        drain()
      })
    },
    close(): void {
      closed = true
      for (const waiter of [...waiting]) waiter.cancel()
    },
  }
}
