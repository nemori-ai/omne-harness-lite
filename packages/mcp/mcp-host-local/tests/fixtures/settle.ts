export const SETTLE_BOUND_MS = 1_000

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
