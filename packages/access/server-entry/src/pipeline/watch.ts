import type { ServerResponse } from 'node:http'

export type Interruption = 'aborted' | 'gone'

export type Attended<T> =
  | Readonly<{ kind: 'done'; value: T }>
  | Readonly<{ kind: 'threw' }>
  | Readonly<{ kind: 'interrupted'; by: Interruption }>

export type CallWatch = {
  readonly halt: AbortSignal
  readonly interruption: () => Interruption | undefined
  readonly attend: <T>(work: () => Promise<T>) => Promise<Attended<T>>
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
  signal.addEventListener('abort', onAbort)
  const interruption = (): Interruption | undefined =>
    gone ? 'gone' : signal.aborted ? 'aborted' : undefined
  const halted = new Promise<void>(resolve => {
    halt.signal.addEventListener('abort', () => resolve())
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
