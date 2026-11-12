// Test helper: a promise that the test settles later. Concurrent cases order their steps with it,
// never with timers.
export type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}>

export function deferred<T>(): Deferred<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>()
  return { promise, resolve, reject }
}

/**
 * Lets every pending promise continuation run: one turn of the event loop, after which the
 * microtask queue is empty. It orders steps; it is not a wait for time.
 */
export function settled(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve))
}
