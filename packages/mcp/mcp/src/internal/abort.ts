// Waiting on a port under a bound. A port may not read the abort signal it is given, so the
// table and the read port keep their own time: the wait ends when the signal fires, and what the
// port hands over afterwards is the caller's to close, stop or release on arrival.

/** The answer of a port, or the bound first: then the port's promise is still the caller's. */
export type Bounded<T> =
  | Readonly<{ kind: 'answered'; value: T }>
  | Readonly<{ kind: 'aborted'; late: Promise<T> }>

export function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<Bounded<T>> {
  const answered = (value: T): Bounded<T> => ({ kind: 'answered', value })
  if (signal === undefined) return promise.then(answered)
  const aborted = (): Bounded<T> => {
    // A rejection after the bound is nobody's result; the late promise stays usable for whoever
    // closes what arrives.
    void promise.catch(() => undefined)
    return { kind: 'aborted', late: promise }
  }
  if (signal.aborted) return Promise.resolve(aborted())
  return new Promise((resolve, reject) => {
    const onAbort = () => resolve(aborted())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort)
        resolve(answered(value))
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/**
 * Settles what a port hands over after the bound. A rejection of the port or of the settling is
 * dropped: it is not the result of any caller, and this member has no log to report it to.
 */
export function afterwards<T>(late: Promise<T>, settle: (value: T) => Promise<void>): void {
  void late.then(settle, () => undefined).catch(() => undefined)
}
