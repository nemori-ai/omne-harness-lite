/** Tracks admitted operations through their last await, including authority and source calls. */
export function createContextWork() {
  let accepting = true
  const jobs = new Set<Promise<unknown>>()
  return {
    active: () => accepting,
    closeAdmission() {
      accepting = false
    },
    run<T>(operation: () => Promise<T>, stopped: () => T): Promise<T> {
      if (!accepting) return Promise.resolve(stopped())
      // Invoke now: admission and task registration have no intervening await.
      let task: Promise<T>
      try {
        task = operation()
      } catch (error) {
        task = Promise.reject(error)
      }
      jobs.add(task)
      const complete = () => {
        jobs.delete(task)
      }
      void task.then(complete, complete)
      return task
    },
    async drain() {
      while (jobs.size) await Promise.allSettled([...jobs])
    },
  }
}
