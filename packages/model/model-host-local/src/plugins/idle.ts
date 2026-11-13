// Waiting for a set of tasks to run empty, without a timer: each round waits for the tasks that run
// now, and a task that ends may start the next one, so the set is read again after every round.

/**
 * Resolves when `tasks` is empty, or when `signal` aborts. The answer is the number of tasks that
 * still run: 0 after the set ran empty. The tasks must not reject.
 */
export async function whenEmpty(
  tasks: ReadonlyMap<unknown, Promise<unknown>>,
  signal: AbortSignal,
): Promise<number> {
  let release = () => {}
  const aborted = new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    const abort = () => resolve()
    signal.addEventListener('abort', abort, { once: true })
    release = () => signal.removeEventListener('abort', abort)
  })
  try {
    while (!signal.aborted && tasks.size > 0)
      await Promise.race([Promise.allSettled(tasks.values()), aborted])
    return tasks.size
  } finally {
    release()
  }
}
