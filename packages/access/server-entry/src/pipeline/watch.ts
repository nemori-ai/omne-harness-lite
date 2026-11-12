// What steps 8 and 9 wait on, raced against the two ways a call is cut short (#1233 spec 已定 12,
// 13): the take-down of its protocol (the abort signal of `enter`) and the caller going away (the
// response's `close`). Either one ends the wait at once; a dependency that never settles cannot
// hold the call, or the take-down, waiting.
import type { ServerResponse } from 'node:http'

/** `gone`: the caller went away, nobody reads an answer. `aborted`: the protocol was taken down. */
export type Interruption = 'aborted' | 'gone'

export type Attended<T> =
  | Readonly<{ kind: 'done'; value: T }>
  | Readonly<{ kind: 'threw' }>
  | Readonly<{ kind: 'interrupted'; by: Interruption }>

export type CallWatch = {
  /** Fires on either interruption; the body read listens to it to stop. */
  readonly halt: AbortSignal
  readonly interruption: () => Interruption | undefined
  /** Runs `work` unless already interrupted, and settles with whichever comes first. */
  readonly attend: <T>(work: () => Promise<T>) => Promise<Attended<T>>
  /** Stops listening. The abort signal is shared by every call of the mount. */
  readonly release: () => void
}

export function watchCall(signal: AbortSignal, res: ServerResponse): CallWatch {
  const halt = new AbortController()
  let gone = false
  const onClose = (): void => {
    gone = true
    halt.abort()
  }
  const onAbort = (): void => halt.abort()
  res.once('close', onClose)
  signal.addEventListener('abort', onAbort, { once: true })
  const interruption = (): Interruption | undefined =>
    gone ? 'gone' : signal.aborted ? 'aborted' : undefined
  const halted = new Promise<void>(resolve => {
    if (halt.signal.aborted) resolve()
    else halt.signal.addEventListener('abort', () => resolve(), { once: true })
  })

  return {
    halt: halt.signal,
    interruption,
    async attend<T>(work: () => Promise<T>): Promise<Attended<T>> {
      const before = interruption()
      if (before !== undefined) return { kind: 'interrupted', by: before }
      let started: Promise<T>
      try {
        started = work()
      } catch {
        return { kind: 'threw' }
      }
      const outcome = await Promise.race([
        started.then(
          (value): Attended<T> => ({ kind: 'done', value }),
          (): Attended<T> => ({ kind: 'threw' }),
        ),
        halted.then((): Attended<T> => ({ kind: 'interrupted', by: interruption() ?? 'aborted' })),
      ])
      return outcome
    },
    release() {
      res.off('close', onClose)
      signal.removeEventListener('abort', onAbort)
    },
  }
}
