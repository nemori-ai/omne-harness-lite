import type { Cancel, TimeSource, WaitOptions } from './source.ts'

export type Waited = 'elapsed' | 'cancelled'

function waited(
  register: (fire: () => void) => Cancel,
  signal: AbortSignal | undefined,
): Promise<Waited> {
  return new Promise(resolve => {
    if (signal?.aborted === true) return resolve('cancelled')
    const onAbort = (): void => {
      cancel()
      resolve('cancelled')
    }
    const cancel = register(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve('elapsed')
    })
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export const sleep = (time: TimeSource, delayMs: number, signal?: AbortSignal): Promise<Waited> =>
  waited(fire => time.after(delayMs, fire), signal)

export const waitUntil = (
  time: TimeSource,
  epochMs: number,
  signal?: AbortSignal,
): Promise<Waited> => waited(fire => time.at(epochMs, fire), signal)

export function every(
  time: TimeSource,
  periodMs: number,
  run: () => void,
  options?: WaitOptions,
): Cancel {
  let stopped = false
  let cancel: Cancel
  const arm = (): void => {
    cancel = time.after(
      periodMs,
      () => {
        run()
        if (!stopped) arm()
      },
      options,
    )
  }
  arm()
  return () => {
    stopped = true
    cancel()
  }
}
