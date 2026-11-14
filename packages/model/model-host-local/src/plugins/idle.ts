// Resolves with the number of tasks still running (0 once empty) when `tasks` empties or `signal`
// aborts. The tasks must not reject.
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
