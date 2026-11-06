// A bound on how long a governed wait may take to settle. A wait that the request's signal or
// `close()` governs settles within a few event-loop turns; one second is far above the
// scheduling noise of a loaded machine and far below the slow-tier limit, so a case that hits
// the bound fails for its own reason, not by timeout.
export const SETTLE_BOUND_MS = 1_000

/** The value `promise` settled with, or `pending` when it had not settled within the bound. */
export async function settledWithin<T>(
  promise: Promise<T>,
  bound = SETTLE_BOUND_MS,
): Promise<Readonly<{ settled: T }> | 'pending'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<'pending'>(resolve => {
    timer = setTimeout(() => resolve('pending'), bound)
  })
  try {
    return await Promise.race([promise.then(settled => ({ settled })), late])
  } finally {
    clearTimeout(timer)
  }
}
