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

/** Lets every pending microtask and promise continuation run once. */
export async function settled(): Promise<void> {
  for (let round = 0; round < 8; round += 1) await Promise.resolve()
}
