// Waiting on a port: under a bound, and when it rejects instead of answering. A port may not
// read the abort signal it is given, so the table and the read port keep their own time: the
// wait ends when the signal fires, and what the port hands over afterwards is the caller's to
// close, stop or release on arrival. A port that rejects instead of answering an `Outcome` is in
// breach of its contract; `answerOf` reads the breach of a read port as the clause says.

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

/** What a port handed over after the bound, or that it rejected instead. */
export type Late<T> = Readonly<{ kind: 'answered'; value: T }> | Readonly<{ kind: 'rejected' }>

/**
 * Settles what a port hands over after the bound, its rejection included. Neither is the result
 * of any caller, and this member has no log to report a rejection to: `settle` sees it as
 * `rejected`, and the promise returned never rejects, not even when the settling does.
 */
export function afterwards<T>(
  late: Promise<T>,
  settle: (late: Late<T>) => Promise<void>,
): Promise<void> {
  return late
    .then(
      value => settle({ kind: 'answered', value }),
      () => settle({ kind: 'rejected' }),
    )
    .catch(() => undefined)
}

/**
 * The answer of a read port, or `whenRejected` when the port rejects instead of answering: a
 * breach of AV, UE or CS, read as the clause says (`unknown`, `unavailable`; SPEC decision 4).
 */
export function answerOf<T>(asked: Promise<T>, whenRejected: T): Promise<T> {
  return asked.then(
    value => value,
    () => whenRejected,
  )
}
