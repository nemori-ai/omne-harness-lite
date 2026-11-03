// Waiting on a port under a bound. A port may not read the abort signal it is given, so the
// table and the read port keep their own time: the wait ends when the signal fires, and a value
// that arrives afterwards goes to `late`, which closes, stops or releases what came too late.
export function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  late: (value: T) => void,
): Promise<T | 'aborted'> {
  if (signal === undefined) return promise
  const afterwards = () => void promise.then(late, () => undefined)
  if (signal.aborted) {
    afterwards()
    return Promise.resolve('aborted')
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      afterwards()
      resolve('aborted')
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}
