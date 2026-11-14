const LIMIT_MS = 1000

export class StalledWaitError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} did not settle within ${ms} ms`)
    this.name = 'StalledWaitError'
  }
}

export function within<T>(promise: PromiseLike<T>, label: string, ms = LIMIT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StalledWaitError(label, ms)), ms)
  })
  return Promise.race([Promise.resolve(promise), stalled]).finally(() => clearTimeout(timer))
}
