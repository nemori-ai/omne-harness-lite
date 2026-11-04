// Waiting on a port: under a bound, and when it rejects instead of answering. A port may not
// read the abort signal it is given, so the table and the read port keep their own time: the
// wait ends when the signal fires, and what the port hands over afterwards is the caller's to
// close, stop or release on arrival. A port that rejects instead of answering breaches its
// contract; `answerOf` reads the breach as SPEC decision 4 says, at the call of the port.

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
 * Settles what a port hands over after the bound. A port that rejects instead hands over nothing:
 * `settle` sees `undefined`. Neither is the result of any caller. The ports `settle` calls absorb
 * their own breaches (`answerOf`), so the promise returned rejects only on an error of this
 * package, which is not absorbed here.
 */
export function afterwards<T>(
  late: Promise<T>,
  settle: (value: T | undefined) => Promise<void>,
): Promise<void> {
  return answerOf<T | undefined>(late, undefined).then(settle)
}

/**
 * The answer of a port, or `whenRejected` when the port rejects instead of answering: a breach
 * of its contract, read as SPEC decision 4 says. Adoption and eligibility read as `unknown`, the
 * store as `unavailable`, `close()` as closed, `stop()` as `unconfirmed`, `release()` as released,
 * and a port that rejects after its bound as handing over nothing.
 */
export function answerOf<T>(asked: Promise<T>, whenRejected: T): Promise<T> {
  return asked.then(
    value => value,
    () => whenRejected,
  )
}
